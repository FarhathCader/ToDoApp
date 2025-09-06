import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import morgan from 'morgan';
// import mongoose from 'mongoose';
import pg from "pg";
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
const postgresUrl = process.env.POSTGRES_URL || 'postgresql://postgres:postgres@postgres_db:5432/tasksdb';
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

// PostgreSQL Client
const pgClient = new pg.Client({ connectionString: postgresUrl });

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
app.get("/", auth, async (req, res) => {
  const cacheKey = `tasks:${req.user.sub}`;
  const cached = await redis.get(cacheKey);
  if (cached) return res.json(JSON.parse(cached));

  try {
    const result = await pgClient.query(
      'SELECT * FROM tasks WHERE "ownerId" = $1 ORDER BY "createdAt" DESC',
      [req.user.sub]
    );
    const response = { tasks: result.rows };
    await redis.set(cacheKey, JSON.stringify(response), "EX", 30);
    res.json(response);
  } catch (err) {
    console.error("Error fetching tasks:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


// CREATE
app.post("/", auth, async (req, res) => {
  const { error, value } = taskCreateSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  try {
    const { title, description } = value;
    const ownerId = req.user.sub;
    const result = await pgClient.query(
      'INSERT INTO tasks(title, description, status, "ownerId") VALUES($1, $2, $3, $4) RETURNING *',
      [title, description, "OPEN", ownerId]
    );
    const task = result.rows[0];

    await publishTaskCreated({
      id: task.id,
      ownerId: task.ownerId,
      title: task.title,
    });

    await redis.del(`tasks:${req.user.sub}`);
    res.status(201).json({ task });
  } catch (err) {
    console.error("Error creating task:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


// UPDATE (partial)
app.patch("/:id", auth, async (req, res) => {
  const { error, value } = taskUpdateSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  try {
    const { id } = req.params;
    const ownerId = req.user.sub;
    const { title, description, status } = value;

    let setClauses = ['"updatedAt" = NOW()'];
    let params = [];
    let paramIndex = 1;

    if (title !== undefined) {
      setClauses.push(`title = $${paramIndex++}`);
      params.push(title);
    }
    if (description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      params.push(description);
    }
    if (status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    params.push(id, ownerId);

    const query = `
      UPDATE tasks 
      SET ${setClauses.join(", ")} 
      WHERE id = $${paramIndex++} AND "ownerId" = $${paramIndex}
      RETURNING *;
    `;

    const result = await pgClient.query(query, params);
    const task = result.rows[0];

    if (!task) return res.status(404).json({ error: "Not found" });

    await redis.del(`tasks:${req.user.sub}`);
    res.json({ task });
  } catch (err) {
    console.error("Error updating task:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


// DELETE
app.delete("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const ownerId = req.user.sub;

    const result = await pgClient.query(
      'DELETE FROM tasks WHERE id = $1 AND "ownerId" = $2 RETURNING *',
      [id, ownerId]
    );
    const task = result.rows[0];

    if (!task) return res.status(404).json({ error: "Not found" });

    await publishTaskDeleted({
      id: task.id,
      ownerId: task.ownerId,
      title: task.title,
    });
    await redis.del(`tasks:${req.user.sub}`);
    res.status(204).end();
  } catch (err) {
    console.error("Error deleting task:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


// COMPLETE
app.post("/:id/complete", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const ownerId = req.user.sub;

    const result = await pgClient.query(
      'UPDATE tasks SET status = $1, "updatedAt" = NOW() WHERE id = $2 AND "ownerId" = $3 RETURNING *',
      ["DONE", id, ownerId]
    );
    const task = result.rows[0];

    if (!task) return res.status(404).json({ error: "Not found" });

    await publishTaskCompleted({
      id: task.id,
      ownerId: task.ownerId,
      title: task.title,
    });
    await redis.del(`tasks:${req.user.sub}`);
    res.json({ task });
  } catch (err) {
    console.error("Error completing task:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


// OPEN (re-open)
app.post("/:id/open", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const ownerId = req.user.sub;

    const result = await pgClient.query(
      'UPDATE tasks SET status = $1, "updatedAt" = NOW() WHERE id = $2 AND "ownerId" = $3 RETURNING *',
      ["OPEN", id, ownerId]
    );
    const task = result.rows[0];

    if (!task) return res.status(404).json({ error: "Not found" });

    await publishTaskOpened({
      id: task.id,
      ownerId: task.ownerId,
      title: task.title,
    });
    await redis.del(`tasks:${req.user.sub}`);
    res.json({ task });
  } catch (err) {
    console.error("Error opening task:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


// ───────────────────────────────────────────────────────────────────────────────
// Bootstrap
(async () => {
  try {
    await pgClient.connect();
    console.log("[task] PostgreSQL client connected successfully.");

    // SQL command to create the tasks table if it doesn't exist.
    const createTableQuery = `
            CREATE TABLE IF NOT EXISTS tasks (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                status VARCHAR(50) NOT NULL,
                "ownerId" VARCHAR(255) NOT NULL,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
        `;
    await pgClient.query(createTableQuery);
    console.log("[task] Tasks table checked/created.");
  } catch (err) {
    console.error("Failed to connect to PostgreSQL or create table:", err);
    process.exit(1);
  }

  // Try to connect RabbitMQ early; if broker comes up later, publish() will retry.
  await initRabbitWithRetry().catch((err) =>
    console.warn("[task] RabbitMQ not ready yet:", err.message)
  );
  app.listen(port, () => console.log(`[task] listening :${port}`));
})();
