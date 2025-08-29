require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // <-- allow form-urlencoded too if needed
app.use(express.static(path.join(__dirname, "public")));

// Local in-memory store for live users
app.locals.liveUsers = [];

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI;
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Routes
const userRoutes = require("./routes/user");
app.use("/api/users", userRoutes);

// debug route to inspect sockets (optional)
app.get('/debug/live-sockets', async (req, res) => {
  const sockets = await io.in('live users').allSockets();
  res.json({ sockets: Array.from(sockets), liveUsers: app.locals.liveUsers });
});
// Default route - always show login first
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));

// Route for register page
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// Route for view page (after login)
app.get("/view", (req, res) => res.sendFile(path.join(__dirname, "public", "view.html")));


app.set("io", io);

// socket.io connection/disconnect handling
io.on("connection", (socket) => {
  console.log("🔌 User connected:", socket.id);

 // Listen for joinLiveUsers event
  socket.on("joinLiveUsers", (data) => {
    socket.join("live users");
    const { email, name, userId } = data;

    // Keep track of live users
    const liveUsers = app.locals.liveUsers || [];
    liveUsers.push({
      socketId: socket.id,
      email,
      name,
      userId
    });
    app.locals.liveUsers = liveUsers.filter(
      (u, i, self) => i === self.findIndex(t => t.socketId === u.socketId)
    );

    // Broadcast updated users list
    io.to("live users").emit("liveUsersUpdate", app.locals.liveUsers);
    console.log("✅ Live Users Updated:", app.locals.liveUsers);
  });

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);

    // remove from liveUsers
    app.locals.liveUsers = app.locals.liveUsers.filter(u => u.socketId !== socket.id);

    // broadcast updated live users list to remaining members
    io.to("live users").emit("liveUsersUpdate", app.locals.liveUsers);
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
