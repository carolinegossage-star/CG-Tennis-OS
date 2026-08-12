const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const clients = new Map(); // userId → Set of ws connections

function init(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    let userId = null;

    // Authenticate via token in query string or first message
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.userId;
        if (!clients.has(userId)) clients.set(userId, new Set());
        clients.get(userId).add(ws);
        logger.info('WS client connected', { userId });
        ws.send(JSON.stringify({ type: 'CONNECTED', userId }));
      } catch {
        ws.close(1008, 'Invalid token');
        return;
      }
    }

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'PING') ws.send(JSON.stringify({ type: 'PONG' }));
      } catch { /* ignore malformed */ }
    });

    ws.on('close', () => {
      if (userId && clients.has(userId)) {
        clients.get(userId).delete(ws);
        if (clients.get(userId).size === 0) clients.delete(userId);
      }
      logger.info('WS client disconnected', { userId });
    });

    ws.on('error', (err) => logger.warn('WS error', { error: err.message, userId }));
  });

  logger.info('WebSocket server initialised');
  return wss;
}

function sendToUser(userId, payload) {
  const userClients = clients.get(userId);
  if (!userClients?.size) return;
  const message = JSON.stringify(payload);
  for (const ws of userClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

function broadcast(payload) {
  const message = JSON.stringify(payload);
  for (const [, userClients] of clients) {
    for (const ws of userClients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(message);
    }
  }
}

module.exports = { init, sendToUser, broadcast };
