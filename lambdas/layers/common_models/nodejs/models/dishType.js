import mongoose from "mongoose";

const dishTypeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true
    },
    alias: {
      type: String
    }
  },{
    timestamps: true,
    toJSON: {
      virtuals: true,                 // add virtual field（id）
      versionKey: false,              // remove __v field
      transform: (_, ret) => {
        ret.id = ret._id.toString();  // map _id -> id
        delete ret._id;               // delete _id，avoid duplication
      }
    }
  }
);

const DishType = mongoose.models.DishType || mongoose.model('DishType', dishTypeSchema);

export default DishType;
