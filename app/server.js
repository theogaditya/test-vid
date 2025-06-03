// server.js
const { createServer: createHttpServer } = require('http');
const { createServer: createHttpsServer } = require('https');
const express = require('express');
const next = require('next');
const path = require('path');
const fs = require('fs');

// Import the correct class from 'ws'
const { WebSocketServer } = require('ws');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// Load your real TLS certs here in production
const httpsOptions = {
  key: fs.readFileSync(path.join(__dirname, 'certs/key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'certs/cert.pem')),
};

app.prepare().then(() => {
  const expressApp = express();

  // 1) Let Next.js handle all routes (/, /api, /_next, etc.)
  expressApp.all('*', (req, res) => handle(req, res));

  // 2) Create the HTTPS server *around* Express + Next
  const httpsServer = createHttpsServer(httpsOptions, expressApp);

  // 3) Create a WebSocketServer in “noServer” mode so we can
  //    manually hook into the HTTPS server’s 'upgrade' event.
  const wss = new WebSocketServer({ noServer: true });

  // 4) When Node’s HTTPS server sees an “upgrade” request, let wss handle it:
  httpsServer.on('upgrade', (request, socket, head) => {
    // Optionally: check request.url here if you want to only accept WS on "/api/socket"
    if (request.url === '/api/socket') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy(); // reject any other upgrade attempts
    }
  });

  // 5) Once a client WebSocket is fully connected, wire up your signaling logic:
  wss.on('connection', (ws) => {
    console.log('🔗 New WebSocket connection');

    ws.on('message', (message) => {
      // Broadcast to every other connected client
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    });

    ws.on('close', () => {
      console.log('❌ WebSocket client disconnected');
    });
  });

  // 6) Start listening:
  //    • Port 80 → redirect to HTTPS
  createHttpServer((req, res) => {
    const host = req.headers.host.split(':')[0];
    res.writeHead(301, {
      Location: `https://${host}:3000${req.url}`,
    });
    res.end();
  }).listen(80, () => {
    console.log('→ HTTP: listening on port 80 (redirecting to HTTPS)');
  });

  //    • Port 3000 → HTTPS + Next + WebSocket
  httpsServer.listen(3000, () => {
    console.log('→ HTTPS: listening on port 3000');
  });
});
