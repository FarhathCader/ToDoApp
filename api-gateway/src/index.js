// import express from 'express';
// import dotenv from 'dotenv';
// import helmet from 'helmet';
// import cors from 'cors';
// import morgan from 'morgan';
// import rateLimit from 'express-rate-limit';
// import jwt from 'jsonwebtoken';
// import { createProxyMiddleware } from 'http-proxy-middleware';
// import client from 'prom-client';

// dotenv.config();

// const app = express();
// const port = process.env.GATEWAY_PORT || 8080;
// const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
// const limiter = rateLimit({ windowMs: 60_000, max: 100 }); // 100 req/min per IP

// // Observability
// const register = new client.Registry();
// client.collectDefaultMetrics({ register });
// app.get('/metrics', async (_req, res) => {
//   res.set('Content-Type', register.contentType);
//   res.end(await register.metrics());
// });

// // app.use(express.json());
// app.use(helmet());
// app.use(cors({ origin: (origin, cb) => {
//   if (!origin) return cb(null, true);
//   if (allowed.length === 0 || allowed.includes(origin)) return cb(null, true);
//   cb(new Error('CORS not allowed'));
// }, credentials: true }));
// app.use(limiter);
// app.use(morgan('combined'));

// app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'api-gateway' }));

// function authMiddleware(req, res, next) {
//   const auth = req.headers.authorization || '';
//   const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
//   if (!token) return res.status(401).json({ error: 'Missing token' });
//   try {
//     const payload = jwt.verify(token, process.env.AUTH_JWT_SECRET);
//     req.user = payload;
//     next();
//   } catch (err) {
//     res.status(401).json({ error: 'Invalid token' });
//   }
// }

// // Proxy config
// const userTarget = process.env.USER_SERVICE_URL || 'http://user-service:3001';
// const taskTarget = process.env.TASK_SERVICE_URL || 'http://task-service:3002';
// const notifTarget = process.env.NOTIF_SERVICE_URL || 'http://notification-service:3003';

// app.use('/api/users', createProxyMiddleware({ target: userTarget, changeOrigin: true, pathRewrite: {'^/api': ''} }));
// app.use('/api/tasks', authMiddleware, createProxyMiddleware({ target: taskTarget, changeOrigin: true, pathRewrite: {'^/api': ''} }));
// app.use('/api/notifications', authMiddleware, createProxyMiddleware({ target: notifTarget, changeOrigin: true, pathRewrite: {'^/api': ''} }));

// app.listen(port, () => console.log(`[gateway] listening on :${port}`));



import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { createProxyMiddleware } from 'http-proxy-middleware';
import client from 'prom-client';

dotenv.config();

const app = express();
const port = process.env.GATEWAY_PORT || 8080;
const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);

// ⚠️ Do NOT add express.json() here — it would consume the body before proxying.

app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowed.length === 0 || allowed.includes(origin)) return cb(null, true);
    return cb(new Error('CORS not allowed'));
  },
  credentials: true,
}));
app.use(rateLimit({ windowMs: 60_000, max: 100 }));
app.use(morgan('combined'));

// ---- Metrics & health ----
const register = new client.Registry();
client.collectDefaultMetrics({ register });
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'api-gateway' }));

// ---- Auth middleware for protected routes ----
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(token, process.env.AUTH_JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ---- Targets ----
const userTarget  = process.env.USER_SERVICE_URL  || 'http://user-service:3001';
const taskTarget  = process.env.TASK_SERVICE_URL  || 'http://task-service:3002';
const notifTarget = process.env.NOTIF_SERVICE_URL || 'http://notification-service:3003';

// ---- Proxies ----
// Users: public endpoints (/api/users/* -> /users/*)
app.use(
  '/api/users',
  createProxyMiddleware({
    target: userTarget,
    changeOrigin: true,
    pathRewrite: { '^/api': '' }, // /api/users/login -> /users/login
  })
);

// Tasks: protected (/api/tasks/* -> /tasks/*)
app.use(
  '/api/tasks',
  authMiddleware,
  createProxyMiddleware({
    target: taskTarget,
    changeOrigin: true,
    pathRewrite: { '^/api': '' }, // /api/tasks -> /tasks
  })
);

// Notifications: protected (/api/notifications/* -> /notifications/*)
app.use(
  '/api/notifications',
  authMiddleware,
  createProxyMiddleware({
    target: notifTarget,
    changeOrigin: true,
    pathRewrite: { '^/api': '' }, // /api/notifications -> /notifications
  })
);

app.listen(port, () => console.log(`[gateway] listening on :${port}`));
