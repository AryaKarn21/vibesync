import React, { useContext, useState } from 'react'
import withAuth from '../utils/withAuth'
import { useNavigate } from 'react-router-dom'
import "../App.css";
import { Button, IconButton, TextField } from '@mui/material';
import RestoreIcon from '@mui/icons-material/Restore';
import LogoutIcon from '@mui/icons-material/Logout';
import { AuthContext } from '../contexts/AuthContext';

function HomeComponent() {
    let navigate = useNavigate();
    const [meetingCode, setMeetingCode] = useState("");

    const { addToUserHistory } = useContext(AuthContext);

    let handleJoinVideoCall = async () => {
        if (meetingCode.trim()) {
            await addToUserHistory(meetingCode);
            navigate(`/${meetingCode}`);
        }
    }

    const handleLogout = () => {
        localStorage.removeItem("token");
        navigate("/auth");
    };

    return (
        <div className="homeContainer">
            {/* Professional Glass Navbar */}
            <nav className="navbar">
                <div className='navHeader'>
                    <h2 style={{ cursor: 'pointer' }} onClick={() => navigate("/home")}>
                        Vibe<span>Sync</span>
                    </h2>
                </div>

                <div className='navlist'>
                    <div className="nav-action" onClick={() => navigate("/history")}>
                        <IconButton color="primary">
                            <RestoreIcon />
                        </IconButton>
                        <p>History</p>
                    </div>

                    <Button 
                        variant="outlined" 
                        color="error" 
                        startIcon={<LogoutIcon />}
                        onClick={handleLogout}
                        className="logout-btn"
                    >
                        Logout
                    </Button>
                </div>
            </nav>

            {/* Main Meeting Section */}
            <main className="meetContainer">
                <section className="leftPanel">
                    <div className="hero-content">
                        <h1>Premium video meetings. <br />
                            <span className="blue-gradient-text">Now free for everyone.</span>
                        </h1>
                        <p className="hero-description">
                            We re-engineered the service we built for secure business meetings, 
                            VibeSync, to make it free and available for all.
                        </p>

                        <div className="join-actions">
                            <TextField 
                                onChange={e => setMeetingCode(e.target.value)} 
                                id="outlined-basic" 
                                label="Enter a code or link" 
                                variant="outlined" 
                                size="medium"
                                className="meeting-input"
                            />
                            <Button 
                                onClick={handleJoinVideoCall} 
                                variant='contained' 
                                className="join-btn"
                                disabled={!meetingCode}
                            >
                                Join
                            </Button>
                        </div>
                    </div>
                </section>

                <section className='rightPanel'>
                    <div className="image-wrapper">
                        <img src='/logo3.png' alt="VibeSync Illustration" className="floating-img" />
                    </div>
                </section>
            </main>
        </div>
    )
}

export default withAuth(HomeComponent)