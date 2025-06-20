// Require the mongoose library
import mongoose from "mongoose";

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

const Dish = mongoose.models.Dish || mongoose.model('Dish',dishSchema);

export default Dish;