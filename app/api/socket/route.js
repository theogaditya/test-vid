// app/api/socket/route.js
import { NextRequest, NextResponse } from 'next/server';
import { Server } from 'ws';

export const config = {
  runtime: 'nodejs', // ensure we can access res.socket
};

let wss;

export default async function handler(req, res) {
  // If we haven’t instantiated our WebSocket server yet, do so:
  if (!wss) {
    // noServer: true means “we’ll hook into the existing HTTPS server’s 'upgrade' event”
    wss = new Server({ noServer: true });

    // Listen for the Node.js “upgrade” event on the underlying HTTP/S server
    res.socket.server.on('upgrade', (request, socket, head) => {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    });

    // When a new peer connects:
    wss.on('connection', (ws) => {
      console.log('🔗 New WebSocket connection');

      ws.on('message', (message) => {
        // Broadcast to every other connected client
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === client.OPEN) {
            client.send(message);
          }
        });
      });

      ws.on('close', () => {
        console.log('❌ WebSocket client disconnected');
      });
    });  
  }

  // Immediately send an HTTP 200 so that the WebSocket handshake can complete
  return res.status(200).end();
}
