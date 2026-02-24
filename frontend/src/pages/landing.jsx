import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import "../App.css";

export default function LandingPage() {
    const navigate = useNavigate();

    return (
        <div className='landingPageContainer'>
            <nav className="navbar">
                <div className='navHeader'>
                    <h2>Vibe<span>Sync</span></h2>
                </div>
                
                <div className='navlist'>
                    <p onClick={() => navigate("/guest")}>Join as Guest</p>
                    <p onClick={() => navigate("/auth")}>Register</p>
                    <div className="loginBtn" onClick={() => navigate("/auth")}>Login</div>
                </div>
            </nav>

            <main className="landingMainContainer">
                <div className="hero-text">
                    <h1>
                        <span className="blue-gradient-text">Seamless</span> meetings, anytime, anywhere.
                    </h1>
                    <p>
                        High-quality video calls for teams who value clarity. 
                        Connect with anyone, on any device, with VibeSync.
                    </p>
                    
                    <Link to="/auth" className="cta-button">
                        Get Started for Free
                    </Link>
                </div>

                <div className="hero-image">
                    <img src="/mobile.png" alt="VibeSync Interface" />
                </div>
            </main>
        </div>
    );
}