const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const path = require("path");

console.log(" Starting NITJ Quiz Application...");
console.log(" Loading dependencies...");

const app = express();

console.log("⚙️ Setting up middleware...");

app.use(cors());

app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

console.log("🔄 Attempting to connect to MongoDB...");
console.log("📍 MongoDB URI exists:", !!process.env.MONGO_URI);

if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI environment variable is not set!");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 10000, // 10 second timeout
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  })
  .then(() => {
    console.log(" MongoDB connected successfully");
    console.log(" Database name:", mongoose.connection.name);
  })
  .catch((err) => {
    console.error(" MongoDB connection error:", err.message);
    console.error(" Full error:", err);
    // Don't exit immediately, let the server start and retry connection
    setTimeout(() => {
      console.log("🔄 Retrying MongoDB connection...");
      mongoose.connect(process.env.MONGO_URI);
    }, 5000);
  });

// Handle MongoDB connection events
mongoose.connection.on("connected", () => {
  console.log("✅ Mongoose connected to MongoDB");
});

mongoose.connection.on("error", (err) => {
  console.error("❌ Mongoose connection error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.log("⚠️ Mongoose disconnected from MongoDB");
});

//  Mongoose Schema with additional validation
const submissionSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true, // Prevent duplicate submissions
    lowercase: true,
    trim: true,
    match: [/^[a-zA-Z0-9._%+-]+@nitj\.ac\.in$/, "Invalid NITJ email format"],
  },
  answer: {
    type: String,
    required: [true, "Answer is required"],
    trim: true,
    minlength: [10, "Answer must be at least 10 characters long"],
    maxlength: [2000, "Answer cannot exceed 2000 characters"],
  },
  submittedAt: {
    type: Date,
    default: Date.now,
  },
  ipAddress: {
    type: String,
    default: null,
  },
});

// Add index for faster queries
submissionSchema.index({ email: 1 });
submissionSchema.index({ submittedAt: -1 });

const Submission = mongoose.model("Submission", submissionSchema);

app.get("/", (req, res) => {
  res.json({
    message: "🎉 NITJ Quiz Backend is running!",
    timestamp: new Date().toISOString(),
    status: "healthy",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    message: "🎉 Quiz backend is running!",
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

// Submit quiz route with validation
app.post("/submit", async (req, res) => {
  const { email, answer } = req.body;

  // Input validation
  if (!email || !answer) {
    return res.status(400).json({
      success: false,
      message: "❌ Email and answer are required",
    });
  }

  if (!email.endsWith("@nitj.ac.in")) {
    return res.status(400).json({
      success: false,
      message: "❌ Please use a valid NITJ email address",
    });
  }

  if (answer.trim().length < 10) {
    return res.status(400).json({
      success: false,
      message: "❌ Answer must be at least 10 characters long",
    });
  }

  try {
    // Check if user already submitted
    const existingSubmission = await Submission.findOne({
      email: email.toLowerCase(),
    });
    if (existingSubmission) {
      return res.status(400).json({
        success: false,
        message: "❌ You have already submitted your answer",
      });
    }

    // Get client IP
    const clientIP =
      req.headers["x-forwarded-for"] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      (req.connection.socket ? req.connection.socket.remoteAddress : null);

    // Create new submission
    const submission = new Submission({
      email: email.toLowerCase(),
      answer: answer.trim(),
      ipAddress: clientIP,
    });

    await submission.save();

    console.log(` New submission from: ${email}`);

    res.status(200).json({
      success: true,
      message: " Submission successful! Thank you for participating.",
      submittedAt: submission.submittedAt,
    });
  } catch (err) {
    console.error("❌ Error during submission:", err);

    // Handle duplicate key error
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "❌ You have already submitted your answer",
      });
    }

    // Handle validation errors
    if (err.name === "ValidationError") {
      const errorMessages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({
        success: false,
        message: `❌ ${errorMessages.join(", ")}`,
      });
    }

    res.status(500).json({
      success: false,
      message: "❌ Server error. Please try again later.",
    });
  }
});

// ✅ Get all submissions (admin route - you might want to add authentication)
app.get("/admin/submissions", async (req, res) => {
  try {
    const submissions = await Submission.find({})
      .sort({ submittedAt: -1 })
      .select("-__v"); // Exclude version field

    res.json({
      success: true,
      count: submissions.length,
      submissions: submissions,
    });
  } catch (err) {
    console.error("❌ Error fetching submissions:", err);
    res.status(500).json({
      success: false,
      message: "❌ Error fetching submissions",
    });
  }
});

// ✅ Delete submission (admin route)
app.delete("/admin/submissions/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const result = await Submission.deleteOne({ email: email.toLowerCase() });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "❌ Submission not found",
      });
    }

    res.json({
      success: true,
      message: "✅ Submission deleted successfully",
    });
  } catch (err) {
    console.error("❌ Error deleting submission:", err);
    res.status(500).json({
      success: false,
      message: "❌ Error deleting submission",
    });
  }
});

// ✅ Catch-All for Frontend Routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ✅ Error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({
    success: false,
    message: "❌ Internal server error",
  });
});

// ✅ Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Promise Rejection:", err);
  process.exit(1);
});

// ✅ Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  process.exit(1);
});

// ✅ Start server with port conflict handling
const PORT = process.env.PORT || 5000;

console.log("🚀 Starting server...");
console.log("📱 Port:", PORT);
console.log("🌐 Environment:", process.env.NODE_ENV || "development");

const server = app
  .listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server is running successfully!`);
    console.log(`📱 Port: ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`🔗 Local URL: http://localhost:${PORT}`);
  })
  .on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`❌ Port ${PORT} is already in use`);
      console.log(`💡 Try running: kill -9 $(lsof -ti :${PORT})`);
      console.log(`💡 Or use a different port: PORT=3001 npm run dev`);
      process.exit(1);
    } else {
      console.error("❌ Server error:", err);
      process.exit(1);
    }
  });

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received, shutting down gracefully...");
  server.close(() => {
    console.log("✅ Server closed");
    mongoose.connection.close(false, () => {
      console.log("✅ MongoDB connection closed");
      process.exit(0);
    });
  });
});

process.on("SIGINT", () => {
  console.log("🛑 SIGINT received, shutting down gracefully...");
  server.close(() => {
    console.log("✅ Server closed");
    mongoose.connection.close(false, () => {
      console.log("✅ MongoDB connection closed");
      process.exit(0);
    });
  });
});
