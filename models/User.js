const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  mobile: { 
    type: String, 
    required: true, 
    match: /^[0-9]{10}$/ 
  },
  email: { 
    type: String, 
    required: true, 
    match: /^\S+@\S+\.\S+$/ 
  },
  loginId: { 
    type: String, 
    required: true, 
    match: /^[a-zA-Z0-9]{8}$/ 
  },
  password: { 
    type: String, 
    required: true, 
    match: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\W).{6,}$/ 
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

userSchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("User", userSchema);
