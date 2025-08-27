const express = require("express");
const router = express.Router();
const User = require("../models/User");

// Save user
router.post("/add", async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    res.json({ message: "User saved successfully", user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all users
router.get("/list", async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
