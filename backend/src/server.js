require('dotenv').config();
const express = require('express');
const http = require('http');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const { connectRedis } = require('./config/database');
const logger = require('./utils/logger');
const wsService = require('./services/wsService');
const alertService = require('./services/alertService');
const trialService = require('./services/trialService');
const retentionFlagService = require('./services/retentionFlagService');
const parentDraftService = require('./services/parentDraftService');

// Routes
const authRoutes = require('./routes/auth');
const playerRoutes = require('./routes/players');
const tournamentRoutes = require('./routes/tournaments');
const sessionRoutes = require('./routes/sessions');
const {
  alertsRouter, aiRouter, businessRouter,
  communityRouter, checklistsRouter, usersRouter, adminRouter
} = require('./routes/allRoutes');

const {
  identityRouter, behaviouralRouter, drillsRouter,
  learningRouter, businessOsRouter, communityNetworkRouter,
  predictiveRouter
} = require('./routes/blueprintRoutes');
// Tournament Live Engine — event admin, draws/brackets, live matches.
// Deliberately separate from tournamentRoutes (discovery + entry
// tracking, unchanged) — see migrate_tournament_engine.sql for the
// full scope reasoning.
const tournamentEventsRoutes = require('./routes/tournamentEvents');
const tournamentDrawsRoutes = require('./routes/tournamentDraws');
const tournamentMatchesRoutes = require('./routes/tournamentMatches');

const app = express();
const server = http.createServer(app);

// ─── Security Middleware ───────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
}));

// Allowed origins: production frontend, plus localhost for local dev only.
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.NODE_ENV !== 'production' ? 'http://localhost:5173' : null,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. server-to-server, curl health checks) with no origin header.
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Rate Limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 900000, // 15 min
  max: 10,
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
});

app.use(limiter);
app.use(compression());

// ─── Stripe Webhooks ───────────────────────────────────────────────────────────
// MUST be mounted before express.json(): Stripe signature verification needs the
// raw request body, and the global JSON parser below would consume it first.
app.use('/webhooks', require('./routes/webhookRoutes'));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Upload Directory ──────────────────────────────────────────────────────────
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Tennis Coaching OS API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ─── API Routes ────────────────────────────────────────────────────────────────
app.use('/auth', authLimiter, authRoutes);
app.use('/users', usersRouter);
app.use('/players', playerRoutes);
app.use('/tournaments', tournamentRoutes);
app.use('/tournament-events', tournamentEventsRoutes);
app.use('/tournament-draws', tournamentDrawsRoutes);
app.use('/tournament-matches', tournamentMatchesRoutes);
app.use('/sessions', sessionRoutes);
app.use('/alerts', alertsRouter);
app.use('/ai-assist', aiRouter);
app.use('/business-metrics', businessRouter);
app.use('/community-knowledge', communityRouter);
app.use('/checklists', checklistsRouter);
// Mounted before '/admin' so route matching order can never shadow these paths.
app.use('/admin/access', require('./routes/adminAccess'));
app.use('/admin', adminRouter);
app.use('/weather', require('./routes/weatherRoutes'));
app.use('/voice-capture', require('./routes/voiceCapture'));
app.use('/coach', require('./routes/agenticFeatures'));
app.use('/standby', require('./routes/standbyRoutes'));
app.use('/stripe', require('./routes/stripeRoutes'));

// Blueprint Gap-Fill Routes
app.use('/coaching-identity', identityRouter);
app.use('/behavioural', behaviouralRouter);
app.use('/drills', drillsRouter);
app.use('/learning', learningRouter);
app.use('/business-os', businessOsRouter);
app.use('/community-network', communityNetworkRouter);
app.use('/predictive', predictiveRouter);

// ─── Serve Front-End (if built) ────────────────────────────────────────────────
const frontendBuild = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(frontendBuild)) {
  app.use(express.static(frontendBuild));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/auth')) {
      res.sendFile(path.join(frontendBuild, 'index.html'));
    }
  });
}

// ─── Error Handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
  });

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request too large' });
  }

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : err.message,
  });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ─── Start Server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

async function start() {
  try {
    // Connect Redis (non-fatal if unavailable)
    await connectRedis();

    // Start HTTP server
    server.listen(PORT, () => {
      logger.info(`🎾 Tennis Coaching OS API running on port ${PORT}`, {
        environment: process.env.NODE_ENV,
        port: PORT,
      });
    });

    // Initialise WebSocket server
    wsService.init(server);

    // Schedule daily deadline scan at 07:00 UTC
    scheduleDailyScan();

    // Schedule daily trial activation check (nudges + extensions) at 08:00 UTC
    scheduleDailyTrialCheck();

    // Schedule the separate retention-risk scan at 09:00 UTC.
    scheduleDailyRetentionFlagScan();

    // Graceful shutdown
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (err) {
    logger.error('Server failed to start', { error: err.message });
    process.exit(1);
  }
}

function scheduleDailyScan() {
  const runAt = new Date();
  runAt.setUTCHours(7, 0, 0, 0);
  if (runAt <= new Date()) runAt.setDate(runAt.getDate() + 1);
  const delay = runAt - Date.now();

  setTimeout(() => {
    alertService.runDailyDeadlineScan();
    setInterval(() => alertService.runDailyDeadlineScan(), 86400000); // 24h
  }, delay);

  logger.info(`Daily deadline scan scheduled in ${Math.round(delay / 60000)} minutes`);
}

function scheduleDailyRetentionFlagScan() {
  const runAt = new Date();
  runAt.setUTCHours(9, 0, 0, 0);
  if (runAt <= new Date()) runAt.setDate(runAt.getDate() + 1);
  const delay = runAt - Date.now();

  setTimeout(() => {
    retentionFlagService.runDailyScan().catch((err) =>
      logger.error('Daily retention flag scan failed', { error: err.message })
    );
    parentDraftService.purgeExpiredDrafts().catch((err) =>
      logger.error('Parent draft purge failed', { error: err.message })
    );
    setInterval(() => {
      retentionFlagService.runDailyScan().catch((err) =>
        logger.error('Daily retention flag scan failed', { error: err.message })
      );
      parentDraftService.purgeExpiredDrafts().catch((err) =>
        logger.error('Parent draft purge failed', { error: err.message })
      );
    }, 86400000);
  }, delay);

  logger.info(`Daily retention flag scan scheduled in ${Math.round(delay / 60000)} minutes`);
}

function scheduleDailyTrialCheck() {
  const runAt = new Date();
  runAt.setUTCHours(8, 0, 0, 0);
  if (runAt <= new Date()) runAt.setDate(runAt.getDate() + 1);
  const delay = runAt - Date.now();

  setTimeout(() => {
    trialService.runDailyTrialCheck().catch((err) =>
      logger.error('Daily trial check failed', { error: err.message })
    );
    setInterval(() => {
      trialService.runDailyTrialCheck().catch((err) =>
        logger.error('Daily trial check failed', { error: err.message })
      );
    }, 86400000); // 24h
  }, delay);

  logger.info(`Daily trial activation check scheduled in ${Math.round(delay / 60000)} minutes`);
}

async function shutdown() {
  logger.info('Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
}

start();

module.exports = { app, server };
