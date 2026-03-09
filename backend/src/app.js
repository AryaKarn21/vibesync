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
const server = http.createServer(app);

/* ================= MIDDLEWARE ================= */
app.use(cors({
    origin: ["http://localhost:3000", "https://vibesyncfrontend.onrender.com"],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api/v1/users", userRoutes);

/* ================= DATABASE CONNECTION ================= */
mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch((err) => console.error("❌ MongoDB Connection Error:", err));

/* ================= TEST ROUTE ================= */
app.get("/", (req, res) => {
    res.send("🚀 Vibesync Server is running...");
});

/* ================= SERVER + SOCKET LOGIC ================= */
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});

let connections = {};
let messages = {};
let timeOnline = {};

io.on("connection", (socket) => {
    console.log("🟢 User connected:", socket.id);

    // 1. JOIN CALL LOGIC
    socket.on("join-call", (path) => {
        if (connections[path] === undefined) {
            connections[path] = [];
        }
        connections[path].push(socket.id);
        timeOnline[socket.id] = new Date();

        // Join a Socket.io room for easier broadcasting
        socket.join(path);

        console.log(`User ${socket.id} joined room ${path}`);

        // Notify everyone in the room
        connections[path].forEach((id) => {
            io.to(id).emit("user-joined", socket.id, connections[path]);
        });

        // Send existing chat history to the new user
        if (messages[path] !== undefined) {
            messages[path].forEach((msg) => {
                io.to(socket.id).emit("chat-message", msg.data, msg.sender, msg['socket-id-sender']);
            });
        }
    });

    // 2. SIGNALING LOGIC (For Video/Audio)
    socket.on("signal", (toId, message) => {
        io.to(toId).emit("signal", socket.id, message);
    });

    // 3. CHAT MESSAGE LOGIC
    socket.on("chat-message", (data, sender) => {
        // Find which room the sender belongs to
        const [matchingRoom, found] = Object.entries(connections)
            .reduce(([room, isFound], [roomKey, roomValue]) => {
                if (!isFound && roomValue.includes(socket.id)) {
                    return [roomKey, true];
                }
                return [room, isFound];
            }, ['', false]);

        if (found) {
            if (messages[matchingRoom] === undefined) {
                messages[matchingRoom] = [];
            }

            messages[matchingRoom].push({ 
                'sender': sender, 
                "data": data, 
                "socket-id-sender": socket.id 
            });

            console.log("New message in", matchingRoom, ":", sender, data);

            // Broadcast to everyone in that room
            io.to(matchingRoom).emit("chat-message", data, sender, socket.id);
        }
    });

    // 4. DISCONNECT LOGIC
    socket.on("disconnect", () => {
        console.log("🔴 User disconnected:", socket.id);

        for (const key in connections) {
            const index = connections[key].indexOf(socket.id);
            if (index !== -1) {
                // Notify others in the room
                connections[key].forEach((id) => {
                    io.to(id).emit('user-left', socket.id);
                });

                connections[key].splice(index, 1);

                if (connections[key].length === 0) {
                    delete connections[key];
                }
            }
        }
        delete timeOnline[socket.id];
    });
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
    console.log(`🔥 Server listening on port ${PORT}`);
});