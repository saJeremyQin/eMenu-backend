const mongoose = require('mongoose');

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

const DishType = mongoose.model('DishType', dishTypeSchema);

module.exports = DishType;
