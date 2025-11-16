#!/usr/bin/env node
/*
 Migration script: rename `image` -> `imageUrl` for selected collections.

 Usage:
   # install dependency if needed
   cd eMenu-backend
   npm install mongodb

   # dry run (shows counts and a few sample docs)
   node scripts/migrate_image_to_imageUrl.js --uri "$MONGODB_URI" --dry-run

   # perform migration
   node scripts/migrate_image_to_imageUrl.js --uri "$MONGODB_URI"

 Options
   --uri <mongodb-uri>     MongoDB connection string. If omitted, will read MONGODB_URI env var.
   --collections csv       Comma-separated collection names (default: restaurants,dishes)
   --dry-run               Don't modify data; just report what would change
   --limit <n>             Limit number of documents to process per collection (for testing).
   --force                 Overwrite imageUrl even when it already exists.

 Notes
 - This script updates each document individually using updateOne, so it is compatible with older MongoDB versions.
 - Recommended: run with --dry-run first, and create a DB backup before running without dry-run.
*/

const { MongoClient } = require('mongodb');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--uri') { out.uri = args[++i]; }
    else if (a === '--dry-run') { out.dryRun = true; }
    else if (a === '--collections') { out.collections = args[++i]; }
    else if (a === '--limit') { out.limit = Number(args[++i]); }
    else if (a === '--force') { out.force = true; }
    else if (a === '--help' || a === '-h') { out.help = true; }
  }
  return out;
}

async function migrateCollection(db, collName, options) {
  const coll = db.collection(collName);
  const filterBase = { image: { $exists: true } };
  const filter = options.force
    ? filterBase
    : { $and: [filterBase, { $or: [ { imageUrl: { $exists: false } }, { imageUrl: null } ] } ] };

  const total = await coll.countDocuments(filter);
  console.log(`Collection ${collName}: documents to update = ${total}`);
  if (total === 0) return { processed: 0, samples: [] };

  const cursor = coll.find(filter).sort({ _id: 1 });
  if (options.limit && options.limit > 0) cursor.limit(options.limit);

  const samples = [];
  let processed = 0;
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    if (samples.length < 3) samples.push({ _id: doc._id, image: doc.image, imageUrl: doc.imageUrl });

    if (options.dryRun) {
      processed++;
      continue;
    }

    // Build update
    const update = { $set: { imageUrl: doc.image }, $unset: { image: "" } };
    if (!options.force) {
      // only set imageUrl if it's missing or null; otherwise skip doc
      if (doc.imageUrl !== undefined && doc.imageUrl !== null) {
        console.log(`Skipping ${collName} ${doc._id}: existing imageUrl present`);
        processed++;
        continue;
      }
    }

    const res = await coll.updateOne({ _id: doc._id }, update);
    if (res.matchedCount !== 1) {
      console.warn(`WARN: failed to match document ${doc._id} in ${collName}`);
    }
    processed++;
  }

  return { processed, samples };
}

(async function main() {
  try {
    const argv = parseArgs();
    if (argv.help) {
      console.log('See header comments for usage');
      process.exit(0);
    }
    const uri = argv.uri || process.env.MONGODB_URI;
    if (!uri) {
      console.error('ERROR: MongoDB URI is required. Provide via --uri or MONGODB_URI env var.');
      process.exit(2);
    }

    const collections = (argv.collections || 'restaurants,dishes').split(',').map(s => s.trim()).filter(Boolean);
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    const dbName = client.db().databaseName;
    console.log(`Connected to ${dbName}`);
    const db = client.db();

    for (const collName of collections) {
      console.log('---');
      console.log(`Processing collection: ${collName}`);
      const result = await migrateCollection(db, collName, { dryRun: !!argv.dryRun, limit: argv.limit, force: !!argv.force });
      console.log(`Processed ${result.processed} documents in ${collName}`);
      if (result.samples && result.samples.length) {
        console.log('Sample documents (first few):');
        console.table(result.samples);
      }
    }

    console.log('Migration finished.');
    await client.close();
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
})();
