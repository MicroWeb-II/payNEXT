# 🔐 Security Measures in payNEXT

This document outlines the security implementations in the payNEXT architecture.

## 1. Transport Layer Security

- **HTTPS Enforcement:** Caddy automatically provisions Let's Encrypt SSL certificates and redirects all HTTP traffic to HTTPS.
- **Security Headers:** `helmet.js` is configured globally to set secure HTTP headers (HSTS, X-Frame-Options, etc.).

## 2. Access Control & Rate Limiting

- **Rate Limiting:** Authentication endpoints (`/api/v1/auth/login`, `/register`) are rate limited per IP. Money and read routes have per-IP and per-user limits.
- **CORS:** Production allowed origins are configured through `ALLOWED_ORIGINS`; an empty value closes browser cross-origin access.

## 3. Input Validation & Injection Prevention

- **SQL Injection:** All PostgreSQL queries use parameterized inputs via the `pg` library.
- **Input validation:** Express validators check route inputs, and money controllers enforce amount limits before processing.

## 4. Infrastructure

- **Reverse Proxy:** Caddy routes `/api/*` to the backend and `/` to the Nginx frontend.

## 5. Token lifecycle

Access tokens expire after 15 minutes. Refresh token rotation is a follow-up: the current client has no refresh-token storage or rotation endpoint, so users must sign in again when an access token expires. Implement rotation with hashed, revocable refresh-token records and reuse detection before adding automatic renewal.

Production deployment secrets are supplied through GitHub Actions secrets and copied directly to the host as `/opt/paynext/.env`. The deployment archive excludes `.env` files.
