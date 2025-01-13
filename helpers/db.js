const mongoose = require("mongoose");

let isConnected = false;

const connectDB = async () => {
  if (isConnected) return mongoose.connection;
  await mongoose.connect("mongodb://localhost:27017/bull-test");
  isConnected = true;
  return mongoose.connection;
};

module.exports = { connectDB };