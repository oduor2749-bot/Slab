# Slab
Mobile game for cash

This repository now includes a minimal Node.js service that matches the deployment expectations in `deploy/setup.sh`.

## Quick start

1. Install dependencies:
   npm install
2. Copy the environment example:
   cp .env.example .env
3. Fill in the values in `.env`.
4. Start the server:
   npm start

Endpoints:
- `GET /health`
- `GET /admin` with `X-Admin-Key` or `?key=`
- `POST /api/inbox/:secret`
- `GET /api/inbox/:secret`
- `POST /api/receipt`
- `GET /api/receipts`
