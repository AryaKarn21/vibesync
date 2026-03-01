let IS_PROD = true;

const server = IS_PROD
  ? "https://vibesyncbackend-mog8.onrender.com"
  : "http://localhost:8000";

export default server;