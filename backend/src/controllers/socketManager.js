import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import userRoutes from "./routes/users.routes.js";

// Load environment variables
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

/* ================= SOCKET.IO LOGIC ================= */
const io = new Server(server, {
    cors: {
        origin: "*", // Adjust this to your frontend URL for better security
        methods: ["GET", "POST"],
    },
});

let connections = {};
let messages = {};
let timeOnline = {};

io.on("connection", (socket) => {
    console.log("🟢 User connected:", socket.id);

    socket.on("join-call", (path) => {
        // Initialize room if it doesn't exist
        if (connections[path] === undefined) {
            connections[path] = [];
        }
        
        // Add user to our tracking object and join the Socket.io Room
        connections[path].push(socket.id);
        timeOnline[socket.id] = new Date();
        socket.join(path);

        console.log(`User ${socket.id} joined room: ${path}`);

        // Notify everyone in the room (including the new user)
        io.to(path).emit("user-joined", socket.id, connections[path]);

        // Send existing chat history to the new user
        if (messages[path] !== undefined) {
            messages[path].forEach((msg) => {
                io.to(socket.id).emit("chat-message", msg.data, msg.sender, msg['socket-id-sender']);
            });
        }
    });

    socket.on("signal", (toId, message) => {
        // Direct signaling for WebRTC handshake
        io.to(toId).emit("signal", socket.id, message);
    });

    socket.on("chat-message", (data, sender) => {
        // Find which room the socket belongs to
        const matchingRoom = Object.keys(connections).find(room => 
            connections[room].includes(socket.id)
        );

        if (matchingRoom) {
            if (messages[matchingRoom] === undefined) {
                messages[matchingRoom] = [];
            }

            const newMessage = { 
                sender: sender, 
                data: data, 
                "socket-id-sender": socket.id 
            };
            
            messages[matchingRoom].push(newMessage);
            
            // Emit to everyone in that specific room
            io.to(matchingRoom).emit("chat-message", data, sender, socket.id);
        }
    });

    socket.on("disconnect", () => {
        console.log("🔴 User disconnected:", socket.id);
        
        // Clean up connections and notify others
        for (const room in connections) {
            const index = connections[room].indexOf(socket.id);
            if (index !== -1) {
                connections[room].splice(index, 1);
                
                // Tell others in the room this user left
                io.to(room).emit("user-left", socket.id);

                if (connections[room].length === 0) {
                    delete connections[room];
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