const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const config = require('./config/env');
const routes = require('./routes');
const requestContext = require('./middleware/requestContext');
const errorHandler = require('./middleware/errorHandler');
const { ApiError } = require('./lib/errors');
const { register: metricsRegistry } = require('./observability/metrics');

const app = express();

// Caddy is the single trusted hop in front of the API, so req.ip is the real
// client address used by rate limiting and audit logging.
app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');

app.use(requestContext);
app.use(helmet());

const allowedOrigins = new Set(config.cors.allowedOrigins);
app.use(
  cors({
    origin(origin, callback) {
      // Same-origin requests and non-browser clients send no Origin header.
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new ApiError('Origin not allowed by CORS policy', 403));
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Idempotent-Replayed', 'RateLimit', 'RateLimit-Policy', 'Retry-After'],
    maxAge: 600,
  }),
);

app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(cookieParser());

// Liveness: the process is up. Readiness (with a DB check) is /api/v1/health.
app.get('/healthz', (req, res) => res.json({ success: true, status: 'ok' }));

// Prometheus scrape endpoint. It is not routed by Caddy (only /api/* is), so it
// is reachable only on the internal Docker network. An optional bearer token
// adds defence in depth.
if (config.metrics.enabled) {
  app.get('/metrics', async (req, res, next) => {
    try {
      if (config.metrics.token && req.get('Authorization') !== `Bearer ${config.metrics.token}`) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }
      res.set('Content-Type', metricsRegistry.contentType);
      return res.send(await metricsRegistry.metrics());
    } catch (error) {
      return next(error);
    }
  });
}

app.use('/api/v1', routes);

app.use((req, res) => res.status(404).json({ success: false, error: 'Route not found' }));
app.use(errorHandler);

module.exports = app;
