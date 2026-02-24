import * as React from 'react';
import { Avatar, Button, CssBaseline, TextField, Paper, Box, Grid, Typography, Snackbar, createTheme, ThemeProvider } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { AuthContext } from '../contexts/AuthContext';
import "../App.css";

const theme = createTheme({
    palette: {
        primary: { main: '#0052cc' },
        secondary: { main: '#00a3ff' },
    },
});

export default function Authentication() {
    const [username, setUsername] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [name, setName] = React.useState("");
    const [error, setError] = React.useState("");
    const [message, setMessage] = React.useState("");
    const [formState, setFormState] = React.useState(0); // 0 for Login, 1 for Register
    const [open, setOpen] = React.useState(false);

    const { handleRegister, handleLogin } = React.useContext(AuthContext);

    const handleAuth = async () => {
        try {
            if (formState === 0) {
                await handleLogin(username, password);
            } else {
                let result = await handleRegister(name, username, password);
                setMessage(result);
                setOpen(true);
                setError("");
                setFormState(0);
                setPassword("");
            }
        } catch (err) {
            const msg = err.response?.data?.message || "An error occurred";
            setError(msg);
        }
    };

    return (
        <ThemeProvider theme={theme}>
            <Grid container component="main" sx={{ height: '100vh', background: '#f0f4f8' }}>
                <CssBaseline />
                
                {/* Visual Side Panel */}
                <Grid
                    item xs={false} sm={4} md={7}
                    sx={{
                        backgroundImage: 'linear-gradient(135deg, rgba(0, 82, 204, 0.8), rgba(0, 163, 255, 0.8)), url(https://images.unsplash.com/photo-1588196749597-9ff075ee6b5b?q=80&w=1974&auto=format&fit=crop)',
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        color: 'white',
                        p: 4
                    }}
                >
                    <Typography variant="h2" fontWeight="800">VibeSync</Typography>
                    <Typography variant="h6">Connect with the world, seamlessly.</Typography>
                </Grid>

                {/* Auth Form Panel */}
                <Grid item xs={12} sm={8} md={5} component={Paper} elevation={0} square sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
                    <Box sx={{ my: 8, mx: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '400px' }}>
                        
                        <Avatar sx={{ m: 1, bgcolor: 'primary.main' }}>
                            <LockOutlinedIcon />
                        </Avatar>

                        <Typography component="h1" variant="h5" fontWeight="700" sx={{ mb: 3 }}>
                            {formState === 0 ? "Welcome Back" : "Create Account"}
                        </Typography>

                        {/* Toggle Switches */}
                        <Box sx={{ mb: 3, display: 'flex', gap: 2 }}>
                            <Button 
                                variant={formState === 0 ? "contained" : "outlined"} 
                                onClick={() => { setFormState(0); setError(""); }}
                                sx={{ borderRadius: '20px', textTransform: 'none', px: 4 }}
                            >
                                Login
                            </Button>
                            <Button 
                                variant={formState === 1 ? "contained" : "outlined"} 
                                onClick={() => { setFormState(1); setError(""); }}
                                sx={{ borderRadius: '20px', textTransform: 'none', px: 4 }}
                            >
                                Register
                            </Button>
                        </Box>

                        <Box component="form" noValidate sx={{ mt: 1, width: '100%' }}>
                            {formState === 1 && (
                                <TextField
                                    margin="normal" required fullWidth label="Full Name"
                                    autoFocus value={name} onChange={(e) => setName(e.target.value)}
                                />
                            )}
                            <TextField
                                margin="normal" required fullWidth label="Username"
                                value={username} onChange={(e) => setUsername(e.target.value)}
                            />
                            <TextField
                                margin="normal" required fullWidth label="Password"
                                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                            />

                            {error && <Typography color="error" variant="body2" sx={{ mt: 1 }}>{error}</Typography>}

                            <Button
                                fullWidth variant="contained"
                                sx={{ mt: 4, mb: 2, py: 1.5, borderRadius: '10px', fontWeight: '700', fontSize: '1rem', background: 'linear-gradient(90deg, #0052cc, #00a3ff)' }}
                                onClick={handleAuth}
                            >
                                {formState === 0 ? "Sign In" : "Get Started"}
                            </Button>
                        </Box>
                    </Box>
                </Grid>
            </Grid>

            <Snackbar
                open={open}
                autoHideDuration={4000}
                onClose={() => setOpen(false)}
                message={message}
            />
        </ThemeProvider>
    );
}