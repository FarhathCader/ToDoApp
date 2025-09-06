import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import amqplib from 'amqplib';
import client from 'prom-client';

dotenv.config();
const app = express();
const port = process.env.SERVICE_PORT || 3003;

// Use service names in Docker; fall back to localhost for bare-metal dev
const mongoUri   = process.env.MONGODB_URI  || 'mongodb://mongo:27017/todo';
const rabbitUrl  = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';

// ───────────────────────────────────────────────────────────────────────────────
// Metrics
const register = new client.Registry();
client.collectDefaultMetrics({ register });
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.use(express.json());
app.use(helmet());
app.use(morgan('combined'));

// ───────────────────────────────────────────────────────────────────────────────
// Auth
function auth(req, res, next) {
  const authz = req.headers.authorization || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(token, process.env.AUTH_JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

app.get('/healthz', (_req, res) =>
  res.json({ ok: true, service: 'notification-service' })
);

// ───────────────────────────────────────────────────────────────────────────────
// Mongo
const NotificationSchema = new mongoose.Schema(
  {
    ownerId: { type: String, index: true },
    message: String,
    type: {
      type: String,
      enum: ['TASK_CREATED', 'TASK_OPENED', 'TASK_COMPLETED', 'TASK_DELETED'],
      required: true
    }
  },
  { timestamps: true }
);
// Fast list by user
NotificationSchema.index({ ownerId: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', NotificationSchema);

// ───────────────────────────────────────────────────────────────────────────────
// RabbitMQ consumer (retry + durable topology)
let channel;

async function initRabbitWithRetry({ retries = 20, delayMs = 1500 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const conn = await amqplib.connect(rabbitUrl);
      const ch = await conn.createChannel();

      // durable topology (safe to call repeatedly)
      await ch.assertExchange('task.events', 'topic', { durable: true });
      const q = await ch.assertQueue('notifications.q', { durable: true });

      await ch.bindQueue(q.queue, 'task.events', 'task.*');  // ← add this


      ch.prefetch(10);

     await ch.consume(q.queue, async (msg) => {
  if (!msg) return;
  try {
    const key = msg.fields.routingKey;
    const payload = JSON.parse(msg.content.toString());

    if (key === 'task.created') {
      await Notification.create({ ownerId: payload.ownerId, type: 'TASK_CREATED',  message: `Task created: ${payload.title}` });
    } else if (key === 'task.opened') {
      await Notification.create({ ownerId: payload.ownerId, type: 'TASK_OPENED',   message: `Task reopened: ${payload.title}` });
    } else if (key === 'task.completed') {
      await Notification.create({ ownerId: payload.ownerId, type: 'TASK_COMPLETED', message: `Task completed: ${payload.title}` });
    } else if (key === 'task.deleted') {
      await Notification.create({ ownerId: payload.ownerId, type: 'TASK_DELETED',  message: `Task deleted: ${payload.title || payload.id}` });
    } else {
      console.warn('[notification] Unhandled routing key:', key);
    }

    ch.ack(msg);
  } catch (e) {
    console.error('Failed to process message', e);
    channel.nack(msg, false, true);
  }
});


      conn.on('close', () => {
        console.warn('[notification] RabbitMQ connection closed');
        channel = undefined;
      });
      conn.on('error', (e) => console.warn('[notification] RabbitMQ error', e?.message));

      channel = ch;
      console.log('[notification] RabbitMQ connected and consuming');
      return;
    } catch (e) {
      console.warn(`[notification] connect attempt ${attempt} failed: ${e.message}`);
      if (attempt === retries) throw e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Routes
// Clear the user's notifications (keeps your legacy userId/ownerId cleanup)
app.delete('/', auth, async (req, res) => {
  const uid = req.user.sub;
  const result = await Notification.deleteMany({
    $or: [{ userId: uid }, { ownerId: uid }]
  });
  res.json({ ok: true, deleted: result.deletedCount || 0 });
});

// List latest notifications
app.get('/', auth, async (req, res) => {
  const items = await Notification
    .find({ ownerId: req.user.sub })
    .sort({ createdAt: -1 })
    .limit(50);
  res.json({ notifications: items });
});

// ───────────────────────────────────────────────────────────────────────────────
// Bootstrap
(async () => {
  await mongoose.connect(mongoUri);
  await initRabbitWithRetry().catch(err =>
    console.warn('[notification] RabbitMQ not ready yet:', err.message)
  );
  app.listen(port, () => console.log(`[notification] listening :${port}`));
})();
