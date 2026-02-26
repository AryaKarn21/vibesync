import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import userRoutes from "./routes/users.routes.js";

// 🔥 Load environment variables
dotenv.config();

const app = express();

/* ================= MIDDLEWARE ================= */
app.use(cors({
    origin: ["http://localhost:3000","https://vibesyncfrontend.onrender.com"], // Change this to your frontend URL when you deploy
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api/v1/users", userRoutes);
/* ================= DATABASE CONNECTION ================= */

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB Connected");
  })
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
  });

/* ================= TEST ROUTE ================= */

app.get("/", (req, res) => {
  res.send("🚀 Server is running...");
});

/* ================= ROUTES ================= */

// Example:
// import authRoutes from "./routes/auth.routes.js";
// app.use("/api/auth", authRoutes);

/* ================= SERVER + SOCKET ================= */

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
  });
});

/* ================= START SERVER ================= */

const PORT = process.env.PORT || 8000;

server.listen(PORT, () => {
  console.log(`🔥 Server listening on port ${PORT}`);
});
