import React, { useEffect, useRef, useState } from 'react';
import io from "socket.io-client";
import {
    Badge, IconButton, TextField, Button, Grid, Paper, Typography, Box, CircularProgress
} from '@mui/material';
import {
    Videocam, VideocamOff, CallEnd, Mic, MicOff,
    ScreenShare, StopScreenShare, Chat, Send
} from '@mui/icons-material';
import server from '../environment';

const peerConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" }
    ]
};
  const userNamesRef = useRef({});

const VideoItem = ({ stream, name, isLocal = false, isScreen = false }) => {
    const ref = useRef();
    
    useEffect(() => {
        if (ref.current && stream) {
            ref.current.srcObject = stream;
        }
    }, [stream]);

    return (
        <Paper elevation={3} sx={{ position: 'relative', borderRadius: 2, overflow: 'hidden', bgcolor: "#000", aspectRatio: '16/9' }}>
            <video
                autoPlay playsInline muted={isLocal} ref={ref}
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
    const [newMsg, setNewMsg] = useState(0);

    // Initial Camera Initialization
    useEffect(() => {
        const getMedia = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                localStreamRef.current = stream;
                if (localVideoRef.current) localVideoRef.current.srcObject = stream;
            } catch (err) {
                console.error("Camera access denied", err);
            }
        };
        getMedia();
    }, []);

    // Re-bind camera after switching screens
    useEffect(() => {
        if (!askUsername && localVideoRef.current && localStreamRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
        }
    }, [askUsername]);

    const connect = async () => {
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
       socketRef.current.on("user-joined", (id, clients, userNamesMap) => {

    // ✅ Save latest map
    if (userNamesMap) {
        userNamesRef.current = userNamesMap;
    }

    clients.forEach(targetId => {
        if (targetId !== socketRef.current.id && !connections.current[targetId]) {

            const name = userNamesRef.current[targetId] || "User";

            createPeer(targetId, true, name);
        }
    });
});

        socketRef.current.on("signal", async (fromId, message) => {
            const signal = JSON.parse(message);
            if (!connections.current[fromId]) createPeer(fromId, false, "User");
            const pc = connections.current[fromId];
            try {
                if (signal.sdp) {
                    await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                    if (signal.sdp.type === "offer") {
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        socketRef.current.emit("signal", fromId, JSON.stringify({ sdp: pc.localDescription }));
                    }
                } else if (signal.ice) {
                    await pc.addIceCandidate(new RTCIceCandidate(signal.ice))
          .catch(e => console.warn("ICE error:", e));
                }
            } catch (e) { console.warn("Signaling error:", e); }
        });

        socketRef.current.on("chat-message", (data, sender, id) => {
            setMessages(prev => [...prev, { sender, data }]);
            if (id !== socketRef.current.id) setNewMsg(p => p + 1);
        });

        socketRef.current.on("user-left", (id) => {
            setVideos(prev => prev.filter(v => v.socketId !== id));
            if (connections.current[id]) {
                connections.current[id].close();
                delete connections.current[id];
            }
        });
    };

    const createPeer = async (id, isInitiator, remoteName) => {
        const pc = new RTCPeerConnection(peerConfig);
        connections.current[id] = pc;
        
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));
        }

        pc.onicecandidate = e => {
            if (e.candidate) socketRef.current.emit("signal", id, JSON.stringify({ ice: e.candidate }));
        };

        pc.ontrack = e => {
            setVideos(prev => {
                if (prev.find(v => v.socketId === id)) return prev;
                return [...prev, { socketId: id, stream: e.streams[0], name: remoteName }];
            });
        };

        if (isInitiator) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socketRef.current.emit("signal", id, JSON.stringify({ sdp: pc.localDescription }));
        }
    };

    const toggleAudio = () => setAudio(prev => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !prev);
        }
        return !prev;
    });

    const toggleVideo = () => setVideo(prev => {
        if (localStreamRef.current) {
            localStreamRef.current.getVideoTracks().forEach(t => t.enabled = !prev);
        }
        return !prev;
    });

    const handleScreenShare = async () => {
        if (!screenShare) {
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                const track = stream.getVideoTracks()[0];
                if (localVideoRef.current) localVideoRef.current.srcObject = stream;
                Object.values(connections.current).forEach(pc => {
                    const sender = pc.getSenders().find(s => s.track?.kind === "video");
                    if (sender) sender.replaceTrack(track);
                });
                track.onended = () => stopSharing();
                setScreenShare(true);
            } catch (e) { console.error(e); }
        } else { stopSharing(); }
    };

    const stopSharing = () => {
        const track = localStreamRef.current.getVideoTracks()[0];
        Object.values(connections.current).forEach(pc => {
            const sender = pc.getSenders().find(s => s.track?.kind === "video");
            if (sender) sender.replaceTrack(track);
        });
        if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
        setScreenShare(false);
    };

    const sendMessage = () => {
        if (!msg.trim()) return;
        socketRef.current.emit("chat-message", msg, username);
        setMessages(prev => [...prev, { sender: "You", data: msg }]);
        setMsg("");
    };

    if (askUsername) {
        return (
            <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#0b0b15' }}>
                <Paper sx={{ p: 4, textAlign: 'center', bgcolor: '#1a1a2e', color: 'white', width: 400, borderRadius: 3 }}>
                    <Typography variant="h4" mb={2} fontWeight="bold">VibeSync</Typography>
                    <Box sx={{ position: 'relative', borderRadius: 2, overflow: 'hidden', mb: 3, bgcolor: '#000', aspectRatio: '16/9' }}>
                        <video ref={localVideoRef} autoPlay muted style={{ width: "100%", height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                    </Box>
                    <TextField fullWidth value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" 
                        sx={{ input: { color: 'white' }, bgcolor: '#252545', mb: 2, borderRadius: 1 }} 
                    />
                    <Button fullWidth variant="contained" onClick={connect} disabled={!username.trim() || loading}>
                        {loading ? <CircularProgress size={24} sx={{ color: 'white' }} /> : "Join Call"}
                    </Button>
                </Paper>
            </Box>
        );
    }

    return (
        <Box sx={{ bgcolor: "#0b0b15", minHeight: "100vh", color: "white", p: 2 }}>
            <Grid container spacing={2}>
                {videos.map(v => (
                    <Grid item xs={12} sm={6} md={4} key={v.socketId}>
                        <VideoItem stream={v.stream} name={v.name} />
                    </Grid>
                ))}
            </Grid>

            {/* Local Participant Floating Window */}
            <Box sx={{ position: "fixed", bottom: 100, left: 20, width: 220, zIndex: 10 }}>
                <Paper elevation={10} sx={{ position: 'relative', borderRadius: 2, overflow: 'hidden', border: '1px solid #444', bgcolor: '#000', aspectRatio: '16/9' }}>
                    <video 
                        ref={localVideoRef} 
                        autoPlay 
                        muted 
                        style={{ 
                            width: '100%', 
                            height: '100%',
                            objectFit: 'cover',
                            display: 'block', 
                            transform: !screenShare ? 'scaleX(-1)' : 'none' 
                        }} 
                    />
                    <Box sx={{ position: 'absolute', bottom: 5, left: 5, bgcolor: 'rgba(0,0,0,0.5)', px: 1, borderRadius: 1 }}>
                        <Typography variant="caption">{username} (You)</Typography>
                    </Box>
                </Paper>
            </Box>

            {/* Controls Bar */}
            <Paper sx={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 2, p: 1.5, borderRadius: 10, bgcolor: '#1a1a2e', backgroundImage: 'none' }}>
                <IconButton onClick={toggleVideo} color={video ? "primary" : "error"}><Videocam /></IconButton>
                <IconButton onClick={toggleAudio} color={audio ? "primary" : "error"}><Mic /></IconButton>
                <IconButton onClick={handleScreenShare} color={screenShare ? "secondary" : "default"}><ScreenShare /></IconButton>
                <IconButton onClick={() => window.location.reload()} color="error"><CallEnd /></IconButton>
                <Badge badgeContent={newMsg} color="error">
                    <IconButton onClick={() => { setShowChat(!showChat); setNewMsg(0); }} sx={{ color: 'white' }}><Chat /></IconButton>
                </Badge>
            </Paper>

            {/* Chat Drawer */}
            {showChat && (
                <Paper sx={{ position: "fixed", right: 0, top: 0, bottom: 0, width: 320, display: 'flex', flexDirection: 'column', p: 2, bgcolor: '#161625', color: 'white', borderRadius: 0 }}>
                    <Typography variant="h6" mb={2}>Chat</Typography>
                    <Box sx={{ flexGrow: 1, overflowY: 'auto', mb: 2 }}>
                        {messages.map((m, i) => (
                            <Box key={i} mb={1.5}>
                                <Typography variant="caption" sx={{ color: m.sender === 'You' ? '#90caf9' : '#f48fb1', fontWeight: 'bold' }}>{m.sender}</Typography>
                                <Typography variant="body2" sx={{ bgcolor: '#252545', p: 1, borderRadius: 1, mt: 0.5 }}>{m.data}</Typography>
                            </Box>
                        ))}
                    </Box>
                    <Box display="flex" gap={1}>
                        <TextField fullWidth size="small" value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} sx={{ bgcolor: '#0b0b15', borderRadius: 1, input: { color: 'white' } }} />
                        <IconButton onClick={sendMessage} color="primary" sx={{ bgcolor: '#252545' }}><Send /></IconButton>
                    </Box>
                </Paper>
            )}
        </Box>
    );
} 