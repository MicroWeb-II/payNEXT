const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const routes = require("./routes");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// 1. TRUST PROXY (CRITICAL)
// Tells Express to trust the first proxy (Caddy/Cloudflare).
// This ensures rate limiting and logging use the real client IP, not the Docker/Cloudflare IP.
app.set("trust proxy", 1);

// 2. SECURITY HEADERS
// Must be near the top to protect all subsequent routes
app.use(helmet());

// 3. CORS CONFIGURATION
// Restrict access to only your known frontend domains
const allowedOrigins = [
  "https://paynextt.me",
  "http://localhost:80", // Adjust if your local frontend runs on a different port
  "http://localhost:3000",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (e.g., mobile apps, curl, Postman, or server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, // Allow cookies or Authorization headers to be sent
  }),
);

// 4. BODY PARSERS
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Helpful if you ever accept form submissions

// 5. ROUTES
// All /api/v1/* requests go here (where your rate-limited auth routes live)
app.use("/api/v1", routes);

// 6. 404 NOT FOUND HANDLER
// Must be placed AFTER all valid routes.
// If a request reaches here, it means no route matched.
app.use((req, res) =>
  res.status(404).json({ success: false, error: "Route not found" }),
);

// 7. GLOBAL ERROR HANDLER
// Must ALWAYS be the very last middleware.
// It catches errors passed via next(err) from routes or controllers.
app.use(errorHandler);

module.exports = app;
