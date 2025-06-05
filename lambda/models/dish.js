// Require the mongoose library
const mongoose = require('mongoose');

const dishSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true
        },
        description:{
            type: String,
        },
        type: {
            type: String,
            required: true
        },
        price: {
            type: Number,
            required: true
        },
        image:{
            type: String
        }
    },
    {
        timestamps: true
    }
);

const Dish = mongoose.model('Dish',dishSchema);

module.exports = Dish;