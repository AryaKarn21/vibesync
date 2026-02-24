import React, { useEffect, useRef, useState } from 'react'
import io from "socket.io-client";
import { Badge, IconButton, TextField, Button } from '@mui/material';
import { 
    Videocam as VideocamIcon, VideocamOff as VideocamOffIcon, 
    CallEnd as CallEndIcon, Mic as MicIcon, MicOff as MicOffIcon, 
    ScreenShare as ScreenShareIcon, StopScreenShare as StopScreenShareIcon, 
    Chat as ChatIcon 
} from '@mui/icons-material';
import styles from "../styles/videoComponent.module.css";
import server from '../environment';

const server_url = server;
var connections = {};
const peerConfigConnections = { "iceServers": [{ "urls": "stun:stun.l.google.com:19302" }] }

const VideoItem = ({ stream }) => {
    const videoRef = useRef();
    useEffect(() => {
        if (videoRef.current && stream) videoRef.current.srcObject = stream;
    }, [stream]);
    return <video autoPlay playsInline ref={videoRef} className={styles.videoStream} />;
};

export default function VideoMeetComponent() {
    const socketRef = useRef();
    const socketIdRef = useRef();
    const localVideoref = useRef();
    const localStreamRef = useRef(null); // Ref to avoid window.localStream global pollution

    const [video, setVideo] = useState(true);
    const [audio, setAudio] = useState(true);
    const [screenSharing, setScreenSharing] = useState(false);
    const [showChat, setShowChat] = useState(false);
    const [messages, setMessages] = useState([]);
    const [message, setMessage] = useState("");
    const [newMessages, setNewMessages] = useState(0);
    const [askForUsername, setAskForUsername] = useState(true);
    const [username, setUsername] = useState("");
    const [videos, setVideos] = useState([]);

    // Re-attach local stream when the lobby closes and the room video element mounts
    useEffect(() => {
        if (!askForUsername && localVideoref.current && localStreamRef.current) {
            localVideoref.current.srcObject = localStreamRef.current;
        }
    }, [askForUsername]);

    const connect = async () => {
        try {
            // Get stream FIRST before joining to ensure hardware is available
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localStreamRef.current = stream;
            setAskForUsername(false);

            socketRef.current = io.connect(server_url, { secure: false });
            
            socketRef.current.on('connect', () => {
                socketRef.current.emit('join-call', window.location.href);
                socketIdRef.current = socketRef.current.id;

                socketRef.current.on('user-joined', (id, clients) => {
                    clients.forEach((socketListId) => {
                        if (!connections[socketListId]) setupConnection(socketListId, stream);
                        if (id === socketIdRef.current && socketListId !== socketIdRef.current) {
                            initiateOffer(socketListId);
                        }
                    });
                });
            });

            setupSocketListeners();
        } catch (err) {
            alert("Hardware Error: Camera is busy or permission denied.");
            console.error(err);
        }
    };

    const setupSocketListeners = () => {
        socketRef.current.on('signal', gotMessageFromServer);
        socketRef.current.on('chat-message', (data, sender, id) => {
            setMessages((prev) => [...prev, { sender, data }]);
            if (id !== socketIdRef.current) setNewMessages(prev => prev + 1);
        });
        socketRef.current.on('user-left', (id) => {
            setVideos((prev) => prev.filter((v) => v.socketId !== id));
            if (connections[id]) {
                connections[id].close();
                delete connections[id];
            }
        });
    };

    const setupConnection = (socketListId, stream) => {
        const pc = new RTCPeerConnection(peerConfigConnections);
        pc.candidateQueue = []; // Queue for candidates arriving before SDP
        connections[socketListId] = pc;

        pc.onicecandidate = (e) => {
            if (e.candidate) {
                socketRef.current.emit('signal', socketListId, JSON.stringify({ 'ice': e.candidate }));
            }
        };

        pc.ontrack = (e) => {
            setVideos(prev => {
                if (prev.find(v => v.socketId === socketListId)) return prev;
                return [...prev, { socketId: socketListId, stream: e.streams[0] }];
            });
        };

        if (stream) {
            stream.getTracks().forEach(track => pc.addTrack(track, stream));
        }
    };

    const initiateOffer = async (id) => {
        const pc = connections[id];
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current.emit('signal', id, JSON.stringify({ 'sdp': pc.localDescription }));
    };

    const gotMessageFromServer = async (fromId, message) => {
        const signal = JSON.parse(message);
        const pc = connections[fromId];
        if (!pc) return;

        if (signal.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            if (signal.sdp.type === "offer") {
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socketRef.current.emit('signal', fromId, JSON.stringify({ 'sdp': pc.localDescription }));
            }
            
            // Process queued candidates now that remote description is set
            while (pc.candidateQueue.length > 0) {
                const cand = pc.candidateQueue.shift();
                await pc.addIceCandidate(new RTCIceCandidate(cand));
            }
        } else if (signal.ice) {
            if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(signal.ice));
            } else {
                pc.candidateQueue.push(signal.ice);
            }
        }
    };

    const handleVideo = () => {
        const newState = !video;
        setVideo(newState);
        localStreamRef.current.getVideoTracks()[0].enabled = newState;
    };

    const handleAudio = () => {
        const newState = !audio;
        setAudio(newState);
        localStreamRef.current.getAudioTracks()[0].enabled = newState;
    };

    const handleScreenShare = async () => {
        try {
            if (!screenSharing) {
                const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                const screenTrack = stream.getVideoTracks()[0];
                
                screenTrack.onended = () => stopScreenShare();

                for (let id in connections) {
                    const sender = connections[id].getSenders().find(s => s.track.kind === 'video');
                    if (sender) sender.replaceTrack(screenTrack);
                }
                localVideoref.current.srcObject = stream;
                setScreenSharing(true);
                window.screenStream = stream;
            } else {
                stopScreenShare();
            }
        } catch (e) { console.error(e); }
    };

    const stopScreenShare = () => {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        for (let id in connections) {
            const sender = connections[id].getSenders().find(s => s.track.kind === 'video');
            if (sender) sender.replaceTrack(videoTrack);
        }
        if (window.screenStream) {
            window.screenStream.getTracks().forEach(track => track.stop());
        }
        localVideoref.current.srcObject = localStreamRef.current;
        setScreenSharing(false);
    };

    return (
        <div className={styles.mainWrapper} style={{ backgroundColor: '#0b0b15', minHeight: '100vh', color: 'white' }}>
            {askForUsername ? (
                <div className={styles.lobbyContainer} style={{ padding: '50px', textAlign: 'center' }}>
                    <h2>Join Meeting</h2>
                    <TextField 
                        label="Username" 
                        variant="filled" 
                        value={username} 
                        onChange={e => setUsername(e.target.value)} 
                        fullWidth 
                        sx={{ mb: 2, bgcolor: 'white', borderRadius: 1 }} 
                    />
                    <Button variant="contained" onClick={connect} disabled={!username} fullWidth size="large">Join</Button>
                </div>
            ) : (
                <div className={styles.meetVideoContainer}>
                    <div className={styles.videoGrid}>
                        {videos.map((v) => (
                            <div key={v.socketId} className={styles.videoCard}>
                                <VideoItem stream={v.stream} />
                            </div>
                        ))}
                    </div>

                    <video 
                        className={styles.meetUserVideo} 
                        ref={localVideoref} 
                        autoPlay 
                        muted 
                        playsInline 
                        style={{ width: '200px', position: 'fixed', bottom: '100px', left: '20px', borderRadius: '10px', border: '2px solid #444' }}
                    />

                    <div className={styles.bottomControls} style={{ background: 'rgba(0,0,0,0.8)', padding: '10px', borderRadius: '50px', position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)' }}>
                        <IconButton onClick={handleVideo} sx={{ color: video ? "white" : "#f44336" }}>
                            {video ? <VideocamIcon /> : <VideocamOffIcon />}
                        </IconButton>
                        <IconButton onClick={handleAudio} sx={{ color: audio ? "white" : "#f44336" }}>
                            {audio ? <MicIcon /> : <MicOffIcon />}
                        </IconButton>
                        <IconButton onClick={handleScreenShare} sx={{ color: screenSharing ? "#4caf50" : "white" }}>
                            {screenSharing ? <StopScreenShareIcon /> : <ScreenShareIcon />}
                        </IconButton>
                        <IconButton onClick={() => window.location.reload()} sx={{ color: '#f44336' }}>
                            <CallEndIcon />
                        </IconButton>
                        <Badge badgeContent={newMessages} color="error">
                            <IconButton onClick={() => { setShowChat(!showChat); setNewMessages(0); }} sx={{ color: 'white' }}>
                                <ChatIcon />
                            </IconButton>
                        </Badge>
                    </div>

                    {showChat && (
                        <div className={styles.chatSidebar} style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: '300px', background: '#161b22', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                            <div className={styles.chatMessages} style={{ flex: 1, overflowY: 'auto' }}>
                                {messages.map((m, i) => (
                                    <div key={i} style={{ marginBottom: '10px' }}><strong>{m.sender}:</strong> {m.data}</div>
                                ))}
                            </div>
                            <div className={styles.chatInput} style={{ display: 'flex', gap: '5px' }}>
                                <TextField 
                                    size="small" 
                                    value={message} 
                                    onChange={e => setMessage(e.target.value)} 
                                    fullWidth 
                                    sx={{ input: { color: 'white' }, bgcolor: '#0d1117' }} 
                                />
                                <Button variant="contained" onClick={() => { if(message) { socketRef.current.emit('chat-message', message, username); setMessage(""); } }}>Send</Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}