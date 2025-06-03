// server.js
const { createServer: createHttpServer } = require('http');
const { createServer: createHttpsServer } = require('https');
const fs = require('fs');
const express = require('express');
const next = require('next');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const httpsOptions = {
  key: fs.readFileSync(path.join(__dirname, 'certs/key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'certs/cert.pem')),
};

app.prepare().then(() => {
  const server = express();

  // Tell Express: “for any path, hand off to Next.js”
  server.all('*', (req, res) => {
    return handle(req, res);
  });

  // 1) HTTP → redirect to HTTPS
  createHttpServer((req, res) => {
    const host = req.headers.host.split(':')[0];
    res.writeHead(301, {
      Location: `https://${host}:3000${req.url}`,
    });
    res.end();
  }).listen(80, () => {
    console.log('→ HTTP: listening on port 80 (redirecting)');
  });

  // 2) HTTPS → Next.js + Express
  createHttpsServer(httpsOptions, server).listen(3000, '0.0.0.0', () => {
    console.log('→ HTTPS: listening on port 3000');
  });
});
