import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import Joi from 'joi';
import amqplib from 'amqplib';
import Redis from 'ioredis';
import client from 'prom-client';
import { randomUUID } from 'crypto';

dotenv.config();
const app = express();
const port = process.env.SERVICE_PORT || 3002;

// IMPORTANT: In Docker Compose, prefer service names over localhost.
const mongoUri = process.env.MONGODB_URI || 'mongodb://mongo:27017/todo';
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');
const RABBIT_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';

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
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(token, process.env.AUTH_JWT_SECRET);
    // req.user.sub is the userId (JWT subject)
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Mongo
const taskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  status: { type: String, enum: ['OPEN','DONE'], default: 'OPEN' },
  ownerId: { type: String, required: true }
}, { timestamps: true });

taskSchema.index({ ownerId: 1, createdAt: -1 }); // paginate efficiently
const Task = mongoose.model('Task', taskSchema);

// ───────────────────────────────────────────────────────────────────────────────
// Validation
const taskCreateSchema = Joi.object({
  title: Joi.string().min(1).max(200).required(),
  description: Joi.string().allow('').max(2000)
});

const taskUpdateSchema = Joi.object({
  title: Joi.string().min(1).max(200),
  description: Joi.string().allow('').max(2000),
  status: Joi.string().valid('OPEN', 'DONE')
});

// ───────────────────────────────────────────────────────────────────────────────
// RabbitMQ (confirm channel + retry + topology assert)
let channel;

async function initRabbitWithRetry({ retries = 20, delayMs = 1500 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const conn = await amqplib.connect(RABBIT_URL);
      const ch = await conn.createConfirmChannel(); // confirm channel: stronger delivery
      // Recreate topology if missing (safe to call repeatedly)
      await ch.assertExchange('task.events', 'topic', { durable: true });
      channel = ch;

      // Log connection close/errors so we can recreate if needed
      conn.on('close', () => {
        console.warn('[task] RabbitMQ connection closed; will recreate on next publish');
        channel = undefined;
      });
      conn.on('error', (e) => console.warn('[task] RabbitMQ connection error:', e?.message));
      console.log('[task] RabbitMQ connected (confirm channel)');
      return;
    } catch (e) {
      console.warn(`[task] RabbitMQ connect attempt ${attempt} failed: ${e.message}`);
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

async function ensureChannel() {
  if (!channel) {
    await initRabbitWithRetry();
  }
  return channel;
}

async function publishEvent(routingKey, payload) {
  const ch = await ensureChannel(); // will retry/connect as needed
  const body = Buffer.from(JSON.stringify(payload));
  const ok = ch.publish(
    'task.events',
    routingKey,
    body,
    { persistent: true, contentType: 'application/json', messageId: randomUUID() }
  );
  if (!ok) await new Promise(r => ch.once('drain', r));
  await ch.waitForConfirms(); // broker ack
  console.log('[task] published', routingKey, { ownerId: payload.ownerId, id: payload.id });
}

// Convenience wrappers (keeps keys consistent)
const publishTaskCreated   = (t) => publishEvent('task.created',   t);
const publishTaskOpened    = (t) => publishEvent('task.opened',    t);
const publishTaskCompleted = (t) => publishEvent('task.completed', t);
const publishTaskDeleted   = (t) => publishEvent('task.deleted',   t);

// ───────────────────────────────────────────────────────────────────────────────
// Routes
app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'task-service' }));

// GET list (cached 30s)
app.get('/', auth, async (req, res) => {
  const cacheKey = `tasks:${req.user.sub}`;
  const cached = await redis.get(cacheKey);
  if (cached) return res.json(JSON.parse(cached));

  const tasks = await Task.find({ ownerId: req.user.sub }).sort({ createdAt: -1 });
  const response = { tasks };
  await redis.set(cacheKey, JSON.stringify(response), 'EX', 30);
  res.json(response);
});

// CREATE
app.post('/', auth, async (req, res) => {
  const { error, value } = taskCreateSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  const task = await Task.create({ ...value, ownerId: req.user.sub });
  await publishTaskCreated({ id: task._id.toString(), ownerId: task.ownerId, title: task.title });

  await redis.del(`tasks:${req.user.sub}`);
  res.status(201).json({ task });
});

// UPDATE (partial)
app.patch('/:id', auth, async (req, res) => {
  const { error, value } = taskUpdateSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, ownerId: req.user.sub },
    value,
    { new: true }
  );
  if (!task) return res.status(404).json({ error: 'Not found' });

  await redis.del(`tasks:${req.user.sub}`);
  res.json({ task });
});

// DELETE
app.delete('/:id', auth, async (req, res) => {
  const task = await Task.findOneAndDelete({ _id: req.params.id, ownerId: req.user.sub });
  if (!task) return res.status(404).json({ error: 'Not found' });

  await publishTaskDeleted({ id: req.params.id, ownerId: req.user.sub, title: task.title });
  await redis.del(`tasks:${req.user.sub}`);
  res.status(204).end();
});

// COMPLETE
app.post('/:id/complete', auth, async (req, res) => {
  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, ownerId: req.user.sub },
    { status: 'DONE' },
    { new: true }
  );
  if (!task) return res.status(404).json({ error: 'Not found' });

  await publishTaskCompleted({ id: task._id.toString(), ownerId: req.user.sub, title: task.title });
  await redis.del(`tasks:${req.user.sub}`);
  res.json({ task });
});

// OPEN (re-open)
app.post('/:id/open', auth, async (req, res) => {
  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, ownerId: req.user.sub },
    { status: 'OPEN' },
    { new: true }
  );
  if (!task) return res.status(404).json({ error: 'Not found' });

  await publishTaskOpened({ id: task._id.toString(), ownerId: req.user.sub, title: task.title });
  await redis.del(`tasks:${req.user.sub}`);
  res.json({ task });
});

// ───────────────────────────────────────────────────────────────────────────────
// Bootstrap
(async () => {
  await mongoose.connect(mongoUri);
  // Try to connect RabbitMQ early; if broker comes up later, publish() will retry.
  await initRabbitWithRetry().catch(err => console.warn('[task] RabbitMQ not ready yet:', err.message));
  app.listen(port, () => console.log(`[task] listening :${port}`));
})();
