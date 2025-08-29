const express = require("express");
const router = express.Router();
const User = require("../models/User"); // your mongoose model

/**
 * Save a new user and (if socketId provided) join them to "live users" room
 */
router.post("/add", async (req, res) => {
  try {
    const data = req.body || {};

    // Save user
    const newUser = new User(data);
    await newUser.save();

    // Try to join socket (if client provided socketId)
    const io = req.app.get("io");
    const socketId = data.socketId;
    const email = data.email;
    const firstName = data.firstName || data.first || "";
    const lastName = data.lastName || data.last || "";
    const name = `${firstName} ${lastName}`.trim();

    if (socketId && io) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.join("live users");

        // ensure app.locals.liveUsers exists
        const liveUsers = req.app.locals.liveUsers || [];

        // push with userId
        liveUsers.push({
          userId: newUser._id.toString(),
          socketId,
          email,
          name,
        });

        // dedupe by socketId
        req.app.locals.liveUsers = liveUsers.filter(
          (u, i, self) => i === self.findIndex((t) => t.socketId === u.socketId)
        );

        // broadcast the updated list to the room
        io.to("live users").emit("liveUsersUpdate", req.app.locals.liveUsers);
        console.log("✅ Joined live users (via /add):", socketId, email, name);
      } else {
        console.warn("⚠️  /add: socket not found for socketId:", socketId);
      }
    }

    res.json({ message: "User saved", user: newUser });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Explicit join room endpoint (client can call if needed)
 * Body: { socketId, email, name }
 */
router.post("/joinRoom", (req, res) => {
  const { socketId, email, name } = req.body || {};
  const io = req.app.get("io");

  if (!socketId) return res.status(400).json({ error: "socketId is required" });

  const socket = io.sockets.sockets.get(socketId);
  if (!socket) return res.status(404).json({ error: "Socket not found" });

  socket.join("live users");

  const liveUsers = req.app.locals.liveUsers || [];
  liveUsers.push({ socketId, email, name });
  req.app.locals.liveUsers = liveUsers.filter(
    (u, i, self) => i === self.findIndex((t) => t.socketId === u.socketId)
  );

  io.to("live users").emit("liveUsersUpdate", req.app.locals.liveUsers);
  console.log("✅ Live Users:", req.app.locals.liveUsers);

  res.json({ message: "joined live users room", liveUsers: req.app.locals.liveUsers });
});

/**
 * Return current in-memory live users
 */
router.get("/liveUsers", (req, res) => {
  res.json({ liveUsers: req.app.locals.liveUsers || [] });
});
/**
 * Get ALL registered users
 */
router.get("/all", async (_req, res) => {
  try {
    const users = await User.find({}).lean();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
/**
 * Get full user detail by MongoDB id (used by frontend when clicking an entry)
 */
router.get("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const user = await User.findById(id).lean();
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Login existing user (email + password)
 * After login, join them into "live users" room and broadcast online users.
 */
router.post("/login", async (req, res) => {
  const { email, password, socketId } = req.body || {};
  try {
    const user = await User.findOne({ email, password }).lean();
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const io = req.app.get("io");
    if (socketId && io) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.join("live users");

        const liveUsers = req.app.locals.liveUsers || [];
        const name = `${user.firstName || ""} ${user.lastName || ""}`.trim();

        liveUsers.push({
          userId: user._id.toString(),
          socketId,
          email: user.email,
          name,
        });

        // remove duplicates by socketId
        req.app.locals.liveUsers = liveUsers.filter(
          (u, i, self) => i === self.findIndex((t) => t.socketId === u.socketId)
        );

        io.to("live users").emit("liveUsersUpdate", req.app.locals.liveUsers);
        console.log("✅ Login joined live users:", socketId, email, name);
      }
    }

    res.json({ message: "Login successful", user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
