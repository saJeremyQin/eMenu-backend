// Smoke test for buildS3AndProcessedKeys
(async function(){
  try {
    const mod = await import('./index.js');
    const { buildS3AndProcessedKeys } = mod;

    const examples = [
      { imageType: 'restaurant-logo', userSub: '196ef448-80f1-7044-d940-1eaec08ae49a', uniqueFileName: 'abc.png', fileId: 'abc' },
      { imageType: 'dish-image', userSub: '196ef448-80f1-7044-d940-1eaec08ae49a', uniqueFileName: 'def.PNG', fileId: 'def' }
    ];

    for (const e of examples) {
      console.log('Input:', e);
      console.log('Output:', JSON.stringify(buildS3AndProcessedKeys(e), null, 2));
      console.log('---');
    }
  } catch (err) {
    console.error('Test failed:', err);
    process.exitCode = 2;
  }
})();
