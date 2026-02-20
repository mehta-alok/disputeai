# AccuDefend - System Architecture & Customer Flows

**Version:** 4.0
**Last Updated:** February 2026

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Customer Journey](#2-customer-journey)
3. [Chargeback Dispute Flow](#3-chargeback-dispute-flow)
4. [AI Strategy](#4-ai-strategy)
5. [API Specifications](#5-api-specifications)
6. [Deployment Configuration](#6-deployment-configuration)
7. [Merlink Portal Integration](#7-merlink-portal-integration)

---

## 1. System Architecture

### 5-Layer Architecture Overview

**Layer 1: Presentation Layer**
- Web Dashboard (React 18 SPA with Vite)
- 9 Pages: Dashboard, Cases, CaseDetail, Analytics, Settings, PMSIntegration, DisputeIntegration, Tutorial, Login
- 7 Components: Layout, Tutorial/Help, NotificationPanel, OutcomeTab, ArbitrationModal, ReservationViewer, GuestFolioViewer
- OutcomeTab (~250 lines): Displays WON/LOST resolution data, win factors, denial reasons, and arbitration options
- ArbitrationModal (~250 lines): 3-step modal wizard (Review, Evidence & Narrative, Confirm) for filing arbitration on LOST cases
- Tailwind CSS 3 for responsive design

**Layer 2: API Gateway**
- NGINX reverse proxy (production) or AWS ALB
- Load balancing and rate limiting (100 req/15min)
- JWT authentication and routing
- Helmet security middleware

**Layer 3: Business Logic**
- Node.js 20 / Express 4 backend (compatible with Node.js v25.5)
- 10 route handlers (auth, cases, evidence, analytics, admin, disputes, notifications, pms, reservations, webhooks)
- Arbitration endpoint: `POST /api/cases/:id/arbitration` for filing arbitration on lost disputes
- 8 service modules:
  - fraudDetection.js - AI confidence scoring engine
  - aiDefenseConfig.js - AI defense configuration
  - aiAgents.js - Autonomous AI agent orchestration
  - backlog.js - Technical backlog management
  - integrations.js - Third-party API management
  - pmsIntegration.js - PMS connection handler
  - pmsSyncService.js - PMS data synchronization
  - disputeCompanies.js - Dispute company integrations (Merlink)
- 2 controllers (documents, notifications)

**Layer 4: Data Layer**
- PostgreSQL 16 - Transactional data (via Prisma 5 ORM)
- Redis 7 - Caching, sessions, rate limiting, token blacklisting
- AWS S3 - Evidence file storage (cross-region replication)

**Layer 5: External Integrations**
- Payment Processors: Stripe, Adyen, Shift4, Elavon
- Property Management Systems: 30 PMS systems in 4 categories - Enterprise (15: Oracle Opera Cloud, Mews, Cloudbeds, AutoClerk, Agilysys, Infor, Stayntouch, RoomKey, Maestro, Hotelogix, RMS Cloud, Protel, eZee, SIHOT, innRoad), Boutique/Independent (6), Vacation Rental (4), Brand-Specific (5 with loyalty programs including Marriott Bonvoy, Hilton Honors, World of Hyatt, IHG One Rewards, Best Western Rewards)
- Dispute/Chargeback Portals: 21 adapters - Prevention (3: Verifi (Visa CDRN/RDR), Ethoca (Mastercard), Merlink), Card Networks (4: Visa VROL, Mastercom, AMEX Merchant, Discover Dispute), Merchant Processors (9: Elavon, Fiserv, Worldpay, Chase Merchant, Global Payments, TSYS, Square, Stripe, Authorize.net), Third-Party (5: Chargebacks911, Kount, Midigator, Signifyd, Riskified)
- All 51 integrations implement full two-way sync
- Demo mode support: server starts gracefully without DB/Redis, includes 10 pre-loaded reservations across 4 PMS sources (Opera Cloud, Mews, Cloudbeds, Maestro)
- AI Services: OpenAI, Anthropic APIs
- Notification Services

---

## 2. Customer Journey

### Phase 1: Booking (Day 0)
- Customer makes reservation
- System runs fraud assessment
- Card validation
- Evidence: Timestamp, IP, device fingerprint

### Phase 2: Pre-Arrival (24-48 hours)
- Customer uploads government ID
- Signs digital authorization
- System validates ID
- Evidence: ID scan, signature, timestamp

### Phase 3: Check-In (Arrival)
- Front desk scans physical ID
- Guest signature captured
- Card authorization
- Evidence: ID, signature, authorization

### Phase 4: During Stay
- System logs all charges
- Monitors spending patterns
- Builds audit trail
- Evidence: Itemized folio, timestamps

### Phase 5: Check-Out
- Final charges processed
- Receipt generated
- Guest signature on folio
- Evidence: Final folio, signature, receipt

### Phase 6: Post-Stay (0-120 days)
- Monitor for chargebacks
- Evidence maintained 180 days
- Ready for dispute response
- **Dispute resolution outcomes:** WON cases display win factors, recovered amount, and processor statement; LOST cases display denial reason, denial code, and evidence gaps
- **Arbitration filing:** For LOST cases, staff can file arbitration through a 3-step workflow (Review, Evidence & Narrative, Confirm) via `POST /api/cases/:id/arbitration`
- **Resolution banners:** Color-coded banners (green/red) indicate case outcome at a glance

---

## 3. Chargeback Dispute Flow

### Step 1: Chargeback Filed
- **Status:** Dispute Initiated
- Customer disputes charge
- Funds refunded to customer
- Hotel account debited

### Step 2: Webhook Received
- **Response Time:** 30 seconds
- System receives notification via `/api/webhooks/{processor}`
- Automatic case creation
- Manager alert sent via notification panel

### Step 3: Evidence Auto-Generation
- **Processing Time:** 2-5 minutes
- Compiles ID scans from S3
- Gathers signatures
- Pulls folio and authorization
- Generates PDF evidence packet

### Step 4: AI Analysis
- Confidence score calculated (0-100):
  - Reason Code Base: 40%
  - Evidence Completeness: 35%
  - Fraud Indicators: ±25 points
- Recommendation generated:
  - 85-100%: AUTO_SUBMIT
  - 70-84%: REVIEW_RECOMMENDED
  - 50-69%: GATHER_MORE_EVIDENCE
  - 0-49%: UNLIKELY_TO_WIN

### Step 5: Manager Review (if needed)
- **Window:** 24 hours or auto-submit (configurable)
- Manager receives notification
- Can approve, edit, or override
- Most high-confidence cases auto-approved

### Step 6: Auto-Submission
- **Deadline:** 7-21 days
- Evidence submitted via processor API
- Confirmation received
- Case tracking assigned

### Step 7: Bank Review
- **Period:** 10-30 days
- Bank reviews evidence
- Analyst evaluates claim

### Step 8: Outcome
- **WIN:** Funds returned to hotel, case marked as won, evidence archived
- **LOSS:** Chargeback stands, guest flagged, case analyzed for improvements

---

## 4. AI Strategy

### Current Implementation: Hybrid Approach

Combines weighted scoring for fraud detection with configurable AI services for document processing.

| Component | Approach | Details |
|-----------|----------|---------|
| Fraud Scoring | Weighted Algorithm | 40% reason code + 35% evidence + 25% indicators |
| Evidence Analysis | AI-Powered | Confidence scoring with recommendation engine |
| Backlog Management | AI Agents | Autonomous agents for task creation/prioritization |
| Document Processing | OCR + AI | Evidence extraction and validation |

### AI Agents (Implemented)

| Agent | Purpose | Schedule |
|-------|---------|----------|
| Backlog Manager | Create/prioritize backlog items | Daily |
| Code Reviewer | Review pull requests | Event-driven |
| Security Scanner | Scan for vulnerabilities | Daily |
| Dispute Analyzer | Analyze chargeback cases | Event-driven |
| Evidence Processor | Process evidence documents | Event-driven |

### Evidence Weights

| Evidence Type | Weight | Priority |
|---------------|--------|----------|
| ID Scan | 20% | Required |
| Authorization Signature | 20% | Required |
| Checkout Signature | 15% | Recommended |
| Guest Folio | 15% | Required |
| Key Card Log | 10% | Recommended |
| Correspondence | 10% | Optional |
| CCTV Footage | 5% | Optional |
| Cancellation Policy | 5% | Conditional |

---

## 5. API Specifications

### Implemented API Routes

```
Authentication:
  POST   /api/auth/login
  POST   /api/auth/register
  POST   /api/auth/refresh
  POST   /api/auth/logout
  GET    /api/auth/me

Cases:
  GET    /api/cases
  GET    /api/cases/:id
  POST   /api/cases
  PATCH  /api/cases/:id/status
  POST   /api/cases/:id/analyze
  POST   /api/cases/:id/arbitration

Evidence:
  GET    /api/evidence/case/:id
  POST   /api/evidence/upload/:id
  GET    /api/evidence/:id/download
  DELETE /api/evidence/:id

Analytics:
  GET    /api/analytics/dashboard
  GET    /api/analytics/trends
  GET    /api/analytics/by-reason
  GET    /api/analytics/by-property

Admin:
  GET    /api/admin/users
  PATCH  /api/admin/users/:id
  GET    /api/admin/properties
  GET    /api/admin/config
  PUT    /api/admin/config
  GET    /api/admin/storage/status

Webhooks:
  POST   /api/webhooks/stripe
  POST   /api/webhooks/adyen
  POST   /api/webhooks/shift4
  POST   /api/webhooks/elavon

Disputes:
  GET    /api/disputes
  POST   /api/disputes
  PATCH  /api/disputes/:id
  DELETE /api/disputes/:id

Notifications:
  GET    /api/notifications
  PATCH  /api/notifications/:id/read
  POST   /api/notifications/read-all

PMS:
  GET    /api/pms
  POST   /api/pms/connect
  POST   /api/pms/:id/sync
  DELETE /api/pms/:id

Reservations:
  GET    /api/reservations              # List with filters (demo: 10 reservations)
  GET    /api/reservations/:id          # Detail with folio
  GET    /api/reservations/search       # Search reservations
  GET    /api/reservations/:id/folio    # Guest folio data
  POST   /api/reservations/:id/link     # Manual chargeback linking
```

> **Data Normalization:** Reservation data from different PMS sources flows through `flattenReservation()` to normalize field names (e.g., `guest_name` / `guestName` / `GuestFullName` all map to `guestName`) before reaching the frontend.

---

## 6. Deployment Configuration

### AWS Multi-Region Architecture

- **Primary:** us-east-1
- **Secondary:** us-west-2 (failover)
- **EU Region:** eu-west-1

### Infrastructure (Terraform IaC)

| Service | Configuration | Details |
|---------|---------------|---------|
| Compute | ECS Fargate | Backend (3), Frontend (2), AI Agent (2) tasks |
| Database | Aurora PostgreSQL | Multi-AZ, 3 instances |
| Cache | ElastiCache Redis | 3-node cluster |
| Storage | S3 | Cross-region replication |
| CDN | CloudFront | Global edge locations |
| DNS | Route 53 | Health checks, failover |
| Load Balancer | ALB | SSL termination |
| Secrets | Secrets Manager | Encrypted credentials |
| Queues | SQS | Webhook processing |
| Notifications | SNS | Alerts and monitoring |
| Monitoring | CloudWatch | Alarms and dashboards |

### Deployment Environments

| Environment | URL | Purpose |
|-------------|-----|---------|
| Local | http://localhost:3000 | Developer machines |
| Development | https://dev.accudefend.com | Dev testing |
| Staging | https://staging.accudefend.com | QA/UAT |
| Production | https://app.accudefend.com | Live system |

### Docker Configuration

- `docker-compose.yml` - Production (PostgreSQL 16, Redis 7, Backend, Frontend, Migrate)
- `docker-compose.dev.yml` - Development with hot-reload
- `Dockerfile` (backend) - Production container
- `Dockerfile.dev` (backend) - Development container with nodemon
- `Dockerfile` (frontend) - Production with Nginx
- Startup scripts: `start-dev.sh`, `start-production.sh`, `start-frontend.sh`

---

## 7. Merlink Portal Integration

### Status: Implemented

- 2-way sync with Merlink dispute management portal
- Dispute company CRUD operations
- Automated status synchronization
- Managed via DisputeIntegration.jsx frontend page
- Backend: `disputeCompanies.js` service + `disputes.js` route

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | January 27, 2026 | Initial architecture and customer flow document |
| 2.0 | February 2026 | Updated to reflect: current tech stack (React 18, Node.js 20, PostgreSQL 16), all 9 routes, 8 services, 2 controllers, dispute integration, notifications, 12+ PMS systems, Terraform IaC, multi-region AWS, Docker configs |
| 3.0 | February 2026 | Expanded to 51 total integrations: 30 PMS systems (Enterprise 15, Boutique/Independent 6, Vacation Rental 4, Brand-Specific 5 with loyalty programs), 21 dispute/chargeback portal adapters (Prevention 3, Card Networks 4, Merchant Processors 9, Third-Party 5). All adapters implement full two-way sync. Added demo mode support. Brand-specific PMS adapters include loyalty integration. |
| 3.1 | February 2026 | Added reservations API routes (list, stats, detail, link-chargeback), demo mode pre-loaded reservation data across 4 PMS sources, flattenReservation() data normalization documentation. |
| 4.0 | February 2026 | Standardized PMS/adapter names, added reservations route, 7 frontend components, Node.js v25 compatibility |

---

*© 2026 AccuDefend. All rights reserved.*
