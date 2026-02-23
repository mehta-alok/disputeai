<div align="center">

# DisputeAI

### AI-Powered Hotel Chargeback Defense Platform

Protecting hotel revenue through intelligent fraud detection, automated evidence collection, and AI-driven dispute management.

![Node](https://img.shields.io/badge/Node.js-20%20LTS-339933?logo=nodedotjs&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)
![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen)

</div>

---

## Features

- **8 AI Agents** -- Autonomous fraud analysis, evidence processing, dispute strategy, security scanning, and more
- **30 PMS Integrations** -- Two-way sync with Opera, Mews, Cloudbeds, and 27 others (AutoClerk built-in emulator)
- **29 Dispute Processor Adapters** -- Visa VROL, Mastercom, Ethoca, Verifi, Stripe, Elavon, Chase, Fiserv, and more with portal sign-in and two-way sync
- **9 OTA Integrations** -- Booking.com, Expedia, Airbnb, Hotels.com, TripAdvisor, VRBO, Agoda, Priceline, Hotel Engine with real-time monitoring
- **Real-Time Reservation Search** -- Full-text search across all guest, booking, and payment fields
- **Automated Evidence Collection** -- 7 evidence types (ID scan, signatures, folio, key card logs, CCTV, correspondence, cancellation policy)
- **Interactive Tutorial & ChatHelp AI Assistant** -- Built-in onboarding walkthrough and contextual help
- **Role-Based Access Control** -- Admin, Manager, and Staff roles with property-level data isolation
- **Docker-Ready Deployment** -- Production and development Docker Compose configurations included
- **Demo Mode** -- Fully functional without PostgreSQL or Redis; graceful degradation with in-memory mock data

---

## Quick Start

```bash
# Clone the repository
git clone <repo-url>
cd Hotel.Chargeback.Fraud_OMNI

# Backend
cd backend
npm install
cp .env.example .env
node server.js  # Starts on port 8000 (demo mode auto-enabled)

# Frontend (open a new terminal)
cd frontend
npm install
npx vite --port 3000
```

The application will be available at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **Health Check**: http://localhost:8000/health

---

## Demo Credentials

| Role    | Email                        | Password         |
|---------|------------------------------|------------------|
| Admin   | admin@disputeai.com         | DisputeAdmin123!    |
| Manager | manager@disputeai.com       | DisputeManager123!  |
| Staff   | staff@disputeai.com         | DisputeStaff123!    |

---

## Tech Stack

| Layer     | Technologies                                              |
|-----------|-----------------------------------------------------------|
| Backend   | Node.js 20, Express 4.18, Prisma, PostgreSQL, Redis, BullMQ |
| Frontend  | React 18, Vite 5, Tailwind CSS 3.4, React Router 6, Recharts, Lucide React |
| AI        | OpenAI, Anthropic, Ollama (configurable provider)         |
| Storage   | AWS S3 (evidence), local filesystem fallback              |
| Infra     | Docker, Terraform (AWS), Vercel, Render/Railway           |

---

## Project Structure

```
Hotel.Chargeback.Fraud_OMNI/
├── backend/
│   ├── server.js              # Main entry point with demo mode detection
│   ├── config/                # Database, Redis, S3, storage configuration
│   ├── routes/                # 11 API route groups
│   │   ├── auth.js            #   Authentication & user management
│   │   ├── cases.js           #   Chargeback case CRUD
│   │   ├── evidence.js        #   Evidence upload & download
│   │   ├── analytics.js       #   Dashboard metrics & reports
│   │   ├── admin.js           #   Admin settings & user management
│   │   ├── disputes.js        #   Dispute company management
│   │   ├── notifications.js   #   Real-time notification system
│   │   ├── pms.js             #   PMS integration management
│   │   ├── reservations.js    #   Reservation lookup & linking
│   │   ├── sync.js            #   PMS data synchronization
│   │   └── webhooks.js        #   Payment processor webhooks
│   ├── services/              # Business logic & integrations
│   │   ├── aiAgents.js        #   8 autonomous AI agents
│   │   ├── aiClient.js        #   Multi-provider AI client
│   │   ├── aiDefenseConfig.js #   AI defense strategy configuration
│   │   ├── autoclerkEmulator.js # AutoClerk PMS emulator
│   │   ├── fraudDetection.js  #   AI fraud analysis engine
│   │   ├── pmsIntegration.js  #   30 PMS adapters
│   │   ├── disputeCompanies.js #  29 dispute processor adapters
│   │   ├── reservationMatcher.js # Reservation-to-case matching
│   │   └── queue/             #   BullMQ job queue & workers
│   ├── middleware/            # Auth, validation middleware
│   ├── data/                  # Mock data for demo mode
│   └── utils/                 # Logger, validators, helpers
├── frontend/
│   ├── src/
│   │   ├── pages/             # 12 page components
│   │   │   ├── Dashboard.jsx  #   Main dashboard with KPIs
│   │   │   ├── Cases.jsx      #   Case list & filtering
│   │   │   ├── CaseDetail.jsx #   Case detail with outcome & arbitration
│   │   │   ├── Analytics.jsx  #   Charts, trends, reports
│   │   │   ├── Reservations.jsx #  PMS reservation management
│   │   │   ├── PMSIntegration.jsx # PMS system connections
│   │   │   ├── DisputeIntegration.jsx # Dispute adapter management
│   │   │   ├── OTAIntegration.jsx # OTA channel connections
│   │   │   ├── Settings.jsx   #   System configuration
│   │   │   ├── Tutorial.jsx   #   Interactive tutorial page
│   │   │   ├── Contact.jsx    #   Contact form page
│   │   │   └── Login.jsx      #   Authentication page
│   │   ├── components/        # Shared UI components
│   │   │   ├── Layout.jsx     #   Sidebar, nav, mobile bottom bar
│   │   │   ├── ChatHelp.jsx   #   AI-powered help assistant
│   │   │   ├── Tutorial.jsx   #   Step-by-step tutorial overlay
│   │   │   ├── NotificationPanel.jsx # Real-time notification dropdown
│   │   │   ├── ReservationViewer.jsx # Reservation detail modal
│   │   │   └── GuestFolioViewer.jsx # Guest folio display
│   │   ├── hooks/             # useAuth context & state
│   │   └── utils/             # API client, helpers
│   └── vite.config.js         # Vite config with API proxy
├── backend-deploy/            # Production backend build
├── frontend-deploy/           # Production frontend build
├── infrastructure/            # Terraform AWS configs
├── docker-compose.yml         # Production deployment
├── docker-compose.dev.yml     # Development environment
└── start-dev.sh               # Development startup script
```

---

## API Documentation

### Route Groups

| #  | Route Group       | Base Path              | Key Endpoints                                         |
|----|-------------------|------------------------|-------------------------------------------------------|
| 1  | Authentication    | `/api/auth`            | `POST /login`, `POST /register`, `POST /refresh`, `GET /me` |
| 2  | Cases             | `/api/cases`           | `GET /`, `GET /:id`, `POST /`, `PATCH /:id/status`, `POST /:id/analyze` |
| 3  | Evidence          | `/api/evidence`        | `GET /case/:id`, `POST /upload/:id`, `GET /:id/download` |
| 4  | Analytics         | `/api/analytics`       | `GET /dashboard`, `GET /trends`, `GET /reports`       |
| 5  | Admin             | `/api/admin`           | `GET /users`, `POST /users`, `PATCH /settings`        |
| 6  | Disputes          | `/api/disputes`        | `GET /`, `POST /`, `PATCH /:id`, `DELETE /:id`        |
| 7  | Notifications     | `/api/notifications`   | `GET /`, `PATCH /:id/read`, `POST /read-all`          |
| 8  | PMS               | `/api/pms`             | `GET /systems`, `POST /connect`, `GET /status`        |
| 9  | Reservations      | `/api/reservations`    | `GET /`, `GET /:id`, `GET /search`, `GET /:id/folio`, `POST /:id/link` |
| 10 | Sync              | `/api/sync`            | `POST /trigger`, `GET /status`, `GET /history`        |
| 11 | Webhooks          | `/api/webhooks`        | `POST /stripe`, `POST /adyen`, `POST /shift4`, `POST /elavon` |

---

## Deployment

### Docker (Recommended for Local)

```bash
# Production mode (demo)
docker compose up --build

# Development mode (with DB + Redis)
docker compose -f docker-compose.dev.yml up --build
```

### Cloud Deployment

| Service | Platform | Config File |
|---------|----------|-------------|
| Frontend | Vercel | `frontend-deploy/vercel.json` |
| Backend | AWS ECS / Railway / Render | `backend-deploy/Dockerfile` |
| Database | AWS RDS / Railway Postgres | Prisma migrations |
| Cache | AWS ElastiCache / Railway Redis | Auto-configured |

### CI/CD

GitHub Actions workflows included:
- **ci.yml** -- Lint, test, build, Docker image validation on every push/PR
- **deploy.yml** -- Build and push to ECR, deploy to ECS on merge to main/develop

### Startup Scripts

```bash
./start-dev.sh          # Full development environment
./start-frontend.sh     # Frontend only
./start-production.sh   # Production deployment
```

---

## Environment Variables

All configuration is managed through environment variables. Copy `.env.example` to `.env` and update values as needed.

| Variable                    | Default                          | Description                              |
|-----------------------------|----------------------------------|------------------------------------------|
| `NODE_ENV`                  | `development`                    | Environment mode                         |
| `PORT`                      | `8000`                           | Backend server port                      |
| `HOST`                      | `0.0.0.0`                        | Server bind address                      |
| `API_BASE_URL`              | `http://localhost:8000`          | Backend API base URL                     |
| `FRONTEND_URL`              | `http://localhost:3000`          | Frontend URL for CORS                    |
| `DATABASE_URL`              | *(PostgreSQL connection string)* | Prisma database connection               |
| `REDIS_URL`                 | `redis://localhost:6379`         | Redis connection URL                     |
| `JWT_SECRET`                | *(required)*                     | Secret key for JWT signing               |
| `JWT_ACCESS_EXPIRY`         | `15m`                            | Access token expiration                  |
| `JWT_REFRESH_EXPIRY`        | `7d`                             | Refresh token expiration                 |
| `JWT_REFRESH_SECRET`        | *(required)*                     | Separate secret for refresh tokens       |
| `AWS_REGION`                | `us-east-1`                      | AWS region                               |
| `AWS_ACCESS_KEY_ID`         | --                               | AWS access key for S3                    |
| `AWS_SECRET_ACCESS_KEY`     | --                               | AWS secret key for S3                    |
| `AWS_S3_BUCKET`             | `disputeai-chargeback-evidence` | S3 bucket for evidence storage           |
| `AWS_S3_PRESIGNED_EXPIRY`   | `3600`                           | Presigned URL expiry (seconds)           |
| `AI_MODEL_PROVIDER`         | `ollama`                         | AI provider: `openai`, `anthropic`, `ollama` |
| `AI_MODEL_NAME`             | `llama3`                         | Model name for selected provider         |
| `OPENAI_API_KEY`            | --                               | OpenAI API key (if using openai)         |
| `DEMO_MODE`                 | `true`                           | Force demo mode (auto-enabled without DB)|
| `PMS_ENCRYPTION_KEY`        | --                               | 32-char key for PMS credential encryption|
| `STRIPE_SECRET_KEY`         | --                               | Stripe API secret key                    |
| `STRIPE_WEBHOOK_SECRET`     | --                               | Stripe webhook signature secret          |
| `ADYEN_API_KEY`             | --                               | Adyen API key                            |
| `ADYEN_HMAC_KEY`            | --                               | Adyen HMAC signature key                 |
| `SENDGRID_API_KEY`          | --                               | SendGrid email API key                   |
| `SLACK_WEBHOOK_URL`         | --                               | Slack incoming webhook URL               |
| `CORS_ORIGINS`              | `http://localhost:3000,http://localhost:5173` | Allowed CORS origins          |
| `RATE_LIMIT_MAX_REQUESTS`   | `100`                            | Max requests per rate limit window       |
| `AUTH_RATE_LIMIT_MAX_REQUESTS` | `20`                          | Max auth requests per window             |
| `LOG_LEVEL`                 | `debug`                          | Logging level                            |
| `BCRYPT_SALT_ROUNDS`        | `12`                             | bcrypt hashing rounds                    |
| `FEATURE_AI_AUTO_SUBMIT`    | `false`                          | Auto-submit high-confidence disputes     |
| `FEATURE_PMS_SYNC`          | `true`                           | Enable PMS synchronization               |
| `FEATURE_SLACK_NOTIFICATIONS` | `false`                        | Enable Slack alert notifications         |
| `FEATURE_EMAIL_NOTIFICATIONS` | `true`                         | Enable email notifications               |

---

## 68 Integrations

### PMS Adapters (30)

DisputeAI connects to 30 Property Management Systems with full two-way synchronization (inbound: reservations, guest data; outbound: notes, flags, alerts).

**Enterprise PMS (15)**:
AutoClerk (built-in emulator), Oracle Opera Cloud, Mews, Cloudbeds, Agilysys, Infor, Stayntouch, RoomKey, Maestro, Hotelogix, RMS Cloud, Protel, eZee, SIHOT, innRoad

**Boutique & Independent PMS (6)**:
Little Hotelier, Frontdesk Anywhere, WebRezPro, ThinkReservations, ResNexus, Guestline

**Vacation Rental PMS (4)**:
Guesty, Hostaway, Lodgify, Escapia

**Brand-Specific PMS (5)**:
Marriott GXP (Bonvoy), Hilton OnQ (Honors), Hyatt Opera (World of Hyatt), IHG Concerto (One Rewards), Best Western (BWR)

### Dispute Processors (29)

All dispute companies include portal sign-in links, API configuration modal, and two-way sync status.

**Hospitality Prevention Networks (3)**:
Verifi (Visa CDRN/RDR), Ethoca (Mastercard), Merlink

**Hospitality-Specific Services (11)**:
StaySettle, Win Chargebacks, Chargeback Gurus, ChargebackHelp, Clearview, CAVU, TailoredPay, Chargeblast, Chargebacks911, Midigator, Riskified

**Card Network Portals (4)**:
Visa VROL, Mastercom, AMEX Merchant, Discover Dispute

**Merchant Processor Portals (9)**:
Chase Merchant Services, Stripe Disputes, Elavon, Fiserv, Global Payments, TSYS, Square, Authorize.net, Worldpay

**Third-Party Fraud Prevention (2)**:
Kount, Signifyd

---

## AI Agents

DisputeAI employs 8 autonomous AI agents for continuous platform operations.

| Agent                  | Purpose                                  | Trigger        |
|------------------------|------------------------------------------|----------------|
| Dispute Analyzer       | Analyzes chargeback cases for win probability | Event-driven |
| Evidence Processor     | Processes and categorizes uploaded evidence | Event-driven  |
| Backlog Manager        | Creates and prioritizes development tasks | Daily          |
| Code Reviewer          | Reviews pull requests for quality issues | Event-driven   |
| Security Scanner       | Scans codebase for vulnerabilities       | Daily          |
| Documentation Agent    | Generates and updates API documentation  | Weekly         |
| Test Generator         | Creates unit and integration tests       | Event-driven   |
| Performance Monitor    | Monitors system health and performance   | Continuous     |

---

## AI Fraud Detection

The system analyzes chargebacks using a weighted scoring model.

### Confidence Score Components

| Component        | Weight | Description                                  |
|------------------|--------|----------------------------------------------|
| Reason Code      | 40%    | Historical win rates by dispute type         |
| Evidence         | 35%    | Completeness of uploaded documentation       |
| Fraud Indicators | 25%    | Positive and negative behavioral signals     |

### Recommendations

| Score    | Recommendation         | Action                        |
|----------|------------------------|-------------------------------|
| 85-100%  | AUTO_SUBMIT            | Submit defense immediately    |
| 70-84%   | REVIEW_RECOMMENDED     | Manual review required        |
| 50-69%   | GATHER_MORE_EVIDENCE   | Missing documentation         |
| 0-49%    | UNLIKELY_TO_WIN        | Consider accepting the loss   |

### Evidence Types (7)

| Evidence Type            | Weight | Priority     |
|--------------------------|--------|--------------|
| ID Scan                  | 20%    | Required     |
| Authorization Signature  | 20%    | Required     |
| Checkout Signature       | 15%    | Recommended  |
| Guest Folio              | 15%    | Required     |
| Key Card Log             | 10%    | Recommended  |
| Correspondence           | 10%    | Optional     |
| CCTV Footage             | 5%     | Optional     |

---

## Security

- **Authentication**: JWT with refresh token rotation
- **Password Hashing**: bcrypt (12 salt rounds)
- **Rate Limiting**: 100 requests per 15 minutes (20 for auth endpoints)
- **Webhook Verification**: Signature validation for all payment processors
- **RBAC**: Role-based access control with property-level data isolation
- **Security Headers**: Helmet middleware
- **Token Blacklisting**: Redis-backed token revocation
- **CORS**: Configurable origin allowlist

---

## License

MIT

---

<div align="center">

**DisputeAI** -- AI-Powered Hotel Chargeback Defense Platform

</div>
