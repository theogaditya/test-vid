// server.js (at project root)
const { createServer: createHttpServer } = require('http');
const { createServer: createHttpsServer } = require('https');
const express = require('express');
const next = require('next');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// Make sure this path exists relative to the project root:
const httpsOptions = {
  key: fs.readFileSync(path.join(__dirname, 'certs/key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'certs/cert.pem')),
};

app.prepare().then(() => {
  const expressApp = express();

  // 1) Route everything to Next’s handler
  expressApp.all('*', (req, res) => handle(req, res));

  // 2) Create the HTTPS server around Express + Next
  const httpsServer = createHttpsServer(httpsOptions, expressApp);

  // 3) Set up a “noServer” WebSocketServer
  const wss = new WebSocketServer({ noServer: true });

  // 4) Listen for upgrade, only accept at "/api/socket"
  httpsServer.on('upgrade', (request, socket, head) => {
    if (request.url === '/api/socket') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // 5) When clients connect, broadcast messages to all others
  wss.on('connection', (ws) => {
    console.log('🔗 New WebSocket connection');

    ws.on('message', (message) => {
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

  // 6a) Redirect HTTP → HTTPS on port 80
  createHttpServer((req, res) => {
    const host = req.headers.host.split(':')[0];
    res.writeHead(301, {
      Location: `https://${host}:3000${req.url}`,
    });
    res.end();
  }).listen(80, () => {
    console.log('→ HTTP: listening on port 80 (redirecting)');
  });

  // 6b) Run HTTPS on port 3000
  httpsServer.listen(3000, () => {
    console.log('→ HTTPS: listening on port 3000');
  });
});
