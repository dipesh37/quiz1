// Test MongoDB connection
require("dotenv").config();
const mongoose = require("mongoose");

console.log("🔍 Testing MongoDB connection...");
console.log("📍 MONGO_URI exists:", !!process.env.MONGO_URI);
console.log("📍 MONGO_URI length:", process.env.MONGO_URI?.length || 0);

if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI not found in environment variables");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 10000,
  })
  .then(() => {
    console.log("✅ MongoDB connection successful!");
    console.log("📊 Database:", mongoose.connection.name);
    console.log("🏠 Host:", mongoose.connection.host);
    console.log("🔌 Port:", mongoose.connection.port);
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:");
    console.error("📝 Error message:", err.message);
    console.error("🔍 Error code:", err.code);
    process.exit(1);
  });

setTimeout(() => {
  console.error("⏰ Connection timeout after 15 seconds");
  process.exit(1);
}, 15000);
