const express = require("express");
const router = express.Router();
const User = require("../models/User");
const redis = require("../utils/redis"); // ioredis client
const crypto = require("crypto");
const nodemailer = require("nodemailer");

/**
 * Helper: Send email OTP using nodemailer
 */
async function sendEmailOTP(to, otp) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER, // Gmail address
        pass: process.env.EMAIL_PASS, // Gmail app password
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject: "Your Verification OTP",
      text: `Your OTP is ${otp}. It will expire in 5 minutes.`,
    });

    console.log(`📩 Email OTP sent to ${to}: ${otp}`);
  } catch (err) {
    console.error("❌ Failed to send email OTP:", err.message);
    throw new Error("Failed to send email");
  }
}

/**
 * Get all registered users
 */
router.get("/all", async (req, res) => {
  try {
    const users = await User.find();
    res.json({ users }); // send as { users: [...] }
  } catch (err) {
    console.error("❌ Error fetching users:", err);
    res.status(500).json({ error: "Server error" });
  }
});
// Get user by ID
router.get("/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({ user });
  } catch (err) {
    console.error("Error fetching user:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * STEP 1: Signup - generate OTPs, store in Redis
 */
router.post("/signup", async (req, res) => {
  try {
    const { firstName, lastName, email, mobile, loginId, password } = req.body;
    if (!email || !mobile) {
      return res.status(400).json({ error: "Email and mobile are required" });
    }

    const otpEmail = crypto.randomInt(100000, 999999).toString();
    const otpMobile = crypto.randomInt(100000, 999999).toString();

    const tempUser = {
      firstName,
      lastName,
      email,
      mobile,
      loginId,
      password,
      otpEmail,
      otpMobile,
      emailVerified: false,
      mobileVerified: false,
    };

    await redis.setex(`user:${email}`, 300, JSON.stringify(tempUser)); // 5 min expiry
   
    await redis.setex(`otp:email:${email}`, 300, otpEmail);
    await redis.setex(`otp:mobile:${mobile}`, 300, otpMobile);

    // Send only email OTP (real), log mobile OTP
    await sendEmailOTP(email, otpEmail);
    console.log(`📱 Mobile OTP for ${mobile}: ${otpMobile}`);

    return res.json({
      message: "OTP generated (check console/response)",
      emailOTP: otpEmail,
      mobileOTP: otpMobile, // demo only
    });
  } catch (err) {
    console.error("❌ Signup error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * RESEND OTP (Email + Mobile)
 */
router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const redisData = await redis.get(`user:${email}`);
    if (!redisData) {
      return res.status(404).json({ error: "User not found or OTP expired" });
    }

    const userData = JSON.parse(redisData);

    const newEmailOTP = crypto.randomInt(100000, 999999).toString();
    const newMobileOTP = crypto.randomInt(100000, 999999).toString();

    userData.otpEmail = newEmailOTP;
    userData.otpMobile = newMobileOTP;

    await redis.setex(`user:${email}`, 300, JSON.stringify(userData));

    await redis.setex(`otp:email:${email}`, 300, newEmailOTP);
    await redis.setex(`otp:mobile:${userData.mobile}`, 300, newMobileOTP);

    await sendEmailOTP(email, newEmailOTP);
    console.log(`📱 Resent Mobile OTP for ${userData.mobile}: ${newMobileOTP}`);

    return res.json({
      message: "New OTPs generated (check console/response)",
      emailOTP: newEmailOTP,
      mobileOTP: newMobileOTP, // demo only
    });
  } catch (err) {
    console.error("❌ Resend OTP error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * STEP 2: Verify Email OTP
 */
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required" });
    }

    // 1) Check OTP key (canonical)
    const savedOtp = await redis.get(`otp:email:${email}`);
    if (!savedOtp) return res.status(400).json({ error: "Email OTP expired or not found" });
    if (savedOtp !== otp) return res.status(400).json({ error: "Invalid Email OTP" });

    // 2) Mark verified in temp user
    const redisData = await redis.get(`user:${email}`);
    if (!redisData) return res.status(404).json({ error: "User not found or expired" });

    const userData = JSON.parse(redisData);
    userData.emailVerified = true;

    // refresh temp user TTL (optional)
    await redis.setex(`user:${email}`, 300, JSON.stringify(userData));

    // 3) delete used OTP key
    await redis.del(`otp:email:${email}`);

    return res.json({ message: "Email OTP verified", emailVerified: true });
  } catch (err) {
    console.error("❌ Verify Email OTP error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


/**
 * STEP 2b: Verify Mobile OTP
 */
router.post("/verify-mobile-otp", async (req, res) => {
  try {
    const { email, mobile, otp } = req.body;
    if (!email || !mobile || !otp) {
      return res.status(400).json({ error: "Email, mobile and OTP are required" });
    }

    // 1) Check mobile OTP key
    const savedOtp = await redis.get(`otp:mobile:${mobile}`);
    if (!savedOtp) return res.status(400).json({ error: "Mobile OTP expired or not found" });
    if (savedOtp !== otp) return res.status(400).json({ error: "Invalid Mobile OTP" });

    // 2) Mark verified in temp user
    const redisData = await redis.get(`user:${email}`);
    if (!redisData) return res.status(404).json({ error: "User not found or expired" });

    const userData = JSON.parse(redisData);
    userData.mobileVerified = true;
    await redis.setex(`user:${email}`, 300, JSON.stringify(userData));

    // 3) delete used otp
    await redis.del(`otp:mobile:${mobile}`);

    return res.json({ message: "Mobile OTP verified", mobileVerified: true });
  } catch (err) {
    console.error("❌ Verify Mobile OTP error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


/**
 * STEP 3: Final Registration
 */
router.post("/add", async (req, res) => {
  try {
    const { email, socketId } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const redisData = await redis.get(`user:${email}`);
    if (!redisData) return res.status(404).json({ error: "User data expired" });

    const userData = JSON.parse(redisData);
    if (!userData.emailVerified || !userData.mobileVerified) {
      return res.status(400).json({ error: "Email or Mobile OTP not verified" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "User already registered" });
    }

    const newUser = new User({
      firstName: userData.firstName,
      lastName: userData.lastName,
      mobile: userData.mobile,
      email: userData.email,
      loginId: userData.loginId,  
      password: userData.password, 
    });
    await newUser.save();

    await redis.del(`user:${email}`);
    await redis.del(`otp:email:${email}`);
    await redis.del(`otp:mobile:${userData.mobile}`);


    // socket.io handling (live users)
    const io = req.app.get("io");
    if (socketId && io) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.join("live users");
        const liveUsers = req.app.locals.liveUsers || [];
        const name = `${newUser.firstName || ""} ${newUser.lastName || ""}`.trim();
        liveUsers.push({
          userId: newUser._id.toString(),
          socketId,
          email: newUser.email,
          name,
        });
        req.app.locals.liveUsers = liveUsers.filter(
          (u, i, self) => i === self.findIndex((t) => t.socketId === u.socketId)
        );
        io.to("live users").emit("liveUsersUpdate", req.app.locals.liveUsers);
      }
    }

    res.json({ message: "✅ User registered successfully", user: newUser });
  } catch (err) {
    console.error("❌ Final Registration error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * LOGIN
 */
router.post("/login", async (req, res) => {
  const { loginId, password } = req.body;
  try {
    const user = await User.findOne({ loginId });
    if (!user) return res.status(400).json({ message: "User not found" });
    if (user.password !== password) return res.status(400).json({ message: "Invalid password" });

    res.json({ message: "Login success", user });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
