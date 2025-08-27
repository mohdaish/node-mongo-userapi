require("dotenv").config(); // for local .env
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));
// MongoDB connection
const MONGO_URI = process.env.MONGO_URI; // <-- Set this in .env (local) and in Render dashboard (cloud)

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Routes

const userRoutes = require("./routes/user");
app.use("/api/users", userRoutes);

// Default route
app.get("/", (req, res) => {
    res.send("API is running...");
});

// Listen on Render's assigned port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
