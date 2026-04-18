import React, { useEffect, useRef, useState } from 'react';
import io from "socket.io-client";
import {
    Badge, IconButton, TextField, Button, Grid, Paper, Typography, Box, CircularProgress, Snackbar, Alert
} from '@mui/material';
import {
    Videocam, VideocamOff, CallEnd, Mic, MicOff,
    ScreenShare, StopScreenShare, Chat, Send, ContentCopy
} from '@mui/icons-material';
import server from '../environment';

// Your updated peerConfig
const peerConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};

const VideoItem = ({ stream, name, isLocal = false, isScreen = false }) => {
    const ref = useRef();
    useEffect(() => {
        if (ref.current && stream) ref.current.srcObject = stream;
    }, [stream]);

    return (
        <Paper elevation={3} sx={{ position: 'relative', borderRadius: 2, overflow: 'hidden', bgcolor: "#000", aspectRatio: '16/9' }}>
            <video autoPlay playsInline muted={isLocal} ref={ref}
                style={{ 
                    width: "100%", height: "100%", objectFit: "cover", 
                    transform: (isLocal && !isScreen) ? "scaleX(-1)" : "none" 
                }}
            />
            <Box sx={{ position: "absolute", bottom: 8, left: 8, bgcolor: "rgba(0,0,0,0.6)", px: 1, borderRadius: 1 }}>
                <Typography variant="caption" sx={{ color: "white" }}>{name}</Typography>
            </Box>
        </Paper>
    );
};

