# Person 1 Security Report

Controls implemented:
- HMAC-SHA256 signed admission tokens.
- Event/session/user binding in token claims.
- Token expiry and version checks.
- Durable JTI replay protection.
- Session credentials stored as SHA-256 hashes.
- Session-bound reservation authorization.
- Queue-bypass protection.
- Mutation rate limiting.
- Production startup guard against the default HMAC secret.
- Secrets supplied through environment variables.
- Structured request logs without credentials/tokens.
- Generic 500 responses with correlation IDs rather than stack traces.

Deployment hardening: PostgreSQL and Redis are internal Compose services; only the API port is published.
