import React, { useEffect, useRef, useState } from 'react';
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

const peerConfigConnections = {
  iceServers: [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302"
      ]
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject"
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject"
    }
  ]
};

const VideoItem = ({ stream }) => {
    const videoRef = useRef();

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    return <video autoPlay playsInline ref={videoRef} className={styles.videoStream} />;
};

export default function VideoMeetComponent() {

    const socketRef = useRef();
    const socketIdRef = useRef();
    const localVideoref = useRef();
    const localStreamRef = useRef(null);
    const messagesEndRef = useRef(null);

    // UPDATED
    const connections = useRef({});

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

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, showChat]);

    useEffect(() => {
        return () => {
            localStreamRef.current?.getTracks()?.forEach(track => track.stop());
            socketRef.current?.disconnect();
        };
    }, []);

    useEffect(() => {
        if (!askForUsername && localVideoref.current && localStreamRef.current) {
            localVideoref.current.srcObject = localStreamRef.current;
        }
    }, [askForUsername]);

    const connect = async () => {
        try {

            socketRef.current = io(server_url, {
                transports: ["websocket"]
            });

            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localStreamRef.current = stream;
            setAskForUsername(false);

            socketRef.current.on('connect', () => {

                socketRef.current.emit('join-call', window.location.pathname);
                socketIdRef.current = socketRef.current.id;

                socketRef.current.on('user-joined', (id, clients) => {

                    clients.forEach((socketListId) => {

                        if (!connections.current[socketListId]) {
                            setupConnection(socketListId, stream);
                        }

                        if (id === socketIdRef.current && socketListId !== socketIdRef.current) {
                            initiateOffer(socketListId);
                        }

                    });

                });

            });

            setupSocketListeners();

        } catch (err) {

            alert("Hardware Error: Camera busy or permission denied. Use HTTPS.");
            console.error(err);

        }
    };

    const setupSocketListeners = () => {

        socketRef.current.on('signal', gotMessageFromServer);

        socketRef.current.on('chat-message', (data, sender, id) => {

            setMessages(prev => [...prev, { sender, data }]);

            if (id !== socketIdRef.current) {
                setNewMessages(prev => prev + 1);
            }

        });

        socketRef.current.on('user-left', (id) => {

            setVideos(prev => prev.filter(v => v.socketId !== id));

            if (connections.current[id]) {
                connections.current[id].close();
                delete connections.current[id];
            }

        });

    };

    const setupConnection = (socketListId, stream) => {

        const pc = new RTCPeerConnection(peerConfigConnections);
        pc.candidateQueue = [];

        connections.current[socketListId] = pc;

        pc.onicecandidate = (e) => {
            if (e.candidate && socketRef.current) {
                socketRef.current.emit(
                    'signal',
                    socketListId,
                    JSON.stringify({ ice: e.candidate })
                );
            }
        };

        pc.onconnectionstatechange = () => {

            console.log("Connection state:", pc.connectionState);

            if (pc.connectionState === "failed") {
                pc.restartIce();
            }

        };

        pc.ontrack = (event) => {

            const remoteStream = event.streams[0];
            if (!remoteStream) return;

            setVideos(prev => {

                if (prev.some(v => v.socketId === socketListId)) return prev;

                return [...prev, { socketId: socketListId, stream: remoteStream }];

            });

        };

        stream?.getTracks()?.forEach(track => pc.addTrack(track, stream));
    };

    const initiateOffer = async (id) => {

        const pc = connections.current[id];

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socketRef.current.emit(
            'signal',
            id,
            JSON.stringify({ sdp: pc.localDescription })
        );

    };

    const gotMessageFromServer = async (fromId, message) => {

        const signal = JSON.parse(message);
        const pc = connections.current[fromId];

        if (!pc) return;

        if (signal.sdp) {

            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

            if (signal.sdp.type === "offer") {

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                socketRef.current.emit(
                    'signal',
                    fromId,
                    JSON.stringify({ sdp: pc.localDescription })
                );

            }

            while (pc.candidateQueue?.length > 0) {

                const cand = pc.candidateQueue.shift();

                await pc.addIceCandidate(new RTCIceCandidate(cand))
                .catch(e => console.warn("ICE error:", e));

            }

        } 
        else if (signal.ice) {

            if (pc.remoteDescription) {

                await pc.addIceCandidate(new RTCIceCandidate(signal.ice))
                .catch(e => console.warn("ICE error:", e));

            } 
            else {

                pc.candidateQueue.push(signal.ice);

            }
        }
    };

    const sendMessage = () => {

        if (message.trim() && socketRef.current?.connected) {

            socketRef.current.emit('chat-message', message, username);

            setMessages(prev => [...prev, { sender: "You", data: message }]);

            setMessage("");

        }

    };

    const handleVideo = () => {

        const newState = !video;
        setVideo(newState);

        localStreamRef.current?.getVideoTracks()?.[0] &&
        (localStreamRef.current.getVideoTracks()[0].enabled = newState);

    };

    const handleAudio = () => {

        const newState = !audio;
        setAudio(newState);

        localStreamRef.current?.getAudioTracks()?.[0] &&
        (localStreamRef.current.getAudioTracks()[0].enabled = newState);

    };

    const copyInviteLink = () => {

        navigator.clipboard.writeText(window.location.href);
        alert("Invite link copied!");

    };

    const handleScreenShare = async () => {

        try {

            if (!screenSharing) {

                const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });

                const screenTrack = stream.getVideoTracks()[0];
                screenTrack.onended = stopScreenShare;

                for (let id in connections.current) {

                    const sender = connections.current[id]
                        .getSenders()
                        .find(s => s.track?.kind === "video");

                    if (sender) sender.replaceTrack(screenTrack);

                }

                localVideoref.current.srcObject = stream;

                window.screenStream = stream;
                setScreenSharing(true);

            } 
            else {

                stopScreenShare();

            }

        } catch (e) {
            console.error(e);
        }

    };

    const stopScreenShare = () => {

        const videoTrack = localStreamRef.current?.getVideoTracks()?.[0];

        for (let id in connections.current) {

            const sender = connections.current[id]
                .getSenders()
                .find(s => s.track?.kind === "video");

            if (sender && videoTrack) sender.replaceTrack(videoTrack);

        }

        window.screenStream?.getTracks()?.forEach(track => track.stop());

        localVideoref.current.srcObject = localStreamRef.current;

        setScreenSharing(false);
    };
    return (
        <div className={styles.mainWrapper} style={{ backgroundColor: '#0b0b15', minHeight: '100vh', color: 'white' }}>
            {askForUsername ? (
                <div className={styles.lobbyContainer} style={{ padding: '50px', textAlign: 'center', maxWidth: '400px', margin: 'auto' }}>
                    <h2 style={{ marginBottom: '20px' }}>Join Meeting</h2>
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
                <div className={styles.meetVideoContainer} style={{ display: 'flex', width: '100%' }}>
                    
                    <div className={styles.videoGrid} style={{ flex: 1, padding: '20px' }}>
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
                        style={{ width: '200px', position: 'fixed', bottom: '100px', left: '20px', borderRadius: '12px', border: '2px solid #444', zIndex: 10 }}
                    />

                    <div className={styles.bottomControls} style={{ background: 'rgba(22, 27, 34, 0.95)', padding: '12px 24px', borderRadius: '50px', position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '15px', border: '1px solid #30363d', zIndex: 100 }}>
                        <IconButton onClick={handleVideo} sx={{ color: video ? "white" : "#f44336" }}>
                            {video ? <VideocamIcon /> : <VideocamOffIcon />}
                        </IconButton>
                        <IconButton onClick={handleAudio} sx={{ color: audio ? "white" : "#f44336" }}>
                            {audio ? <MicIcon /> : <MicOffIcon />}
                        </IconButton>
                        <IconButton onClick={handleScreenShare} sx={{ color: screenSharing ? "#4caf50" : "white" }}>
                            {screenSharing ? <StopScreenShareIcon /> : <ScreenShareIcon />}
                        </IconButton>
                        <IconButton onClick={copyInviteLink} sx={{ color: "white" }}>
                            <ScreenShareIcon />
                            <span style={{ fontSize: '0.7rem', marginLeft: '5px' }}>Invite</span>
                        </IconButton>
                        <IconButton onClick={() => window.location.reload()} sx={{ color: '#f85149' }}>
                            <CallEndIcon />
                        </IconButton>
                        <Badge badgeContent={newMessages} color="error">
                            <IconButton onClick={() => { setShowChat(!showChat); setNewMessages(0); }} sx={{ color: 'white' }}>
                                <ChatIcon />
                            </IconButton>
                        </Badge>
                          </div>

                    {showChat && (
                        <div className={styles.chatSidebar} style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: '340px', background: '#161b22', borderLeft: '1px solid #30363d', display: 'flex', flexDirection: 'column', zIndex: 100 }}>
                            <div style={{ padding: '20px', borderBottom: '1px solid #30363d', background: '#0d1117' }}>
                                <h3 style={{ margin: 0 }}>In-call Messages</h3>
                            </div>

                            <div className={styles.chatMessages} style={{ flex: 1, overflowY: 'auto', padding: '15px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {messages.map((m, i) => (
                                    <div key={i} style={{ alignSelf: m.sender === "You" ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                                        <div style={{ background: m.sender === "You" ? '#238636' : '#30363d', padding: '10px', borderRadius: '10px' }}>
                                            {m.data}
                                        </div>
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>

                            <div style={{ padding: '15px', background: '#0d1117' }}>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <TextField 
                                        placeholder="Send a message" 
                                        size="small" 
                                        value={message} 
                                        onChange={e => setMessage(e.target.value)} 
                                        onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                                        fullWidth 
                                        sx={{ bgcolor: '#161b22', input: { color: 'white' } }} 
                                    />
                                    <Button variant="contained" onClick={sendMessage}>Send</Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}