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
  },
  {
    timestamps: true
  }
);

const DishType = mongoose.models.DishType || mongoose.model('DishType', dishTypeSchema);

export default DishType;
