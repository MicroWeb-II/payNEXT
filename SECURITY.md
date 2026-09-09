# 🔐 Security Measures in payNEXT

This document outlines the security implementations in the payNEXT architecture.

## 1. Transport Layer Security

- **HTTPS Enforcement:** Caddy automatically provisions Let's Encrypt SSL certificates and redirects all HTTP traffic to HTTPS.
- **Security Headers:** `helmet.js` is configured globally to set secure HTTP headers (HSTS, X-Frame-Options, etc.).

## 2. Access Control & Rate Limiting

- **Rate Limiting:** Authentication endpoints (`/api/v1/auth/login`, `/register`) are restricted to 5 requests per 15 minutes per IP to prevent brute-force attacks.
- **CORS:** Strict origin whitelisting is enforced. Only `https://paynextt.me` and `http://localhost:8080` are permitted.

## 3. Input Validation & Injection Prevention

- **SQL Injection:** All PostgreSQL queries use parameterized inputs via the `pg` library.
- **XSS & Data Sanitization:** `express-validator` is used to trim, escape, and validate all incoming user inputs before processing.

## 4. Infrastructure & Load Balancing

- **Reverse Proxy:** Caddy acts as the single entry point, routing `/api/*` to the backend and `/` to the Nginx frontend.
- **Load Balancing:** The API service can be scaled horizontally (`docker-compose up --scale api=2`). Caddy distributes traffic across instances using a `round_robin` policy.

## 5. How to Test

See the repository wiki or run the provided `curl` commands in `TESTING.md` to verify rate limiting, CORS, and header configurations.
