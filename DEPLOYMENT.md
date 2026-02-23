# DisputeAI - Deployment Guide

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Local Development](#local-development)
3. [Docker Deployment](#docker-deployment)
4. [Vercel Deployment (Frontend)](#vercel-deployment-frontend)
5. [Render/Railway Deployment (Backend)](#renderrailway-deployment-backend)
6. [Environment Variables Reference](#environment-variables-reference)
7. [Production Checklist](#production-checklist)
8. [Monitoring](#monitoring)

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | **20 LTS** (REQUIRED) | Do NOT use Node 25 -- `require()` is extremely slow (37s+ for dotenv). Use Node 20 LTS for reliable performance. |
| **npm** | 10+ | Ships with Node.js 20 LTS |
| **Docker & Docker Compose** | Latest | Required for containerized deployment only |
| **PostgreSQL** | 15+ | Production only. Not needed for demo mode. |
| **Redis** | 7+ | Optional. Enables caching, session management, and BullMQ job queues. |
| **Git** | Latest | For cloning the repository |

---

## Local Development

### Demo Mode (Fastest -- No Database Required)

Demo mode starts the application without PostgreSQL or Redis. The server auto-detects missing connections and falls back to in-memory mock data.

```bash
# 1. Clone the repository
git clone https://github.com/mehta-alok/disputeai.git
cd disputeai

# 2. Start the backend (port 8000)
cd backend
npm install
cp .env.example .env        # Ensure JWT_SECRET is set in .env
node server.js

# 3. Start the frontend (new terminal, port 3000)
cd frontend
npm install
npx vite --host --port 3000
```

### Demo Credentials

| Email | Password | Role |
|-------|----------|------|
| admin@disputeai.com | DisputeAdmin123! | Admin |
| manager@disputeai.com | DisputeManager123! | Manager |
| staff@disputeai.com | DisputeStaff123! | Staff |

### Access Points

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **Health Check**: http://localhost:8000/health

### Full Local Development (With Database)

```bash
# 1. Start infrastructure
docker-compose up -d postgres redis

# 2. Setup backend
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev

# 3. Setup frontend (new terminal)
cd frontend
npm install
npm run dev
```

### Using Startup Scripts

```bash
# Development mode (backend + frontend)
./start-dev.sh

# Frontend only
./start-frontend.sh

# Production mode
./start-production.sh
```

---

## Docker Deployment

### Using docker-compose.yml (Production / Demo)

```bash
# Build and start backend + frontend containers (demo mode)
docker compose up --build

# Backend: http://localhost:8000
# Frontend: http://localhost:3000 (served via Nginx on port 80, mapped to 3000)
```

### Development Docker Compose (Full Stack with Hot Reload)

```bash
# Option 1: Run just DB + Redis, run backend/frontend natively
docker compose -f docker-compose.dev.yml up -d postgres redis

# Option 2: Run everything in Docker (DB, Redis, backend, frontend)
docker compose -f docker-compose.dev.yml up --build

# View logs
docker compose -f docker-compose.dev.yml logs -f backend

# Stop all services
docker compose -f docker-compose.dev.yml down
```

### Running Migrations in Docker

```bash
# Exec into the running backend container
docker compose -f docker-compose.dev.yml exec backend npx prisma migrate deploy
```

---

## Vercel Deployment (Frontend)

### Setup

1. Push the `frontend/` directory (or a `frontend-deploy/` directory) to a GitHub repository.
2. Connect the repository to [Vercel](https://vercel.com).
3. Set the **Root Directory** to `frontend` (or `frontend-deploy`).
4. Set the **Build Command** to `npm run build`.
5. Set the **Output Directory** to `dist`.

### vercel.json

Ensure a `vercel.json` exists in the frontend root to handle SPA routing and API proxy:

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "https://your-backend-url.com/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### Environment Variables (Vercel Dashboard)

Set the following in the Vercel project settings under **Environment Variables**:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://your-backend-url.com` |

### Deploy

```bash
# Deploy via Vercel CLI
npx vercel --prod

# Or push to the connected GitHub branch for automatic deployment
```

---

## Render/Railway Deployment (Backend)

### Render

1. Push the `backend/` directory (or a `backend-deploy/` directory) to a GitHub repository.
2. Create a new **Web Service** on [Render](https://render.com).
3. Connect the repository.
4. Set the **Root Directory** to `backend` (or `backend-deploy`).
5. Set the **Runtime** to **Node** and ensure the **Node version is 20** (not 25).
6. Set the **Build Command** to `npm install`.
7. Set the **Start Command** to `node server.js`.
8. Add all required environment variables (see [Environment Variables Reference](#environment-variables-reference)).

A Dockerfile is included in the backend for custom builds:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 8000
CMD ["node", "server.js"]
```

### Railway

1. Push the `backend/` directory to a GitHub repository.
2. Create a new project on [Railway](https://railway.app).
3. Connect the repository and select the backend directory.
4. Railway auto-detects Node.js. Ensure it uses **Node 20** by setting `NODE_VERSION=20` in environment variables or adding an `.nvmrc` file containing `20`.
5. Set the **Start Command** to `node server.js`.
6. Add all required environment variables.
7. Optionally add a **PostgreSQL** and **Redis** plugin directly in Railway.

---

## Environment Variables Reference

### Core Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment mode | `development` | Yes |
| `PORT` | Server listen port | `8000` | No |
| `HOST` | Server bind address | `0.0.0.0` | No |
| `API_BASE_URL` | Backend base URL | `http://localhost:8000` | No |
| `FRONTEND_URL` | Frontend base URL | `http://localhost:3000` | No |
| `DEMO_MODE` | Force demo mode (auto-enabled when DB unavailable) | `true` | No |

### Database (PostgreSQL)

| Variable | Description | Default | Required (Production) |
|----------|-------------|---------|----------------------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://...@localhost:5432/disputeai_chargeback` | Yes |
| `DB_HOST` | Database host | `localhost` | No |
| `DB_PORT` | Database port | `5432` | No |
| `DB_NAME` | Database name | `disputeai_db` | No |
| `DB_USER` | Database user | `disputeai` | No |
| `DB_PASSWORD` | Database password | `disputeai_password` | No |
| `DB_SSL` | Enable SSL connections | `false` | No |
| `DB_POOL_MIN` | Minimum connection pool size | `2` | No |
| `DB_POOL_MAX` | Maximum connection pool size | `10` | No |

### Redis

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` | No |
| `REDIS_HOST` | Redis host | `localhost` | No |
| `REDIS_PORT` | Redis port | `6379` | No |
| `REDIS_PASSWORD` | Redis password | _(empty)_ | No |
| `REDIS_TLS` | Enable TLS for Redis | `false` | No |

### Authentication (JWT)

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `JWT_SECRET` | Secret key for signing JWT access tokens | _(must be set)_ | **Yes** |
| `JWT_REFRESH_SECRET` | Secret key for signing JWT refresh tokens | _(must be set)_ | **Yes** |
| `JWT_ACCESS_EXPIRY` | Access token expiration | `15m` | No |
| `JWT_REFRESH_EXPIRY` | Refresh token expiration | `7d` | No |

### AWS / S3

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `AWS_REGION` | AWS region | `us-east-1` | No |
| `AWS_ACCESS_KEY_ID` | AWS access key | _(none)_ | For S3 uploads |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | _(none)_ | For S3 uploads |
| `AWS_S3_BUCKET` | S3 bucket name for evidence files | `disputeai-chargeback-evidence` | For S3 uploads |
| `S3_BUCKET_REGION` | S3 bucket region | `us-east-1` | No |
| `AWS_S3_PRESIGNED_EXPIRY` | Presigned URL expiry in seconds | `3600` | No |

### AI Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `AI_MODEL_PROVIDER` | AI provider: `openai`, `anthropic`, or `ollama` | `ollama` | No |
| `AI_MODEL_NAME` | Model name for Ollama | `llama3` | No |
| `OLLAMA_BASE_URL` | Ollama server URL | `http://localhost:11434` | For Ollama |
| `OPENAI_API_KEY` | OpenAI API key | _(none)_ | For OpenAI |
| `AI_MODEL` | OpenAI model name | `gpt-4-turbo` | No |
| `AI_TEMPERATURE` | AI sampling temperature | `0.3` | No |
| `AI_MAX_TOKENS` | Maximum tokens per AI response | `4096` | No |
| `AI_AUTO_SUBMIT_THRESHOLD` | Confidence score to auto-submit disputes | `85` | No |
| `AI_REVIEW_THRESHOLD` | Confidence score requiring manual review | `70` | No |

### PMS Integration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PMS_ENCRYPTION_KEY` | 32-character key for encrypting PMS credentials | _(none)_ | For PMS integrations |
| `OPERA_CLOUD_CLIENT_ID` | Oracle Opera Cloud client ID | _(none)_ | For Opera Cloud |
| `OPERA_CLOUD_CLIENT_SECRET` | Oracle Opera Cloud client secret | _(none)_ | For Opera Cloud |
| `MEWS_CLIENT_TOKEN` | Mews PMS client token | _(none)_ | For Mews |
| `MEWS_ACCESS_TOKEN` | Mews PMS access token | _(none)_ | For Mews |
| `CLOUDBEDS_CLIENT_ID` | Cloudbeds client ID | _(none)_ | For Cloudbeds |
| `CLOUDBEDS_CLIENT_SECRET` | Cloudbeds client secret | _(none)_ | For Cloudbeds |
| `AUTOCLERK_API_KEY` | AutoClerk API key | _(none)_ | For AutoClerk |
| `AUTOCLERK_PROPERTY_ID` | AutoClerk property ID | _(none)_ | For AutoClerk |

### Payment Processor Webhooks

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `STRIPE_SECRET_KEY` | Stripe secret key | _(none)_ | For Stripe |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | _(none)_ | For Stripe webhooks |
| `ADYEN_API_KEY` | Adyen API key | _(none)_ | For Adyen |
| `ADYEN_MERCHANT_ACCOUNT` | Adyen merchant account ID | `DisputeAIHotels` | For Adyen |
| `ADYEN_HMAC_KEY` | Adyen HMAC key for webhook verification | _(none)_ | For Adyen webhooks |
| `SHIFT4_SECRET_KEY` | Shift4 secret key | _(none)_ | For Shift4 |
| `SHIFT4_WEBHOOK_SECRET` | Shift4 webhook signing secret | _(none)_ | For Shift4 webhooks |

### Email (SendGrid)

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SENDGRID_API_KEY` | SendGrid API key | _(none)_ | For email notifications |
| `EMAIL_FROM` | Sender email address | `noreply@disputeai.com` | No |
| `EMAIL_FROM_NAME` | Sender display name | `DisputeAI System` | No |

### Slack Integration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL | _(none)_ | For Slack alerts |
| `SLACK_BOT_TOKEN` | Slack bot token | _(none)_ | For Slack alerts |
| `SLACK_CHANNEL` | Slack channel for alerts | `#chargeback-alerts` | No |

### Security & Rate Limiting

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `CORS_ORIGINS` | Comma-separated allowed CORS origins | `http://localhost:3000,http://localhost:5173` | Yes (production) |
| `BCRYPT_SALT_ROUNDS` | bcrypt hashing rounds | `12` | No |
| `ENCRYPTION_KEY` | 32-byte key for general encryption | _(none)_ | For encryption features |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in milliseconds | `900000` (15 min) | No |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window (general API) | `100` | No |
| `AUTH_RATE_LIMIT_MAX_REQUESTS` | Max requests per window (auth endpoints) | `20` | No |

### Logging

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `LOG_LEVEL` | Winston log level: `error`, `warn`, `info`, `debug` | `debug` | No |
| `LOG_FORMAT` | Log format | `combined` | No |
| `LOG_FILE_PATH` | Directory for log files | `./logs` | No |

### Feature Flags

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `FEATURE_AI_AUTO_SUBMIT` | Enable AI auto-submission of disputes | `false` | No |
| `FEATURE_PMS_SYNC` | Enable PMS synchronization | `true` | No |
| `FEATURE_SLACK_NOTIFICATIONS` | Enable Slack alert notifications | `false` | No |
| `FEATURE_EMAIL_NOTIFICATIONS` | Enable email notifications | `true` | No |

---

## Production Checklist

Before deploying to production, complete the following:

### Security

- [ ] Change `JWT_SECRET` to a strong, unique value (at least 64 characters)
- [ ] Change `JWT_REFRESH_SECRET` to a different strong, unique value
- [ ] Set `NODE_ENV=production`
- [ ] Set `BCRYPT_SALT_ROUNDS=12` or higher
- [ ] Set `ENCRYPTION_KEY` to a secure 32-byte key
- [ ] Set `PMS_ENCRYPTION_KEY` to a secure 32-character key

### Database

- [ ] Configure a production PostgreSQL 15+ instance
- [ ] Set `DATABASE_URL` with SSL enabled (`?ssl=true&sslmode=require`)
- [ ] Run Prisma migrations: `npx prisma migrate deploy`
- [ ] Set `DB_SSL=true`
- [ ] Configure connection pool limits (`DB_POOL_MIN`, `DB_POOL_MAX`)

### Redis

- [ ] Configure a production Redis 7+ instance
- [ ] Set `REDIS_URL` with authentication
- [ ] Set `REDIS_TLS=true` if using TLS
- [ ] Set `REDIS_PASSWORD`

### Storage

- [ ] Create an S3 bucket for evidence files
- [ ] Set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_S3_BUCKET`
- [ ] Configure appropriate S3 bucket policies and CORS

### AI Provider

- [ ] Choose an AI provider (`openai`, `anthropic`, or `ollama`)
- [ ] Set the corresponding API key (`OPENAI_API_KEY`, etc.)
- [ ] Configure `AI_AUTO_SUBMIT_THRESHOLD` and `AI_REVIEW_THRESHOLD`

### Networking

- [ ] Set `CORS_ORIGINS` to your production frontend domain(s)
- [ ] Set `FRONTEND_URL` to your production frontend URL
- [ ] Set `API_BASE_URL` to your production backend URL
- [ ] Enable HTTPS (terminate SSL at load balancer or reverse proxy)

### Notifications (Optional)

- [ ] Configure SendGrid for email notifications (`SENDGRID_API_KEY`)
- [ ] Configure Slack webhook for alerts (`SLACK_WEBHOOK_URL`)

### Monitoring

- [ ] Verify health endpoint is accessible: `GET /health`
- [ ] Set `LOG_LEVEL=info` (not `debug` in production)
- [ ] Configure external monitoring (uptime checks, error tracking)

---

## Monitoring

### Health Check Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Basic health check. Returns `200 OK` if the server is running. |
| `/ready` | GET | Readiness check. Verifies database and Redis connectivity. |

### Example Health Check

```bash
# Basic health
curl http://localhost:8000/health

# Readiness (includes DB and Redis status)
curl http://localhost:8000/ready
```

### Recommended Monitoring Setup

- **Uptime monitoring**: Configure an external service (e.g., UptimeRobot, Pingdom) to poll `GET /health` every 60 seconds.
- **Log aggregation**: Stream Winston logs to a centralized service (e.g., Datadog, Papertrail, CloudWatch Logs).
- **Error tracking**: Integrate Sentry or similar for runtime error capture.
- **Metrics**: Monitor response times, error rates, and queue depths via your hosting platform's built-in metrics.
