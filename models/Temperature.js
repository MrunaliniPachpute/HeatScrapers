const mongoose = require("mongoose");

const temperatureSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  temperature: {
    type: Number,
    required: true,
  },
  date: {
    type: String,   // store YYYY-MM-DD
    required: true,
  },
  points: {
    type: Number,
    default: 1
  }
});

module.exports = mongoose.model("Temperature", temperatureSchema);
