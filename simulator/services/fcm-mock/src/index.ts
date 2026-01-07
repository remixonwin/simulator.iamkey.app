/**
 * Mock FCM Push Notification Service
 * 
 * Captures push notifications and broadcasts via WebSocket for real-time testing.
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Redis for notification storage
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Connected clients by FCM token
const clients = new Map<string, WebSocket>();

// =============================================================================
// WEBSOCKET HANDLING
// =============================================================================

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  if (token) {
    clients.set(token, ws);
    console.log(`[FCM] Client connected: ${token.substring(0, 20)}...`);

    ws.on('close', () => {
      clients.delete(token);
      console.log(`[FCM] Client disconnected: ${token.substring(0, 20)}...`);
    });
  }

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log(`[FCM] Message from client:`, data);
    } catch (e) {
      console.error('[FCM] Invalid message:', message.toString());
    }
  });
});

// =============================================================================
// NOTIFICATION STORAGE
// =============================================================================

interface Notification {
  id: string;
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
  delivered: boolean;
  created_at: string;
}

async function storeNotification(notification: Notification): Promise<void> {
  await redis.lpush('fcm:notifications', JSON.stringify(notification));
  await redis.ltrim('fcm:notifications', 0, 999); // Keep last 1000
  
  // Also store by token for filtered queries
  await redis.lpush(`fcm:notifications:${notification.token}`, JSON.stringify(notification));
  await redis.ltrim(`fcm:notifications:${notification.token}`, 0, 99); // Keep last 100 per token
}

async function getNotifications(token?: string, limit = 50): Promise<Notification[]> {
  const key = token ? `fcm:notifications:${token}` : 'fcm:notifications';
  const items = await redis.lrange(key, 0, limit - 1);
  return items.map(item => JSON.parse(item));
}

// =============================================================================
// FCM API SIMULATION
// =============================================================================

// Send notification (mimics FCM HTTP v1 API)
app.post('/v1/projects/:project/messages:send', async (req: Request, res: Response) => {
  const { message } = req.body;

  if (!message || !message.token) {
    return res.status(400).json({ error: { code: 400, message: 'Invalid request' } });
  }

  const notification: Notification = {
    id: uuidv4(),
    token: message.token,
    title: message.notification?.title || message.data?.title || 'Notification',
    body: message.notification?.body || message.data?.body || '',
    data: message.data || {},
    delivered: false,
    created_at: new Date().toISOString(),
  };

  // Store notification
  await storeNotification(notification);

  // Try to deliver via WebSocket
  const client = clients.get(message.token);
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify({
      type: 'notification',
      payload: notification,
    }));
    notification.delivered = true;
    console.log(`[FCM] Delivered to ${message.token.substring(0, 20)}...: ${notification.title}`);
  } else {
    console.log(`[FCM] Queued for ${message.token.substring(0, 20)}...: ${notification.title}`);
  }

  res.json({
    name: `projects/${req.params.project}/messages/${notification.id}`,
  });
});

// Simplified endpoint for internal use
app.post('/send', async (req: Request, res: Response) => {
  const { token, title, body, data } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'token is required' });
  }

  const notification: Notification = {
    id: uuidv4(),
    token,
    title: title || 'Notification',
    body: body || '',
    data: data || {},
    delivered: false,
    created_at: new Date().toISOString(),
  };

  await storeNotification(notification);

  const client = clients.get(token);
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify({ type: 'notification', payload: notification }));
    notification.delivered = true;
  }

  res.json({ success: true, notification });
});

// =============================================================================
// QUERY ENDPOINTS
// =============================================================================

// List notifications
app.get('/notifications', async (req: Request, res: Response) => {
  const token = req.query.token as string | undefined;
  const limit = parseInt(req.query.limit as string) || 50;
  const notifications = await getNotifications(token, limit);
  res.json({ notifications });
});

// Clear notifications
app.delete('/notifications', async (req: Request, res: Response) => {
  const token = req.query.token as string | undefined;
  if (token) {
    await redis.del(`fcm:notifications:${token}`);
  } else {
    await redis.del('fcm:notifications');
  }
  res.json({ success: true });
});

// List connected clients
app.get('/clients', (_req: Request, res: Response) => {
  res.json({
    count: clients.size,
    tokens: Array.from(clients.keys()).map(t => t.substring(0, 20) + '...'),
  });
});

// =============================================================================
// HEALTH CHECK
// =============================================================================

app.get('/health', async (_req: Request, res: Response) => {
  try {
    await redis.ping();
    res.json({
      status: 'healthy',
      service: 'fcm-mock',
      connected_clients: clients.size,
    });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error: String(error) });
  }
});

// =============================================================================
// START SERVER
// =============================================================================

const PORT = parseInt(process.env.PORT || '4002', 10);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🔔 FCM Mock running on http://0.0.0.0:${PORT}`);
  console.log(`   WebSocket: ws://0.0.0.0:${PORT}/ws`);
});

export default app;
