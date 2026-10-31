const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// 1. TRUST PROXY (CRITICAL)
// Tells Express to trust the first proxy (Caddy/Cloudflare).
// This ensures rate limiting and logging use the real client IP, not the Docker/Cloudflare IP.
app.set('trust proxy', 1);

// 2. SECURITY HEADERS
// Must be near the top to protect all subsequent routes
app.use(helmet());

// 3. CORS CONFIGURATION
// Driven by ALLOWED_ORIGINS env var. Defaults to closed in production.
const rawOrigins = process.env.ALLOWED_ORIGINS || '';
const allowedOrigins = rawOrigins.trim()
  ? rawOrigins.split(',').map((o) => o.trim()).filter(Boolean)
  : process.env.NODE_ENV === 'production'
    ? [] // Closed by default in production
    : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:80'];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, curl, Postman, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }),
);

// 4. BODY PARSERS
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 5. ROUTES
// All /api/v1/* requests go here
app.use('/api/v1', routes);

// 6. 404 NOT FOUND HANDLER
// Must be placed AFTER all valid routes.
app.use((req, res) =>
  res.status(404).json({ success: false, error: 'Route not found' }),
);

// 7. GLOBAL ERROR HANDLER
// Must ALWAYS be the very last middleware.
app.use(errorHandler);

module.exports = app;
