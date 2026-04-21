const http = require('http');
const https = require('https');
const fs = require('fs');
const express = require('express');
const WebSocket = require('ws');
const path = require('path');

const PORT = process.env.PORT || 10000;
// Render handles SSL, but we can fallback to https locally if certs exist
const USE_HTTPS_LOCALLY = fs.existsSync('key.pem') && fs.existsSync('cert.pem') && !process.env.RENDER;

const app = express();

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Admin API Routes
let nextPlayerId = 1;

app.get('/api/status', (req, res) => {
    res.json({ nextPlayerId });
});

app.post('/api/reset', (req, res) => {
    nextPlayerId = 1;
    console.log("Admin triggered manual player ID reset.");
    res.json({ success: true, nextPlayerId });
});

let server;
if (USE_HTTPS_LOCALLY) {
    const options = {
        key: fs.readFileSync('key.pem'),
        cert: fs.readFileSync('cert.pem')
    };
    server = https.createServer(options, app);
    console.log("Starting local HTTPS server...");
} else {
    server = http.createServer(app);
    console.log("Starting local HTTP server (or running on Render)...");
}

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.log(`[Server] Port ${PORT} is in use. Retrying in 500ms...`);
        setTimeout(() => {
            server.listen(PORT, '0.0.0.0');
        }, 500);
    } else {
        console.error('[Server] Server error:', e);
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ Server running on port: ${PORT}`);
    console.log(`Access this from your phone using your computer's local IP address or Render URL.\n`);
});

// Start WebSocket server attached to our HTTP/HTTPS server
const wss = new WebSocket.Server({ server });

let godotHostWs = null;
let mobileClients = new Set();

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const isHost = url.searchParams.get('role') === 'host';

    if (isHost) {
        console.log(`[WSS] Godot Host connected from ${req.socket.remoteAddress}`);
        
        if (godotHostWs) {
            console.log(`[WSS] Existing Godot Host found. Closing old connection.`);
            godotHostWs.close();
        }
        
        godotHostWs = ws;

        ws.on('message', (message) => {
            // Relay from Godot -> Mobile Clients
            mobileClients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(message);
                }
            });
        });

        ws.on('close', () => {
            console.log(`[WSS] Godot Host disconnected`);
            if (godotHostWs === ws) {
                godotHostWs = null;
            }
        });

        ws.on('error', (err) => {
            console.error(`[WSS] Godot Host Error:`, err);
        });

    } else {
        // Mobile client connection
        const playerId = nextPlayerId++;
        console.log(`[WSS] Mobile client connected from ${req.socket.remoteAddress}. Assigned Player ID: ${playerId}`);
        
        mobileClients.add(ws);

        // Immediately assign the player ID to the HTML client
        ws.send(JSON.stringify({ type: "assign_id", id: playerId }));

        ws.on('message', (message) => {
            // Relay from Mobile -> Godot Host
            if (godotHostWs && godotHostWs.readyState === WebSocket.OPEN) {
                godotHostWs.send(message);
            } else {
                // Not logging every missed message to prevent spam, but Host is not connected.
            }
        });

        ws.on('close', () => {
            console.log(`[WSS] Mobile client (Player ${playerId}) disconnected`);
            mobileClients.delete(ws);
        });
        
        ws.on('error', (error) => {
            console.error(`[WSS] Client Error:`, error);
        });
    }
});
