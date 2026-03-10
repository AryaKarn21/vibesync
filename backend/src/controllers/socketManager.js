import { Server } from "socket.io";

let connections = {};
let messages = {};
let timeOnline = {};

export const connectToSocket = (server) => {

    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
        }
    });

    io.on("connection", (socket) => {

        console.log("🟢 Socket connected:", socket.id);

        /* ===== JOIN CALL ===== */

        socket.on("join-call", (room) => {

            console.log("JOIN CALL:", room);

            if (!connections[room]) {
                connections[room] = [];
            }

            connections[room].push(socket.id);

            socket.join(room);
            socket.room = room;

            timeOnline[socket.id] = new Date();

            // notify others
            socket.to(room).emit("user-joined", socket.id, connections[room]);

            // send previous messages
            if (messages[room]) {
                messages[room].forEach(msg => {
                    socket.emit(
                        "chat-message",
                        msg.data,
                        msg.sender,
                        msg.socketId
                    );
                });
            }

        });

        /* ===== SIGNAL ===== */

        socket.on("signal", (toId, message) => {
            io.to(toId).emit("signal", socket.id, message);
        });

        /* ===== CHAT ===== */

        socket.on("chat-message", (data, sender) => {

            const room = socket.room;
            if (!room) return;

            if (!messages[room]) {
                messages[room] = [];
            }

            messages[room].push({
                sender,
                data,
                socketId: socket.id
            });

            io.to(room).emit("chat-message", data, sender, socket.id);

        });

        /* ===== DISCONNECT ===== */

        socket.on("disconnect", () => {

            console.log("🔴 Socket disconnected:", socket.id);

            const room = socket.room;

            if (room && connections[room]) {

                connections[room] =
                    connections[room].filter(id => id !== socket.id);

                socket.to(room).emit("user-left", socket.id);

                if (connections[room].length === 0) {
                    delete connections[room];
                    delete messages[room];
                }
            }

            delete timeOnline[socket.id];

        });

    });

    return io;
};