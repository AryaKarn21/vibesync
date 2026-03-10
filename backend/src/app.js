import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import userRoutes from "./routes/users.routes.js";

dotenv.config();

/* ================= APP SETUP ================= */

const app = express();
const server = http.createServer(app);

/* ================= MIDDLEWARE ================= */

app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://vibesyncfrontend.onrender.com"
  ],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/v1/users", userRoutes);

/* ================= DATABASE ================= */

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("✅ MongoDB Connected"))
.catch((err) => console.error("❌ MongoDB Connection Error:", err));

/* ================= TEST ROUTE ================= */

app.get("/", (req, res) => {
  res.send("🚀 MeetNow server is running...");
});

/* ================= SOCKET.IO ================= */

const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://vibesyncfrontend.onrender.com"
    ],
    methods: ["GET", "POST"]
  }
});

/* ================= MEMORY STORAGE ================= */

const rooms = {};
const messages = {};
const timeOnline = {};

/* ================= SOCKET EVENTS ================= */

io.on("connection", (socket) => {

  console.log("🟢 User connected:", socket.id);

  /* ===== JOIN CALL ===== */

  socket.on("join-call", (room) => {

    if (!rooms[room]) rooms[room] = [];

    if (!rooms[room].includes(socket.id)) {
      rooms[room].push(socket.id);
    }

    socket.join(room);
    socket.room = room;

    timeOnline[socket.id] = new Date();

    console.log(`📞 ${socket.id} joined room ${room}`);

    // Notify others
    socket.to(room).emit("user-joined", socket.id, rooms[room]);

    // Send existing users to new user
    socket.emit("room-users", rooms[room]);

    // Send chat history
    if (messages[room]) {
      messages[room].forEach(msg => {
        socket.emit("chat-message", msg.data, msg.sender, msg.socketId);
      });
    }

  });

  /* ===== WEBRTC SIGNAL ===== */

  socket.on("signal", (toId, message) => {
    io.to(toId).emit("signal", socket.id, message);
  });

  /* ===== CHAT MESSAGE ===== */

  socket.on("chat-message", (data, sender) => {

    const room = socket.room;
    if (!room || !rooms[room]) return;

    if (!messages[room]) messages[room] = [];

    const messageData = {
      sender,
      data,
      socketId: socket.id
    };

    messages[room].push(messageData);

    // keep last 100 messages only
    messages[room] = messages[room].slice(-100);

    io.to(room).emit("chat-message", data, sender, socket.id);

  });

  /* ===== MEDIA ACTION (Mute / Video Toggle) ===== */

  socket.on("action", (actionType, value) => {

    const room = socket.room;
    if (!room || !rooms[room]) return;

    socket.to(room).emit("action-received", socket.id, actionType, value);

    console.log(`🎬 ${actionType} from ${socket.id} = ${value}`);

  });

  /* ===== DISCONNECT ===== */

  socket.on("disconnect", () => {

    console.log("🔴 User disconnected:", socket.id);

    const room = socket.room;

    if (room && rooms[room]) {

      rooms[room] = rooms[room].filter(id => id !== socket.id);

      socket.to(room).emit("user-left", socket.id);

      if (rooms[room].length === 0) {
        delete rooms[room];
        delete messages[room];
      }
    }

    if (timeOnline[socket.id]) {
      const duration = (new Date() - timeOnline[socket.id]) / 1000;
      console.log(`⏱️ User stayed ${duration}s`);
    }

    delete timeOnline[socket.id];

  });

});

/* ================= SERVER ================= */

const PORT = process.env.PORT || 8000;

server.listen(PORT, () => {
  console.log(`🔥 Server running on port ${PORT}`);
});