export default function VideoMeetComponent() {
    const socketRef = useRef();
    const connections = useRef({});
    const localStreamRef = useRef();
    const localVideoRef = useRef();

    const [videos, setVideos] = useState([]);
    const [username, setUsername] = useState("");
    const [askUsername, setAskUsername] = useState(true);
    const [loading, setLoading] = useState(false);
    const [audio, setAudio] = useState(true);
    const [video, setVideo] = useState(true);
    const [screenShare, setScreenShare] = useState(false);
    const [messages, setMessages] = useState([]);
    const [msg, setMsg] = useState("");
    const [showChat, setShowChat] = useState(false);
    
    // Notification State
    const [notify, setNotify] = useState({ open: false, message: "", severity: "info" });

    useEffect(() => {
        const init = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                localStreamRef.current = stream;
                if (localVideoRef.current) localVideoRef.current.srcObject = stream;
            } catch (err) { console.error("Media Error:", err); }
        };
        init();
        return () => {
            if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, []);

    useEffect(() => {
        if (!askUsername && localVideoRef.current && localStreamRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
        }
    }, [askUsername]);

    const connect = () => {
        if (!username.trim() || loading) return;
        setLoading(true);
        socketRef.current = io(server, { transports: ["websocket"] });
        socketRef.current.on("connect", () => {
            socketRef.current.emit("join-call", window.location.pathname, username);
            setupListeners();
            setAskUsername(false);
            setLoading(false);
        });
    };

    const setupListeners = () => {
        socketRef.current.on("user-joined", (id, clients, namesMap) => {
            // Notify when someone joins
            const joinedUser = namesMap?.[id] || "Someone";
            setNotify({ open: true, message: `${joinedUser} joined the room`, severity: "success" });
            
            clients.forEach(cid => {
                if (cid !== socketRef.current.id && !connections.current[cid]) {
                    createPeer(cid, true, namesMap?.[cid] || "User");
                }
            });
        });

        socketRef.current.on("signal", async (fromId, message) => {
            const data = JSON.parse(message);
            if (!connections.current[fromId]) createPeer(fromId, false, "User");
            const pc = connections.current[fromId];
            try {
                if (data.sdp) {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                    if (data.sdp.type === "offer") {
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        socketRef.current.emit("signal", fromId, JSON.stringify({ sdp: pc.localDescription }));
                    }
                }
                if (data.ice) await pc.addIceCandidate(new RTCIceCandidate(data.ice));
            } catch (e) { console.error(e); }
        });

        socketRef.current.on("chat-message", (data, sender) => setMessages(prev => [...prev, { sender, data }]));
        
        socketRef.current.on("user-left", (id) => {
            setNotify({ open: true, message: `A user left the call`, severity: "info" });
            if (connections.current[id]) connections.current[id].close();
            delete connections.current[id];
            setVideos(prev => prev.filter(v => v.socketId !== id));
        });
    };

    const createPeer = async (id, initiator, remoteName) => {
        const pc = new RTCPeerConnection(peerConfig);
        connections.current[id] = pc;
        localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));

        pc.onicecandidate = e => {
            if (e.candidate) socketRef.current.emit("signal", id, JSON.stringify({ ice: e.candidate }));
        };

        pc.ontrack = e => {
            setVideos(prev => {
                if (prev.find(v => v.socketId === id)) return prev;
                return [...prev, { socketId: id, stream: e.streams[0], name: remoteName }];
            });
        };

        if (initiator) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socketRef.current.emit("signal", id, JSON.stringify({ sdp: pc.localDescription }));
        }
    };

    const copyInviteLink = () => {
        navigator.clipboard.writeText(window.location.href);
        setNotify({ open: true, message: "Invite link copied!", severity: "success" });
    };

    const handleScreenShare = async () => {
        if (!screenShare) {
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                const screenTrack = stream.getVideoTracks()[0];
                Object.values(connections.current).forEach(pc => {
                    const sender = pc.getSenders().find(s => s.track.kind === 'video');
                    if (sender) sender.replaceTrack(screenTrack);
                });
                if (localVideoRef.current) localVideoRef.current.srcObject = stream;
                screenTrack.onended = () => stopScreenShare();
                setScreenShare(true);
            } catch (e) { console.error(e); }
        } else { stopScreenShare(); }
    };

    const stopScreenShare = () => {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        Object.values(connections.current).forEach(pc => {
            const sender = pc.getSenders().find(s => s.track.kind === 'video');
            if (sender) sender.replaceTrack(videoTrack);
        });
        if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
        setScreenShare(false);
    };

    const toggleAudio = () => {
        localStreamRef.current.getAudioTracks()[0].enabled = !audio;
        setAudio(!audio);
    };

    const toggleVideo = () => {
        localStreamRef.current.getVideoTracks()[0].enabled = !video;
        setVideo(!video);
    };

    const sendMessage = () => {
        if (!msg.trim()) return;
        socketRef.current.emit("chat-message", msg, username);
        setMessages(prev => [...prev, { sender: "You", data: msg }]);
        setMsg("");
    };

    if (askUsername) {
        return (
            <Box sx={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: '#0b0b15' }}>
                <Paper sx={{ p: 4, textAlign: 'center', bgcolor: '#1a1a2e', color: 'white', borderRadius: 3 }}>
                    <Typography variant="h5" mb={2}>Join the Meeting</Typography>
                    <video ref={localVideoRef} autoPlay muted style={{ width: 300, borderRadius: 12, marginBottom: 20, transform: 'scaleX(-1)', border: '2px solid #333' }} />
                    <TextField fullWidth value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter your name" sx={{ bgcolor: 'white', borderRadius: 1, mb: 2 }} />
                    <Button fullWidth variant="contained" size="large" onClick={connect} disabled={!username.trim()}>{loading ? <CircularProgress size={24} /> : "Join Room"}</Button>
                </Paper>
            </Box>
        );
    }

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#0b0b15', p: 3 }}>
            {/* Header / Invite Section */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h6" color="white">VibeSync Call</Typography>
                <Button variant="outlined" startIcon={<ContentCopy />} onClick={copyInviteLink} sx={{ color: '#90caf9', borderColor: '#90caf9' }}>
                    Copy Link
                </Button>
            </Box>

            <Grid container spacing={2}>
                {videos.map(v => (
                    <Grid item xs={12} sm={6} md={4} key={v.socketId}>
                        <VideoItem stream={v.stream} name={v.name} />
                    </Grid>
                ))}
            </Grid>

            {/* Local Mini View */}
            <Box sx={{ position: 'fixed', bottom: 100, left: 20, width: 220, border: '2px solid #90caf9', borderRadius: 2, overflow: 'hidden' }}>
                <VideoItem stream={localStreamRef.current} name="You" isLocal isScreen={screenShare} />
            </Box>

            {/* Controls */}
            <Paper sx={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", p: 1.5, display: 'flex', gap: 2, borderRadius: 10, bgcolor: '#1a1a2e' }}>
                <IconButton onClick={toggleVideo} color={video ? "primary" : "error"}><Videocam /></IconButton>
                <IconButton onClick={toggleAudio} color={audio ? "primary" : "error"}><Mic /></IconButton>
                <IconButton onClick={handleScreenShare} color={screenShare ? "secondary" : "inherit"} sx={{ color: 'white' }}>
                    {screenShare ? <StopScreenShare /> : <ScreenShare />}
                </IconButton>
                <IconButton onClick={() => window.location.reload()} color="error"><CallEnd /></IconButton>
                <IconButton onClick={() => setShowChat(!showChat)} sx={{ color: 'white' }}><Chat /></IconButton>
            </Paper>

            {/* Notifications */}
            <Snackbar open={notify.open} autoHideDuration={4000} onClose={() => setNotify({ ...notify, open: false })}>
                <Alert severity={notify.severity} sx={{ width: '100%' }}>{notify.message}</Alert>
            </Snackbar>

            {/* Chat */}
            {showChat && (
                <Paper sx={{ position: "fixed", right: 0, top: 0, bottom: 0, width: 320, p: 2, display: 'flex', flexDirection: 'column', bgcolor: '#1a1a2e', color: 'white', borderRadius: 0 }}>
                    <Typography variant="h6" mb={2}>Chat</Typography>
                    <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                        {messages.map((m, i) => (
                            <Box key={i} mb={1}>
                                <Typography variant="caption" color="secondary" sx={{ fontWeight: 'bold' }}>{m.sender}</Typography>
                                <Typography variant="body2">{m.data}</Typography>
                            </Box>
                        ))}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                        <TextField fullWidth size="small" value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} sx={{ bgcolor: 'white', borderRadius: 1 }} />
                        <IconButton onClick={sendMessage} color="primary" sx={{ bgcolor: 'white' }}><Send /></IconButton>
                    </Box>
                </Paper>
            )}
        </Box>
    );
}