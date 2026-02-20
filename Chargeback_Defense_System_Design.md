# AccuDefend - Complete System Design

**Version:** 3.0
**Date:** February 2026
**Document Type:** Technical Architecture Specification

---

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Technology Stack](#technology-stack)
3. [Frontend Architecture](#frontend-architecture)
4. [Backend Architecture](#backend-architecture)
5. [Complete Data Schema](#complete-data-schema)
6. [API Architecture](#api-architecture)
7. [Customer Flows](#customer-flows)
8. [Integration Architecture](#integration-architecture)
9. [AI Agents & Backlog System](#ai-agents--backlog-system)
10. [Security & Compliance](#security--compliance)
11. [Infrastructure & Deployment](#infrastructure--deployment)
12. [Monitoring & Observability](#monitoring--observability)
13. [Document History](#document-history)

---

## System Architecture Overview

### High-Level Architecture Diagram

```
+------------------------------------------------------------------+
|                        CLIENT LAYER                               |
+------------------------------------------------------------------+
|  Web Dashboard (React 18 SPA)                                    |
|  Served via Vite 5 dev server (local) / Nginx + CloudFront (prod)|
+----------------------------+-------------------------------------+
                             |
                        HTTPS/WSS
                             |
+----------------------------v-------------------------------------+
|                    REVERSE PROXY LAYER                            |
+------------------------------------------------------------------+
|  Nginx Reverse Proxy                                             |
|  - SSL Termination  - Load Balancing  - Static Asset Serving     |
|  - Rate Limiting    - Gzip Compression                           |
+----------------------------+-------------------------------------+
                             |
          +------------------+------------------+
          |                                     |
+---------v----------+            +-------------v-----------+
|  Web API           |            |  Webhook Service        |
|  (Express.js 4)    |            |  (Express.js 4)         |
+--------------------+            +-------------------------+
| - Auth (JWT)       |            | - Stripe webhooks       |
| - Cases CRUD       |            | - Adyen webhooks        |
| - Evidence mgmt    |            | - Elavon webhooks       |
| - Analytics        |            | - Shift4 webhooks       |
| - Admin panel      |            | - PMS events            |
| - PMS integration  |            +------------+------------+
| - Notifications    |                         |
| - Disputes         |                         |
+---------+----------+                         |
          |                                    |
          +--------------------+---------------+
                               |
          +--------------------+--------------------+
          |                    |                    |
+---------v------+   +---------v--------+   +------v------+
| PostgreSQL 16  |   |  Redis 7         |   |    S3       |
| (via Prisma 5) |   |  (via ioredis)   |   |  Evidence   |
|                |   |  - JWT blacklist  |   |  Storage    |
|                |   |  - Rate limits   |   |  (AES-256)  |
|                |   |  - Cache         |   +-------------+
+----------------+   +------------------+
```

### Architecture Principles

- **Modular Monolith:** Single Express.js server with clearly separated route modules and services, designed for future extraction into microservices
- **Event-Driven:** Webhook-based triggers from payment processors and PMS systems
- **API-First:** All functionality exposed via REST API endpoints under `/api/`
- **Stateless:** No server-side session state; JWT tokens with Redis-backed blacklisting
- **Cloud-Native:** Designed for AWS deployment with Docker containers and Terraform IaC
- **Security-First:** PCI DSS compliant, encrypted at rest and in transit, Helmet security headers

---

## Technology Stack

### Frontend Stack

| Category | Technology | Version |
|----------|-----------|---------|
| Framework | React | 18.2.x |
| Build Tool | Vite | 5.0.x |
| CSS Framework | Tailwind CSS | 3.4.x |
| Routing | React Router DOM | 6.21.x |
| Data Visualization | Recharts | 2.10.x |
| Icons | Lucide React | 0.303.x |
| Date Utilities | date-fns | 3.2.x |
| CSS Utilities | clsx | 2.1.x |
| HTTP Client | Axios (via utils/api.js) | - |
| Language | JavaScript (JSX) | ES2022 |

**Note:** The frontend uses plain React with functional components and hooks. There is no TypeScript, no React Query, no Zustand, and no shadcn/ui. State management is handled through React Context (AuthProvider) and local component state.

### Backend Stack

| Category | Technology | Version |
|----------|-----------|---------|
| Runtime | Node.js | 20.x LTS / 25.5 |
| Framework | Express.js | 4.18.x |
| Language | JavaScript (CommonJS) | ES2022 |
| ORM | Prisma | 5.8.x |
| Database | PostgreSQL | 16.x |
| Cache | Redis 7 (via ioredis) | 5.3.x |
| Auth | jsonwebtoken | 9.0.2 |
| Password Hashing | bcryptjs | 2.4.3 |
| Validation | Zod | 3.22.4 |
| Logging | Winston | 3.11.0 |
| HTTP Logging | Morgan | 1.10.0 |
| File Upload | Multer | 1.4.5-lts.1 |
| Security Headers | Helmet | 7.1.0 |
| Rate Limiting | express-rate-limit | 7.1.5 |
| AWS S3 | @aws-sdk/client-s3 | 3.490.x |
| S3 Presigning | @aws-sdk/s3-request-presigner | 3.490.x |
| Payment Processing | Stripe SDK | 14.12.x |
| HTTP Client | Axios | 1.13.5 |
| UUID Generation | uuid | 9.0.1 |
| Env Config | dotenv | 16.3.1 |
| CORS | cors | 2.8.5 |

**Note:** The backend uses plain JavaScript (CommonJS modules), not TypeScript. There is no Bull Queue, no Kong API Gateway, and no mobile app backend. The server uses Express directly with Nginx as a reverse proxy in production. Compatible with Node.js v25.5 alongside Node.js 20 LTS.

### Dev Dependencies

| Category | Technology | Version |
|----------|-----------|---------|
| Testing | Jest | 29.7.x |
| Linting | ESLint | 8.56.x |
| Hot Reload | Nodemon | 3.0.x |
| Database Tooling | Prisma CLI | 5.8.x |

### External Services

| Category | Service |
|----------|---------|
| OCR | AWS Textract (ID document parsing) |
| Image Recognition | AWS Rekognition (ID verification) |
| NLP | OpenAI GPT-4 (narrative generation) |
| Email | SendGrid (transactional emails) |
| Storage | AWS S3 (evidence files) |
| CDN | CloudFront (signed URLs) |
| Monitoring | CloudWatch (logs and metrics) |
| Secrets | AWS Secrets Manager |
| Queuing | AWS SQS / SNS (notifications) |

---

## Frontend Architecture

### Directory Structure

```
frontend/
  src/
    App.jsx                     # Root component with routing
    main.jsx                    # Entry point (React DOM render)
    index.css                   # Global styles (Tailwind directives)
    pages/
      Login.jsx                 # Authentication page
      Dashboard.jsx             # Main dashboard with KPIs
      Cases.jsx                 # Chargeback case list
      CaseDetail.jsx            # Individual case view with evidence
      Analytics.jsx             # Charts, trends, reporting
      Settings.jsx              # User and system settings
      PMSIntegration.jsx        # PMS system connections (30 systems)
      DisputeIntegration.jsx    # Dispute company integrations (Merlink)
      Tutorial.jsx              # Help/tutorial page
      Reservations.jsx          # Reservation list and management
    components/
      Layout.jsx                # App shell: sidebar, header, content area
      NotificationPanel.jsx     # Dropdown notification panel
      Tutorial.jsx              # Tutorial overlay component
      OutcomeTab.jsx            # Dispute outcome display (~250 lines) - WON/LOST resolution data
      ArbitrationModal.jsx      # 3-step arbitration filing modal (~250 lines)
      ReservationViewer.jsx     # Reservation details viewer
      GuestFolioViewer.jsx      # Guest folio details viewer
    hooks/
      useAuth.jsx               # AuthContext + AuthProvider + useAuth hook
    utils/
      api.js                    # Axios instance with interceptors
      helpers.js                # Shared utility functions
  vite.config.js                # Vite build configuration
  postcss.config.js             # PostCSS with Tailwind
  nginx.conf                    # Production Nginx configuration
  Dockerfile                    # Production Docker build
  index.html                    # HTML entry point
  package.json                  # Frontend dependencies
```

### Page Summary (10 pages)

| Page | Route | Description |
|------|-------|-------------|
| Login | `/login` | Email/password authentication |
| Dashboard | `/` | KPI cards, recent cases, charts, quick actions |
| Cases | `/cases` | Filterable/searchable case list with status badges |
| CaseDetail | `/cases/:id` | Full case view: evidence, timeline, AI analysis, notes |
| Analytics | `/analytics` | Win rate trends, reason code breakdown, property stats |
| Settings | `/settings` | User profile, system config, provider management |
| PMSIntegration | `/pms` | Connect/sync 30 PMS systems (Enterprise, Boutique, Vacation Rental, Brand-Specific) |
| DisputeIntegration | `/disputes` | Dispute company management with Merlink 2-way sync |
| Tutorial | `/tutorial` | Interactive help system |
| Reservations | `/reservations` | Reservation list with search, filters, PMS linking, and chargeback association |

### Component Summary (7 components)

| Component | Description |
|-----------|-------------|
| Layout | App shell with collapsible sidebar, top header with notifications, and content area |
| NotificationPanel | Real-time notification dropdown with mark-as-read, priority badges, and links |
| Tutorial | Overlay tutorial system with keyboard shortcut `?` trigger and first-time auto-launch |
| OutcomeTab | Dispute outcome display (~250 lines) showing WON/LOST resolution data, win factors, denial reasons, recovered amounts, and arbitration options |
| ArbitrationModal | 3-step arbitration filing modal (~250 lines) with Review, Evidence & Narrative, and Confirm steps |
| ReservationViewer | Reservation details viewer for displaying booking and stay information |
| GuestFolioViewer | Guest folio viewer for displaying itemized charges and payment details |

### State Management

- **Authentication:** React Context via `useAuth.jsx` (AuthProvider wraps the app)
- **API Communication:** Centralized Axios instance in `utils/api.js` with JWT interceptors
- **Component State:** React `useState` and `useEffect` hooks (no external state library)
- **Routing:** React Router v6 with protected route wrappers

---

## Backend Architecture

### Directory Structure

```
backend/
  server.js                     # Main entry point - Express app setup
  package.json                  # Backend dependencies
  .env                          # Environment variables (not committed)
  .env.example                  # Environment variable template
  Dockerfile                    # Production Docker build
  Dockerfile.dev                # Development Docker build (nodemon hot-reload)
  config/
    database.js                 # Prisma client initialization (deferred proxy pattern)
    redis.js                    # Redis (ioredis) connection + token blacklist
    s3.js                       # AWS S3 client configuration
    storage.js                  # File storage abstraction (local + S3)
  middleware/
    auth.js                     # JWT authentication + RBAC + property access
  routes/
    auth.js                     # /api/auth/* - Login, register, refresh, logout
    cases.js                    # /api/cases/* - CRUD, status, analyze, notes
    evidence.js                 # /api/evidence/* - Upload, download, verify, delete
    analytics.js                # /api/analytics/* - Dashboard, trends, breakdowns
    admin.js                    # /api/admin/* - Users, properties, providers, config
    webhooks.js                 # /api/webhooks/* - Stripe, Adyen, Shift4, Elavon
    disputes.js                 # /api/disputes/* - Dispute company CRUD
    notifications.js            # /api/notifications/* - List, mark read
    pms.js                      # /api/pms/* - PMS list, connect, sync, disconnect
    reservations.js             # /api/reservations/* - List, detail, folio, search, link
  services/
    fraudDetection.js           # AI confidence scoring and fraud analysis
    aiDefenseConfig.js          # AI defense strategy configuration
    aiAgents.js                 # AI agent orchestration system
    backlog.js                  # Technical backlog management service
    integrations.js             # Third-party integration service
    pmsIntegration.js           # PMS system connection definitions (30 systems in 4 categories)
    pmsSyncService.js           # PMS data synchronization logic
    disputeCompanies.js         # Dispute company integrations (Merlink 2-way sync)
  controllers/
    documentsController.js      # Supporting document upload/management
    notificationsController.js  # Notification CRUD and delivery
  data/
    mockData.js                 # Mock data for development/testing
  utils/
    logger.js                   # Winston logger configuration
  prisma/
    schema.prisma               # Database schema definition
    seed.js                     # Database seeding script
    migrations/                 # Prisma migration files
  uploads/                      # Local file upload directory (development)
```

### Route Summary (10 route modules)

| Route Module | Base Path | Key Endpoints |
|-------------|-----------|---------------|
| auth | `/api/auth` | POST `/login`, POST `/register`, POST `/refresh`, POST `/logout`, GET `/me` |
| cases | `/api/cases` | GET `/`, POST `/`, GET `/:id`, PATCH `/:id`, POST `/:id/analyze`, POST `/:id/notes`, PATCH `/:id/status`, POST `/:id/arbitration` |
| evidence | `/api/evidence` | POST `/upload`, GET `/:id/download`, POST `/:id/verify`, DELETE `/:id` |
| analytics | `/api/analytics` | GET `/dashboard`, GET `/trends`, GET `/by-reason`, GET `/by-property` |
| admin | `/api/admin` | GET `/users`, GET `/properties`, GET `/providers`, GET `/config`, GET `/storage/status`, GET `/audit-log` |
| webhooks | `/api/webhooks` | POST `/stripe`, POST `/adyen`, POST `/shift4`, POST `/elavon` |
| disputes | `/api/disputes` | GET `/`, POST `/`, GET `/:id`, PATCH `/:id`, DELETE `/:id` |
| notifications | `/api/notifications` | GET `/`, PATCH `/:id/read`, POST `/read-all` |
| pms | `/api/pms` | GET `/`, POST `/connect`, POST `/:id/sync`, DELETE `/:id/disconnect` |
| reservations | `/api/reservations` | GET `/`, GET `/stats/summary`, GET `/:id`, GET `/:id/folio`, GET `/search/live`, POST `/:id/link-chargeback` |

### Service Summary (8 services)

| Service | Purpose |
|---------|---------|
| fraudDetection | AI confidence scoring: 40% reason code analysis + 35% evidence completeness + 25% fraud indicators, with +/-25 point adjustments |
| aiDefenseConfig | Configurable AI defense strategies per reason code and card network |
| aiAgents | Orchestration of 8 AI agent types (backlog manager, code reviewer, security scanner, dispute analyzer, evidence processor, etc.) |
| backlog | Technical backlog management with epics, sprints, items, dependencies |
| integrations | Third-party service connection management (Stripe, Adyen, Slack, etc.) |
| pmsIntegration | PMS system definitions, connection configs, and evidence type mappings for 30 hotel PMS systems across 4 categories (Enterprise, Boutique/Independent, Vacation Rental, Brand-Specific with loyalty programs) |
| pmsSyncService | Real-time and scheduled data synchronization with connected PMS systems |
| disputeCompanies | Dispute company integrations including Merlink 2-way sync for automated dispute filing |

### Controller Summary (2 controllers)

| Controller | Purpose |
|-----------|---------|
| documentsController | Supporting document upload (via Multer), categorization, storage (local or S3), and retrieval |
| notificationsController | Notification creation, delivery, read/unread state, and bulk operations |

---

## Complete Data Schema

### Prisma Schema Overview

The database schema is defined in `backend/prisma/schema.prisma` using Prisma ORM with PostgreSQL 16.

**Note:** The Prisma client uses a deferred proxy pattern (`config/database.js`), allowing the server to start and serve demo/health endpoints even when the database is unavailable. The actual Prisma connection is established lazily on first query rather than at module load time.

#### Enums

```prisma
enum UserRole {
  ADMIN
  MANAGER
  STAFF
  READONLY
}

enum ChargebackStatus {
  PENDING
  IN_REVIEW
  SUBMITTED
  WON
  LOST
  EXPIRED
  CANCELLED
}

enum EvidenceType {
  ID_SCAN
  AUTH_SIGNATURE
  CHECKOUT_SIGNATURE
  FOLIO
  RESERVATION_CONFIRMATION
  CANCELLATION_POLICY
  CANCELLATION_POLICY_VIOLATION
  KEY_CARD_LOG
  CCTV_FOOTAGE
  CORRESPONDENCE
  INCIDENT_REPORT
  DAMAGE_PHOTOS
  DAMAGE_ASSESSMENT
  POLICE_REPORT
  NO_SHOW_DOCUMENTATION
  ARBITRATION_DOCUMENT
  OTHER
}

enum ProviderType {
  PAYMENT_PROCESSOR
  PMS
  HOSPITALITY
}

enum TimelineEventType {
  ALERT
  SYSTEM
  AI
  USER_ACTION
  SUCCESS
  WARNING
  ERROR
  WON
  LOST
  INFO
}

enum AIRecommendation {
  AUTO_SUBMIT
  REVIEW_RECOMMENDED
  GATHER_MORE_EVIDENCE
  UNLIKELY_TO_WIN
}

enum BacklogStatus {
  OPEN
  IN_PROGRESS
  IN_REVIEW
  TESTING
  DONE
  BLOCKED
  CANCELLED
}

enum BacklogPriority {
  CRITICAL
  HIGH
  MEDIUM
  LOW
}

enum BacklogCategory {
  BUG
  FEATURE
  ENHANCEMENT
  TECH_DEBT
  SECURITY
  PERFORMANCE
  DOCUMENTATION
  INFRASTRUCTURE
}

enum AIAgentType {
  BACKLOG_MANAGER
  CODE_REVIEWER
  DOCUMENTATION_AGENT
  TEST_GENERATOR
  SECURITY_SCANNER
  PERFORMANCE_MONITOR
  DISPUTE_ANALYZER
  EVIDENCE_PROCESSOR
}

enum AIAgentStatus {
  IDLE
  RUNNING
  PAUSED
  ERROR
  DISABLED
}

enum DocumentCategory {
  TEMPLATE
  POLICY
  SAMPLE
  TRAINING
  LEGAL
  GENERAL
}

enum NotificationType {
  NEW_CHARGEBACK
  CASE_UPDATE
  DEADLINE_WARNING
  AI_ANALYSIS_COMPLETE
  SUBMISSION_RESULT
  SYSTEM_ALERT
  PMS_SYNC_COMPLETE
}

enum NotificationPriority {
  LOW
  MEDIUM
  HIGH
  URGENT
}
```

#### Core Models

```prisma
// =============================================================================
// USER & AUTHENTICATION
// =============================================================================

model User {
  id            String    @id @default(uuid())
  email         String    @unique
  passwordHash  String    @map("password_hash")
  firstName     String    @map("first_name")
  lastName      String    @map("last_name")
  role          UserRole  @default(STAFF)
  isActive      Boolean   @default(true) @map("is_active")
  lastLogin     DateTime? @map("last_login")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  // Relations
  propertyId    String?   @map("property_id")
  property      Property? @relation(fields: [propertyId], references: [id])
  sessions      Session[]
  caseNotes     CaseNote[]
  auditLogs     AuditLog[]
  assignedItems BacklogItem[] @relation("BacklogAssignee")
  createdItems  BacklogItem[] @relation("BacklogCreator")
  uploadedDocuments SupportingDocument[]
  notifications     Notification[]

  @@map("users")
}

model Session {
  id           String   @id @default(uuid())
  userId       String   @map("user_id")
  refreshToken String   @map("refresh_token")
  expiresAt    DateTime @map("expires_at")
  ipAddress    String?  @map("ip_address")
  userAgent    String?  @map("user_agent")
  createdAt    DateTime @default(now()) @map("created_at")

  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([refreshToken])
  @@map("sessions")
}

// =============================================================================
// PROPERTY (HOTEL)
// =============================================================================

model Property {
  id          String   @id @default(uuid())
  name        String
  address     String?
  city        String?
  state       String?
  country     String   @default("US")
  postalCode  String?  @map("postal_code")
  timezone    String   @default("America/New_York")
  currency    String   @default("USD")
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  users       User[]
  chargebacks Chargeback[]
  analytics   AnalyticsSnapshot[]

  @@map("properties")
}

// =============================================================================
// PAYMENT PROVIDER
// =============================================================================

model Provider {
  id            String       @id @default(uuid())
  name          String
  type          ProviderType
  credentials   Json?
  webhookSecret String?      @map("webhook_secret")
  enabled       Boolean      @default(true)
  createdAt     DateTime     @default(now()) @map("created_at")
  updatedAt     DateTime     @updatedAt @map("updated_at")

  chargebacks   Chargeback[]
  webhookEvents WebhookEvent[]

  @@map("providers")
}

// =============================================================================
// CHARGEBACK (CENTRAL CASE ENTITY)
// =============================================================================

model Chargeback {
  id                  String           @id @default(uuid())
  caseNumber          String           @unique @map("case_number")
  status              ChargebackStatus @default(PENDING)

  // Guest Information
  guestName           String           @map("guest_name")
  guestEmail          String?          @map("guest_email")
  guestPhone          String?          @map("guest_phone")

  // Financial Details
  amount              Decimal          @db.Decimal(10, 2)
  currency            String           @default("USD")
  transactionId       String           @map("transaction_id")
  cardLastFour        String?          @map("card_last_four")
  cardBrand           String?          @map("card_brand")

  // Dispute Details
  reasonCode          String           @map("reason_code")
  reasonDescription   String?          @map("reason_description")
  disputeDate         DateTime         @map("dispute_date")
  dueDate             DateTime?        @map("due_date")
  processorDisputeId  String?          @map("processor_dispute_id")

  // Stay Information
  checkInDate         DateTime         @map("check_in_date")
  checkOutDate        DateTime         @map("check_out_date")
  roomNumber          String?          @map("room_number")
  roomType            String?          @map("room_type")
  confirmationNumber  String?          @map("confirmation_number")

  // AI Analysis
  confidenceScore     Int?             @map("confidence_score")
  fraudIndicators     Json?            @map("fraud_indicators")
  recommendation      AIRecommendation?
  aiAnalysis          Json?            @map("ai_analysis")

  // Timestamps
  createdAt           DateTime         @default(now()) @map("created_at")
  updatedAt           DateTime         @updatedAt @map("updated_at")
  resolvedAt          DateTime?        @map("resolved_at")

  // Relations
  propertyId          String           @map("property_id")
  property            Property         @relation(fields: [propertyId], references: [id])
  providerId          String           @map("provider_id")
  provider            Provider         @relation(fields: [providerId], references: [id])
  evidence            Evidence[]
  timeline            TimelineEvent[]
  notes               CaseNote[]
  submissions         DisputeSubmission[]

  @@index([status])
  @@index([propertyId])
  @@index([providerId])
  @@index([createdAt])
  @@index([dueDate])
  @@map("chargebacks")
}

// =============================================================================
// EVIDENCE
// =============================================================================

model Evidence {
  id            String       @id @default(uuid())
  type          EvidenceType
  fileName      String       @map("file_name")
  s3Key         String       @map("s3_key")
  mimeType      String       @map("mime_type")
  fileSize      Int          @map("file_size")
  description   String?
  extractedText String?      @map("extracted_text")
  verified      Boolean      @default(false)
  verifiedAt    DateTime?    @map("verified_at")
  createdAt     DateTime     @default(now()) @map("created_at")
  updatedAt     DateTime     @updatedAt @map("updated_at")

  chargebackId  String       @map("chargeback_id")
  chargeback    Chargeback   @relation(fields: [chargebackId], references: [id], onDelete: Cascade)

  @@index([chargebackId])
  @@index([type])
  @@map("evidence")
}

// =============================================================================
// TIMELINE EVENT (AUDIT HISTORY)
// =============================================================================

model TimelineEvent {
  id           String            @id @default(uuid())
  eventType    TimelineEventType @map("event_type")
  title        String
  description  String?
  metadata     Json?
  createdAt    DateTime          @default(now()) @map("created_at")

  chargebackId String            @map("chargeback_id")
  chargeback   Chargeback        @relation(fields: [chargebackId], references: [id], onDelete: Cascade)

  @@index([chargebackId])
  @@index([eventType])
  @@map("timeline_events")
}

// =============================================================================
// CASE NOTE
// =============================================================================

model CaseNote {
  id           String     @id @default(uuid())
  content      String
  isInternal   Boolean    @default(true) @map("is_internal")
  createdAt    DateTime   @default(now()) @map("created_at")
  updatedAt    DateTime   @updatedAt @map("updated_at")

  chargebackId String     @map("chargeback_id")
  chargeback   Chargeback @relation(fields: [chargebackId], references: [id], onDelete: Cascade)
  userId       String     @map("user_id")
  user         User       @relation(fields: [userId], references: [id])

  @@index([chargebackId])
  @@map("case_notes")
}

// =============================================================================
// DISPUTE SUBMISSION
// =============================================================================

model DisputeSubmission {
  id           String     @id @default(uuid())
  submittedAt  DateTime   @default(now()) @map("submitted_at")
  status       String
  requestJson  Json?      @map("request_json")
  responseJson Json?      @map("response_json")
  errorMessage String?    @map("error_message")
  createdAt    DateTime   @default(now()) @map("created_at")

  chargebackId String     @map("chargeback_id")
  chargeback   Chargeback @relation(fields: [chargebackId], references: [id], onDelete: Cascade)

  @@index([chargebackId])
  @@map("dispute_submissions")
}

// =============================================================================
// WEBHOOK EVENT
// =============================================================================

model WebhookEvent {
  id           String   @id @default(uuid())
  eventType    String   @map("event_type")
  payload      Json
  signature    String?
  processed    Boolean  @default(false)
  processedAt  DateTime? @map("processed_at")
  errorMessage String?  @map("error_message")
  createdAt    DateTime @default(now()) @map("created_at")

  providerId   String   @map("provider_id")
  provider     Provider @relation(fields: [providerId], references: [id])

  @@index([providerId])
  @@index([eventType])
  @@index([processed])
  @@map("webhook_events")
}

// =============================================================================
// ANALYTICS SNAPSHOT
// =============================================================================

model AnalyticsSnapshot {
  id            String   @id @default(uuid())
  date          DateTime @db.Date
  totalCases    Int      @default(0) @map("total_cases")
  pendingCases  Int      @default(0) @map("pending_cases")
  wonCases      Int      @default(0) @map("won_cases")
  lostCases     Int      @default(0) @map("lost_cases")
  totalAmount   Decimal  @default(0) @db.Decimal(12, 2) @map("total_amount")
  recoveredAmt  Decimal  @default(0) @db.Decimal(12, 2) @map("recovered_amount")
  winRate       Decimal? @db.Decimal(5, 2) @map("win_rate")
  createdAt     DateTime @default(now()) @map("created_at")

  propertyId    String?  @map("property_id")
  property      Property? @relation(fields: [propertyId], references: [id])

  @@unique([date, propertyId])
  @@index([date])
  @@map("analytics_snapshots")
}

// =============================================================================
// AUDIT LOG
// =============================================================================

model AuditLog {
  id          String   @id @default(uuid())
  action      String
  entityType  String   @map("entity_type")
  entityId    String   @map("entity_id")
  oldValues   Json?    @map("old_values")
  newValues   Json?    @map("new_values")
  ipAddress   String?  @map("ip_address")
  userAgent   String?  @map("user_agent")
  createdAt   DateTime @default(now()) @map("created_at")

  userId      String?  @map("user_id")
  user        User?    @relation(fields: [userId], references: [id])

  @@index([entityType, entityId])
  @@index([userId])
  @@index([createdAt])
  @@map("audit_logs")
}

// =============================================================================
// SYSTEM CONFIG
// =============================================================================

model SystemConfig {
  key         String   @id
  value       Json
  description String?
  updatedAt   DateTime @updatedAt @map("updated_at")
  updatedBy   String?  @map("updated_by")

  @@map("system_config")
}
```

#### Backlog & AI Agent Models

```prisma
// =============================================================================
// TECHNICAL BACKLOG
// =============================================================================

model BacklogItem {
  id              String          @id @default(uuid())
  title           String
  description     String
  status          BacklogStatus   @default(OPEN)
  priority        BacklogPriority @default(MEDIUM)
  category        BacklogCategory
  storyPoints     Int?            @map("story_points")

  epicId          String?         @map("epic_id")
  epic            BacklogEpic?    @relation(fields: [epicId], references: [id])
  sprintId        String?         @map("sprint_id")
  sprint          Sprint?         @relation(fields: [sprintId], references: [id])
  assigneeId      String?         @map("assignee_id")
  assignee        User?           @relation("BacklogAssignee", fields: [assigneeId], references: [id])
  createdById     String          @map("created_by_id")
  createdBy       User            @relation("BacklogCreator", fields: [createdById], references: [id])

  // AI Agent Metadata
  aiGenerated     Boolean         @default(false) @map("ai_generated")
  aiAgentId       String?         @map("ai_agent_id")
  aiAgent         AIAgent?        @relation(fields: [aiAgentId], references: [id])
  aiConfidence    Decimal?        @db.Decimal(5, 2) @map("ai_confidence")
  aiReasoning     String?         @map("ai_reasoning")

  acceptanceCriteria Json?        @map("acceptance_criteria")
  technicalNotes  String?         @map("technical_notes")
  labels          String[]
  estimatedHours  Decimal?        @db.Decimal(6, 2) @map("estimated_hours")
  actualHours     Decimal?        @db.Decimal(6, 2) @map("actual_hours")
  dueDate         DateTime?       @map("due_date")
  completedAt     DateTime?       @map("completed_at")
  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt @map("updated_at")

  comments        BacklogComment[]
  dependencies    BacklogDependency[] @relation("DependentItem")
  blockedBy       BacklogDependency[] @relation("BlockingItem")
  activities      BacklogActivity[]
  attachments     BacklogAttachment[]

  @@index([status])
  @@index([priority])
  @@index([category])
  @@index([epicId])
  @@index([sprintId])
  @@index([assigneeId])
  @@index([aiAgentId])
  @@map("backlog_items")
}

model BacklogEpic {
  id              String          @id @default(uuid())
  title           String
  description     String
  status          BacklogStatus   @default(OPEN)
  priority        BacklogPriority @default(MEDIUM)
  startDate       DateTime?       @map("start_date")
  targetDate      DateTime?       @map("target_date")
  progress        Int             @default(0)
  items           BacklogItem[]
  createdById     String          @map("created_by_id")
  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt @map("updated_at")

  @@map("backlog_epics")
}

model Sprint {
  id              String          @id @default(uuid())
  name            String
  goal            String?
  startDate       DateTime        @map("start_date")
  endDate         DateTime        @map("end_date")
  status          String          @default("planned")
  velocity        Int?
  items           BacklogItem[]
  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt @map("updated_at")

  @@map("sprints")
}

model BacklogComment {
  id              String          @id @default(uuid())
  content         String
  backlogItemId   String          @map("backlog_item_id")
  backlogItem     BacklogItem     @relation(fields: [backlogItemId], references: [id], onDelete: Cascade)
  authorId        String?         @map("author_id")
  aiAgentId       String?         @map("ai_agent_id")
  aiAgent         AIAgent?        @relation(fields: [aiAgentId], references: [id])
  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt @map("updated_at")

  @@index([backlogItemId])
  @@map("backlog_comments")
}

model BacklogDependency {
  id              String          @id @default(uuid())
  dependencyType  String          @map("dependency_type")
  dependentItemId String          @map("dependent_item_id")
  dependentItem   BacklogItem     @relation("DependentItem", fields: [dependentItemId], references: [id], onDelete: Cascade)
  blockingItemId  String          @map("blocking_item_id")
  blockingItem    BacklogItem     @relation("BlockingItem", fields: [blockingItemId], references: [id], onDelete: Cascade)
  createdAt       DateTime        @default(now()) @map("created_at")

  @@unique([dependentItemId, blockingItemId])
  @@map("backlog_dependencies")
}

model BacklogActivity {
  id              String          @id @default(uuid())
  action          String
  field           String?
  oldValue        String?         @map("old_value")
  newValue        String?         @map("new_value")
  backlogItemId   String          @map("backlog_item_id")
  backlogItem     BacklogItem     @relation(fields: [backlogItemId], references: [id], onDelete: Cascade)
  userId          String?         @map("user_id")
  aiAgentId       String?         @map("ai_agent_id")
  aiAgent         AIAgent?        @relation(fields: [aiAgentId], references: [id])
  createdAt       DateTime        @default(now()) @map("created_at")

  @@index([backlogItemId])
  @@map("backlog_activities")
}

model BacklogAttachment {
  id              String          @id @default(uuid())
  fileName        String          @map("file_name")
  s3Key           String          @map("s3_key")
  mimeType        String          @map("mime_type")
  fileSize        Int             @map("file_size")
  backlogItemId   String          @map("backlog_item_id")
  backlogItem     BacklogItem     @relation(fields: [backlogItemId], references: [id], onDelete: Cascade)
  uploadedById    String?         @map("uploaded_by_id")
  createdAt       DateTime        @default(now()) @map("created_at")

  @@index([backlogItemId])
  @@map("backlog_attachments")
}

// =============================================================================
// AI AGENTS
// =============================================================================

model AIAgent {
  id              String          @id @default(uuid())
  name            String
  type            AIAgentType
  description     String?
  status          AIAgentStatus   @default(IDLE)
  config          Json?
  schedule        String?
  priority        Int             @default(5)
  capabilities    String[]
  modelProvider   String          @default("anthropic") @map("model_provider")
  modelName       String          @default("claude-3-sonnet") @map("model_name")
  maxTokens       Int             @default(4096) @map("max_tokens")
  temperature     Decimal         @default(0.7) @db.Decimal(3, 2)
  totalRuns       Int             @default(0) @map("total_runs")
  successfulRuns  Int             @default(0) @map("successful_runs")
  failedRuns      Int             @default(0) @map("failed_runs")
  avgDuration     Decimal?        @db.Decimal(10, 2) @map("avg_duration_ms")
  lastRunAt       DateTime?       @map("last_run_at")
  lastErrorAt     DateTime?       @map("last_error_at")
  lastError       String?         @map("last_error")
  runs            AIAgentRun[]
  backlogItems    BacklogItem[]
  comments        BacklogComment[]
  activities      BacklogActivity[]
  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt @map("updated_at")

  @@index([type])
  @@index([status])
  @@map("ai_agents")
}

model AIAgentRun {
  id              String          @id @default(uuid())
  status          String
  trigger         String
  input           Json?
  output          Json?
  startedAt       DateTime        @default(now()) @map("started_at")
  completedAt     DateTime?       @map("completed_at")
  durationMs      Int?            @map("duration_ms")
  tokensUsed      Int?            @map("tokens_used")
  cost            Decimal?        @db.Decimal(10, 6)
  errorMessage    String?         @map("error_message")
  errorStack      String?         @map("error_stack")
  retryCount      Int             @default(0) @map("retry_count")
  agentId         String          @map("agent_id")
  agent           AIAgent         @relation(fields: [agentId], references: [id], onDelete: Cascade)

  @@index([agentId])
  @@index([status])
  @@index([startedAt])
  @@map("ai_agent_runs")
}
```

#### Integration, Document & Notification Models

```prisma
// =============================================================================
// THIRD-PARTY INTEGRATIONS
// =============================================================================

model Integration {
  id              String          @id @default(uuid())
  name            String
  type            String
  status          String          @default("inactive")
  config          Json?
  credentials     Json?
  webhookUrl      String?         @map("webhook_url")
  webhookSecret   String?         @map("webhook_secret")
  accessToken     String?         @map("access_token")
  refreshToken    String?         @map("refresh_token")
  tokenExpiresAt  DateTime?       @map("token_expires_at")
  syncEnabled     Boolean         @default(true) @map("sync_enabled")
  lastSyncAt      DateTime?       @map("last_sync_at")
  lastSyncStatus  String?         @map("last_sync_status")
  syncErrors      Int             @default(0) @map("sync_errors")
  events          IntegrationEvent[]
  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt @map("updated_at")

  @@index([type])
  @@index([status])
  @@map("integrations")
}

model IntegrationEvent {
  id              String          @id @default(uuid())
  eventType       String          @map("event_type")
  direction       String
  payload         Json
  processed       Boolean         @default(false)
  processedAt     DateTime?       @map("processed_at")
  response        Json?
  errorMessage    String?         @map("error_message")
  retryCount      Int             @default(0) @map("retry_count")
  integrationId   String          @map("integration_id")
  integration     Integration     @relation(fields: [integrationId], references: [id], onDelete: Cascade)
  createdAt       DateTime        @default(now()) @map("created_at")

  @@index([integrationId])
  @@index([eventType])
  @@index([processed])
  @@map("integration_events")
}

// =============================================================================
// SUPPORTING DOCUMENTS
// =============================================================================

model SupportingDocument {
  id              String            @id @default(uuid())
  filename        String
  originalName    String            @map("original_name")
  category        DocumentCategory  @default(GENERAL)
  description     String?
  size            Int
  mimeType        String            @map("mime_type")
  storageKey      String            @map("storage_key")
  storageUrl      String?           @map("storage_url")
  storageType     String            @default("local") @map("storage_type")
  uploadedById    String?           @map("uploaded_by_id")
  uploadedBy      User?             @relation(fields: [uploadedById], references: [id])
  createdAt       DateTime          @default(now()) @map("created_at")
  updatedAt       DateTime          @updatedAt @map("updated_at")

  @@index([category])
  @@index([uploadedById])
  @@map("supporting_documents")
}

// =============================================================================
// NOTIFICATIONS
// =============================================================================

model Notification {
  id              String              @id @default(uuid())
  type            NotificationType
  priority        NotificationPriority @default(MEDIUM)
  title           String
  message         String
  link            String?
  isRead          Boolean             @default(false) @map("is_read")
  readAt          DateTime?           @map("read_at")
  metadata        Json?
  userId          String              @map("user_id")
  user            User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt       DateTime            @default(now()) @map("created_at")
  expiresAt       DateTime?           @map("expires_at")

  @@index([userId])
  @@index([isRead])
  @@index([createdAt])
  @@map("notifications")
}
```

### Redis Data Structures

```javascript
// JWT Token Blacklisting
KEY: `blacklist:${token}`
VALUE: 1
TTL: matches token expiration

// Rate Limiting (via express-rate-limit)
KEY: `ratelimit:${endpoint}:${ip}:${window}`
VALUE: request_count
TTL: 15 minutes (900 seconds)

// Webhook Deduplication
KEY: `webhook:processed:${source}:${eventId}`
VALUE: 1
TTL: 7 days

// Cache (frequently accessed data)
KEY: `property:${propertyId}:stats`
VALUE: { totalCases, pending, winRate, ... }
TTL: 5 minutes

KEY: `user:${userId}:permissions`
VALUE: { properties: [...], role: "ADMIN" }
TTL: 15 minutes
```

---

## API Architecture

### REST API Endpoints

**Base URL:** `https://api.accudefend.com/api`
**Authentication:** `Bearer <JWT_TOKEN>`
**Content-Type:** `application/json`

### Authentication Endpoints

```
POST   /api/auth/login              # User login (returns access + refresh tokens)
POST   /api/auth/register           # Register new user
POST   /api/auth/refresh            # Refresh JWT token
POST   /api/auth/logout             # Logout (blacklists token in Redis)
GET    /api/auth/me                 # Get current authenticated user
```

### Chargeback Case Endpoints

```
GET    /api/cases                   # List cases (filterable by status, property, date)
POST   /api/cases                   # Create new case
GET    /api/cases/:id               # Get case details with evidence and timeline
PATCH  /api/cases/:id               # Update case fields
PATCH  /api/cases/:id/status        # Update case status
POST   /api/cases/:id/analyze       # Trigger AI analysis
POST   /api/cases/:id/notes         # Add note to case
POST   /api/cases/:id/arbitration   # File arbitration for a lost case
```

### Evidence Endpoints

```
POST   /api/evidence/upload         # Upload evidence file (Multer multipart)
GET    /api/evidence/:id/download   # Download evidence (S3 presigned URL)
POST   /api/evidence/:id/verify     # Mark evidence as verified
DELETE /api/evidence/:id            # Delete evidence file
```

### Analytics Endpoints

```
GET    /api/analytics/dashboard     # Dashboard KPIs (total, pending, won, lost, win rate)
GET    /api/analytics/trends        # Time-series data for charts
GET    /api/analytics/by-reason     # Breakdown by reason code
GET    /api/analytics/by-property   # Breakdown by property
```

### Admin Endpoints

```
GET    /api/admin/users             # List all users
GET    /api/admin/properties        # List all properties
GET    /api/admin/providers         # List payment providers
GET    /api/admin/config            # Get system configuration
GET    /api/admin/storage/status    # Storage health (local + S3)
GET    /api/admin/audit-log         # View audit log entries
```

### Webhook Endpoints (External Inbound)

```
POST   /api/webhooks/stripe         # Stripe webhook receiver
POST   /api/webhooks/adyen          # Adyen webhook receiver
POST   /api/webhooks/shift4         # Shift4 webhook receiver
POST   /api/webhooks/elavon         # Elavon webhook receiver
```

### Dispute Company Endpoints

```
GET    /api/disputes                # List dispute companies
POST   /api/disputes                # Add dispute company
GET    /api/disputes/:id            # Get dispute company details
PATCH  /api/disputes/:id           # Update dispute company
DELETE /api/disputes/:id           # Remove dispute company
```

### Notification Endpoints

```
GET    /api/notifications           # List user notifications
PATCH  /api/notifications/:id/read  # Mark notification as read
POST   /api/notifications/read-all       # Mark all as read
```

### PMS Integration Endpoints

```
GET    /api/pms                     # List available PMS systems
POST   /api/pms/connect             # Connect to a PMS system
POST   /api/pms/:id/sync            # Trigger sync with connected PMS
DELETE /api/pms/:id/disconnect      # Disconnect PMS system
```

### Reservation Endpoints

```
GET    /api/reservations                  # List reservations (filters, pagination w/ totalPages, demo fallback)
GET    /api/reservations/stats/summary    # Stats (totalReservations, linkedToChargebacks, flaggedGuests)
GET    /api/reservations/:id              # Reservation detail with folio items and linked chargebacks
GET    /api/reservations/:id/folio        # Guest folio with line items
GET    /api/reservations/search/live      # Real-time PMS search
POST   /api/reservations/:id/link-chargeback  # Manual chargeback linking
```

### Health Check Endpoints

```
GET    /health                      # Basic health check (always returns 200 if running)
GET    /ready                       # Readiness check (verifies DB + Redis + S3)
```

### API Response Format

**Success Response:**

```json
{
  "success": true,
  "data": { },
  "meta": {
    "timestamp": "2026-02-13T10:30:00Z",
    "requestId": "req_abc123"
  }
}
```

**Error Response:**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": [
      {
        "field": "email",
        "message": "Email is required"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-02-13T10:30:00Z",
    "requestId": "req_abc123"
  }
}
```

**Pagination:**

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 145,
    "totalPages": 8
  }
}
```

---

## Customer Flows

### Flow 1: Initial Onboarding & Setup

```
+---------------+
| 1. Sign Up    |
+-------+-------+
        |
        v
+-------------------------------+
| 2. Create Organization        |
|    - Company name             |
|    - Billing email            |
|    - Plan selection           |
+-------+-----------------------+
        |
        v
+-------------------------------+
| 3. Add First Property         |
|    - Hotel name & address     |
|    - Room count               |
|    - Timezone                 |
+-------+-----------------------+
        |
        v
+-------------------------------+
| 4. Connect Payment Processors |
|    - Select processor(s)      |
|    - Enter API credentials    |
|    - Verify connection        |
+-------+-----------------------+
        |
        v
+-------------------------------+
| 5. Configure PMS Integration  |
|    - Select PMS system        |
|    - Enter API key            |
|    - Test connection          |
|    - Enable webhooks          |
+-------+-----------------------+
        |
        v
+-------------------------------+
| 6. Setup Evidence Collection  |
|    - Configure file upload    |
|    - Test ID scanning         |
|    - Configure auto-submit    |
+-------+-----------------------+
        |
        v
+-------------------------------+
| 7. Invite Team Members        |
|    - Add users                |
|    - Assign roles (ADMIN,     |
|      MANAGER, STAFF, READONLY)|
|    - Send invitations         |
+-------+-----------------------+
        |
        v
+-------------------------------+
| 8. Tutorial Auto-Launch       |
|    - First-time user guide    |
|    - Keyboard shortcut (?)    |
|    - Dashboard walkthrough    |
+-------+-----------------------+
        |
        v
+-------------------------------+
| 9. System Ready               |
|    - Dashboard accessible     |
|    - Monitoring active        |
+-------------------------------+

TOTAL TIME: 20-30 minutes
```

### Flow 2: Guest Check-In (Evidence Collection)

```
+--------------------------------------------------------------+
|              FRONT DESK - CHECK-IN PROCESS                    |
+--------------------------------------------------------------+

Step 1: Standard PMS Check-in Started
+---------------------------+
| PMS: Opera/Mews/etc.     |
| Agent enters guest info   |
| Assigns room              |
+------------+--------------+
             |
             v
Step 2: PMS Webhook Triggered
+-------------------------------------+
| Event: "reservation.check_in"       |
| System creates EvidencePacket       |
| Status: "incomplete"                |
+------------+------------------------+
             |
             v
Step 3: Agent Prompted for Evidence Collection
+-------------------------------------+
| Web App Notification:               |
| "Collect evidence for Res #12345"   |
|                                     |
| OR                                  |
|                                     |
| PMS Screen Prompt:                  |
| "Complete evidence collection"      |
+------------+------------------------+
             |
             v
Step 4A: Scan Government ID
+---------------------------------------------+
| Web upload interface                         |
| - Agent captures/uploads ID image            |
| - Upload to S3: evidence/id/res_12345.jpg    |
| - Trigger OCR job (AWS Textract)             |
+------------+--------------------------------+
             |
             v
Step 4B: Capture Authorization Signature
+---------------------------------------------+
| Signature Capture                            |
| - Guest signs authorization                  |
| - System captures signature image            |
| - Upload to S3: evidence/sig/res_12345.jpg   |
+------------+--------------------------------+
             |
             v
Step 5: Background Processing (Async)
+---------------------------------------------+
| OCR Job Processing:                          |
| - Extract ID number                          |
| - Extract name from ID                       |
| - Verify name matches reservation            |
| - Store parsed data in DB                    |
| - Mark Evidence.verified = true              |
+------------+--------------------------------+
             |
             v
Step 6: Confirmation
+---------------------------------------------+
| System Updates:                              |
| - Evidence.collectionStatus = "complete"     |
| - Evidence.verifiedAt = NOW()                |
| - Green checkmark in web dashboard           |
+------------+--------------------------------+
             |
             v
Step 7: Guest Receives Room Key
+---------------------------------------------+
| Check-in Complete                            |
| Total Time Added: 30-45 seconds              |
+---------------------------------------------+

Evidence Status: READY FOR CHARGEBACK DEFENSE
```

### Flow 3: Chargeback Received (Automated Response)

```
+--------------------------------------------------------------+
|           AUTOMATIC CHARGEBACK PROCESSING FLOW                |
+--------------------------------------------------------------+

TRIGGER: Guest files chargeback with bank
           |
+---------------------------------------------+
| T+0 sec: Stripe Webhook Received            |
| POST /api/webhooks/stripe                   |
| Event: charge.dispute.created               |
| Payload: {                                  |
|   id: "dp_1234",                            |
|   amount: 48750,  // $487.50                |
|   reason: "fraudulent",                     |
|   charge: "ch_5678"                         |
| }                                           |
+------------+--------------------------------+
             |
             v
+---------------------------------------------+
| T+5 sec: Create Chargeback Case             |
| - Generate case number: CB-2026-0128        |
| - Link to reservation (via charge ID)       |
| - Set status: "PENDING"                     |
| - Calculate dueDate: NOW + 10 days          |
| - Insert into chargebacks table             |
+------------+--------------------------------+
             |
             v
+---------------------------------------------+
| T+10 sec: Retrieve Evidence                 |
| - Query Evidence records for case           |
| - Verify all evidence exists:               |
|   [check] ID scan URL                       |
|   [check] Auth signature URL                |
|   [check] Checkout signature URL            |
|   [check] Folio URL                         |
+------------+--------------------------------+
             |
             v
+---------------------------------------------+
| T+15 sec: Calculate AI Confidence Score     |
|                                             |
| Scoring Algorithm:                          |
|                                             |
| Reason Code Weight: 40%                     |
|   - Maps reason code to historical win rate |
|   - Visa, MC, Amex, Discover codes          |
|                                             |
| Evidence Weight: 35%                        |
|   - ID scan exists & verified: +points      |
|   - Auth signature: +points                 |
|   - Checkout signature: +points             |
|   - Folio: +points                          |
|                                             |
| Fraud Indicators Weight: 25%               |
|   - IP geolocation match                    |
|   - Card-present vs. not-present            |
|   - Repeat dispute behavior                 |
|                                             |
| Adjustment: +/- 25 points                   |
|   - Time remaining bonus                    |
|   - Historical win rate for similar cases   |
|                                             |
| TOTAL SCORE: 87/100                         |
| THRESHOLD: 85 (met)                         |
+------------+--------------------------------+
             |
             v
+---------------------------------------------+
| T+30 sec: Generate Evidence Packet          |
|                                             |
| Process:                                    |
| 1. Download evidence files from S3          |
| 2. Load reason code template                |
| 3. Generate narrative (GPT-4):              |
|    "This transaction was legitimate.        |
|     Guest presented valid government ID,    |
|     signed authorization form, and          |
|     checked into the hotel..."              |
| 4. Compile PDF:                             |
|    - Page 1: Cover letter                   |
|    - Page 2: ID scan (enhanced)             |
|    - Page 3: Authorization signature        |
|    - Page 4: Checkout signature             |
|    - Page 5: Itemized folio                 |
| 5. Upload to S3: disputes/CB-2026-0128.pdf  |
+------------+--------------------------------+
             |
             v
+---------------------------------------------+
| T+2 min: Auto-Submit Decision Check         |
|                                             |
| IF (confidenceScore >= 85                   |
|     AND autoSubmitEnabled                   |
|     AND daysRemaining >= 2)                 |
| THEN:                                       |
|   Submit to payment processor               |
| ELSE:                                       |
|   Notify staff for manual review            |
+------------+--------------------------------+
             |
             v
+---------------------------------------------+
| T+3 min: Submit to Stripe API               |
|                                             |
| POST https://api.stripe.com/v1/disputes/... |
| Headers: Authorization: Bearer sk_...       |
| Body: {                                     |
|   evidence: {                               |
|     customer_name: "John Smith",            |
|     customer_signature: <base64>,           |
|     receipt: <base64>,                      |
|     uncategorized_file: <pdf_base64>        |
|   },                                        |
|   submit: true                              |
| }                                           |
|                                             |
| Response: 200 OK                            |
| { id: "dp_1234", status: "under_review" }  |
+------------+--------------------------------+
             |
             v
+---------------------------------------------+
| T+3.5 min: Update Case Status               |
| - status = "SUBMITTED"                      |
| - submissionMethod = "auto"                 |
| - respondedAt = NOW()                       |
| - Create TimelineEvent: "Auto-submitted"    |
+------------+--------------------------------+
             |
             v
+---------------------------------------------+
| T+4 min: Send Notifications                 |
|                                             |
| In-App Notification:                        |
| Title: "Chargeback Auto-Submitted"          |
| Message: Case CB-2026-0128 submitted        |
|          to Stripe.                         |
| Amount: $487.50                             |
| Guest: John Smith                           |
| Confidence: 87%                             |
| Expected decision: 10-30 days               |
|                                             |
| Email Alert to Property Manager:            |
| Subject: "Chargeback Auto-Submitted"        |
| [View Case Details] link                    |
+------------+--------------------------------+
             |
             v
+---------------------------------------------+
| COMPLETE - Waiting for Decision              |
| Hotel Staff Time Required: 0 minutes         |
| System Processing Time: ~4 minutes           |
+---------------------------------------------+

             |  (Wait 10-30 days)
             v
+---------------------------------------------+
| Decision Webhook Received                    |
| Event: charge.dispute.closed                 |
| Outcome: "won"                               |
+------------+--------------------------------+
             |
             v
+---------------------------------------------+
| Update Case:                                 |
| - status = "WON"                             |
| - resolvedAt = NOW()                         |
| - Send notification to staff                 |
+---------------------------------------------+

RESULT: $487.50 recovered automatically
```

### Flow 4: Manual Review Workflow (Low Confidence)

```
+--------------------------------------------------------------+
|              MANUAL REVIEW WORKFLOW                            |
+--------------------------------------------------------------+

TRIGGER: Chargeback with confidence score < 85%
         (e.g., missing checkout signature)

+---------------------------------------------+
| System Analysis:                            |
| - ID scan: [verified]                       |
| - Auth signature: [present]                 |
| - Checkout signature: [missing]             |
| - Folio: [present]                          |
|                                             |
| Confidence Score: 67/100                    |
| Decision: Manual review required            |
+------------+--------------------------------+
             |
             v
+---------------------------------------------+
| In-App Notification to Manager:             |
|                                             |
| Title: "Manual Review Required"             |
| Priority: HIGH                              |
|                                             |
| Case CB-2026-0129 requires your review      |
| before submission.                          |
|                                             |
| Issue: Missing checkout signature           |
| Confidence: 67% (below 85% threshold)      |
|                                             |
| [Review Case Now]                           |
+------------+--------------------------------+
             |
             v
+---------------------------------------------+
| Manager Reviews in Web Dashboard:           |
|                                             |
| Case Details:                               |
| - Guest: Sarah Johnson                      |
| - Amount: $325.00                           |
| - Reason: Service not rendered              |
| - Days remaining: 8                         |
|                                             |
| Evidence Status:                            |
| [check] ID scan (verified)                  |
| [check] Authorization signature             |
| [x] Checkout signature (missing)            |
| [check] Itemized folio                      |
|                                             |
| AI Recommendation:                          |
| "Submit anyway - guest checked out via      |
|  express checkout (no signature required)"  |
+------------+--------------------------------+
             |
             v
+---------------------------------------------+
| Manager Options:                            |
|                                             |
| [Submit Anyway]  <-- Manager clicks this    |
| [Upload Missing Evidence]                   |
| [Accept Loss]                               |
| [Add Note for Later]                        |
+------------+--------------------------------+
             |
             v
+---------------------------------------------+
| Confirmation Dialog:                        |
|                                             |
| "Submit case with 67% confidence?"          |
|                                             |
| Note: Missing checkout signature may        |
| weaken defense but other evidence is strong |
|                                             |
| [Cancel]  [Yes, Submit]  <-- Confirms       |
+------------+--------------------------------+
             |
             v
+---------------------------------------------+
| System Processes:                           |
| - Generate evidence packet (as normal)      |
| - Submit to payment processor               |
| - submissionMethod = "manual"               |
| - status = "SUBMITTED"                      |
| - Create AuditLog entry                     |
+------------+--------------------------------+
             |
             v
+---------------------------------------------+
| Success Confirmation:                       |
| "Case submitted successfully!"              |
|                                             |
| Total Manager Time: ~2 minutes              |
+---------------------------------------------+
```

---

## Integration Architecture

### Payment Processor Integration Flow

```
                    +-------------+
                    |  AccuDefend |
                    |   Core      |
                    +------+------+
                           |
          +----------------+----------------+
          |                |                |
    +-----v-----+    +----v----+    +------v------+
    |  Stripe   |    |  Adyen  |    |  Elavon     |
    |  Adapter  |    | Adapter |    |  Adapter    |
    +-----+-----+    +----+----+    +------+------+
          |                |                |
    +-----v-----+    +----v----+    +------v------+
    |  Stripe   |    |  Adyen  |    |  Elavon     |
    |   API     |    |   API   |    |  Portal     |
    +-----------+    +---------+    +------+------+
                                           |
                                    +------v------+
                                    |  Shift4     |
                                    |   API       |
                                    +-------------+
```

**Processor Adapter Pattern (JavaScript):**

```javascript
// services/integrations.js - Adapter interface pattern

class ProcessorAdapter {
  // Webhook handling
  verifyWebhook(payload, signature) { /* Verify webhook authenticity */ }
  parseWebhook(payload) { /* Normalize to ChargebackEvent */ }

  // Submission
  async submitEvidence(disputeId, evidence) { /* Submit to processor */ }

  // Status checking
  async getDisputeStatus(disputeId) { /* Check dispute outcome */ }

  // Formatting
  formatEvidenceForProcessor(evidence) { /* Format per processor requirements */ }
}

// Stripe Implementation
class StripeAdapter extends ProcessorAdapter {
  verifyWebhook(payload, signature) {
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  }

  async submitEvidence(disputeId, evidence) {
    const result = await stripe.disputes.update(disputeId, {
      evidence: {
        customer_name: evidence.guestName,
        customer_signature: await this.uploadFile(evidence.authSignatureUrl),
        receipt: await this.uploadFile(evidence.folioUrl),
        uncategorized_file: await this.uploadFile(evidence.pdfPacketUrl)
      },
      submit: true
    });

    return {
      success: result.status === 'under_review',
      externalId: result.id,
      submittedAt: new Date()
    };
  }
}
// Similar adapters for Adyen, Elavon, Shift4
```

### PMS Integration Architecture

AccuDefend integrates with 30 Property Management Systems organized in 4 categories, all implementing full two-way sync:

**Enterprise PMS (15 systems):**

| PMS System | Auth Type | Key Evidence Types |
|-----------|-----------|-------------------|
| Oracle Opera Cloud | OAuth2 | Folio, registration card, payment receipt, guest signature, ID scan |
| Mews | API Key | Bill, registration, payment, customer profile |
| Cloudbeds | OAuth2 | Reservation, guest info, payment info, invoice |
| AutoClerk | API Key | Folio, registration card, payment receipt, guest signature, ID scan, audit trail |
| Agilysys | OAuth2 | Folio, reservation, payment record, guest profile |
| Infor | API Key | Folio, registration, payment, guest history |
| Stayntouch | OAuth2 | Folio, reservation, payment record, guest signature |
| RoomKey | API Key | Reservation, guest card, billing statement |
| Maestro | OAuth2 | Folio, registration, payment, guest profile |
| Hotelogix | API Key | Folio, reservation, payment, guest profile |
| RMS Cloud | API Key | Reservation, folio, invoice, payment, guest data |
| Protel | Basic Auth | Booking confirmation, invoice, guest registration, payment log |
| eZee | API Key | Reservation, folio, invoice, payment log |
| SIHOT | OAuth2 | Folio, reservation, payment receipt, guest profile |
| innRoad | OAuth2 | Reservation, folio, payment receipt, guest info |

**Boutique/Independent PMS (6 systems):**

| PMS System | Auth Type | Key Evidence Types |
|-----------|-----------|-------------------|
| Apaleo | OAuth2 | Reservation, folio, invoice, payment |
| WebRezPro | API Key | Booking, folio, payment receipt, registration |
| RoomMaster | Basic Auth | Folio, registration card, payment receipt, reservation |
| Little Hotelier | API Key | Booking, payment receipt, guest info |
| Visual Matrix | Basic Auth | Folio, registration card, payment receipt |
| ResNexus | API Key | Booking, payment receipt, guest info |

**Vacation Rental PMS (4 systems):**

| PMS System | Auth Type | Key Evidence Types |
|-----------|-----------|-------------------|
| Guesty | OAuth2 | Reservation, payment, guest ID, rental agreement |
| Hostaway | API Key | Booking, payment receipt, guest info, damage deposit |
| Lodgify | API Key | Reservation, invoice, guest data, rental contract |
| Escapia | OAuth2 | Booking, folio, payment, guest agreement |

**Brand-Specific PMS (5 systems with loyalty program integration):**

| PMS System | Auth Type | Loyalty Program | Key Evidence Types |
|-----------|-----------|-----------------|-------------------|
| Marriott FOSSE/MARSHA | OAuth2 | Marriott Bonvoy | Folio, registration, loyalty status, payment |
| Hilton OnQ | OAuth2 | Hilton Honors | Folio, guest profile, loyalty tier, payment |
| Hyatt OPERA (Custom) | OAuth2 | World of Hyatt | Reservation, folio, loyalty data, payment |
| IHG Concerto | OAuth2 | IHG One Rewards | Folio, registration, rewards status, payment |
| Best Western Central | API Key | Best Western Rewards | Booking, folio, loyalty info, payment |

**PMS Integration Flow:**

```
        Hotel's PMS System                 AccuDefend
        +---------------+                 +-----------------+
        |    Opera      |                 |   Webhook       |
        |    Cloud      |--check_in------>|   Receiver      |
        +---------------+     event       +--------+--------+
                                                   |
        +---------------+                          |
        |    Mews       |                          |
        |     PMS       |--reservation.created-----|
        +---------------+                          |
                                                   |
        +---------------+                          |
        |  Cloudbeds    |                          |
        |     PMS       |--guest_checked_in--------|
        +---------------+                          |
                                                   v
                                          +----------------+
                                          | Event Parser   |
                                          | - Normalize    |
                                          | - Validate     |
                                          | - Route        |
                                          +--------+-------+
                                                   |
                                                   v
                                          +----------------+
                                          | Create/Update  |
                                          |  Reservation   |
                                          +--------+-------+
                                                   |
                                                   v
                                          +----------------+
                                          | Trigger        |
                                          | Evidence       |
                                          | Collection     |
                                          +----------------+
```

**PMS Event Normalization (JavaScript):**

```javascript
// services/pmsSyncService.js - Event normalization

const normalizedEvent = {
  source: 'opera',  // 'opera' | 'mews' | 'cloudbeds' | etc.
  eventType: 'reservation.checkin',
  propertyId: event.hotelCode,
  reservationId: event.confirmationNumber,
  guestData: {
    firstName: event.guestName.firstName,
    lastName: event.guestName.lastName,
    email: event.email?.value,
    phone: event.phone?.phoneNumber
  },
  stayData: {
    checkIn: new Date(event.arrivalDate),
    checkOut: new Date(event.departureDate),
    roomNumber: event.roomNumber
  },
  chargesData: {
    total: event.totalCharges,
    currency: event.currency || 'USD',
    items: event.lineItems
  }
};
```

### Dispute & Chargeback Portal Integration

AccuDefend integrates with 21 dispute/chargeback portals through dedicated adapters, all implementing full two-way sync via the `services/disputeCompanies.js` service and `/api/disputes` route module.

**Prevention Services (3 adapters):**

| Portal | Capabilities |
|--------|-------------|
| Verifi (Visa CDRN/RDR) | CDRN alerts, real-time prevention, rapid dispute resolution |
| Ethoca (Mastercard) | Alert-based prevention, consumer clarity |
| Merlink | Full 2-way sync, case management, evidence packets |

**Card Network Portals (4 adapters):**

| Portal | Capabilities |
|--------|-------------|
| Visa VROL | Dispute management, evidence submission, status tracking |
| Mastercom | Chargeback filing, pre-arbitration, retrieval requests |
| AMEX Merchant | Inquiry response, chargeback defense, evidence upload |
| Discover Dispute | Dispute response, evidence submission, case tracking |

**Merchant Processor Portals (9 adapters):**

| Portal | Capabilities |
|--------|-------------|
| Elavon | Chargeback notifications, representment |
| Fiserv | Dispute management, evidence submission, status tracking |
| Worldpay | Chargeback defense, evidence filing |
| Chase Merchant | Dispute management, evidence submission |
| Global Payments | Dispute tracking, evidence upload |
| TSYS | Chargeback management, representment filing |
| Square | Dispute events, evidence upload, status tracking |
| Stripe | Webhook disputes, evidence submission, auto-sync |
| Authorize.net | Dispute response, evidence submission |

**Third-Party Dispute Services (5 adapters):**

| Portal | Capabilities |
|--------|-------------|
| Chargebacks911 | Dispute management, prevention, analytics |
| Kount | Fraud prevention, risk assessment, dispute intelligence |
| Midigator | Dispute intelligence, prevention alerts, analytics |
| Signifyd | Guaranteed fraud protection, chargeback recovery |
| Riskified | AI-driven fraud prevention, chargeback guarantee |

**Two-Way Sync Pattern (all 21 adapters):**
- Outbound: AccuDefend pushes case data, evidence packets, and submission status
- Inbound: Portals push dispute outcomes, processor responses, and status updates back
- Real-time sync via webhooks with fallback to scheduled polling
- Configuration managed through the DisputeIntegration page in the web dashboard

---

## AI Agents & Backlog System

### AI Agent Types

AccuDefend includes an AI agent orchestration system with 8 distinct agent types:

| Agent Type | Purpose | Capabilities |
|-----------|---------|-------------|
| BACKLOG_MANAGER | Creates and prioritizes technical backlog items | Auto-triage bugs, suggest priorities, create epics |
| CODE_REVIEWER | Reviews code and suggests improvements | PR analysis, security review, code quality |
| DOCUMENTATION_AGENT | Generates and updates documentation | API docs, readme updates, changelog |
| TEST_GENERATOR | Creates test cases | Unit tests, integration tests, edge cases |
| SECURITY_SCANNER | Scans for vulnerabilities | Dependency audit, code patterns, config review |
| PERFORMANCE_MONITOR | Monitors and suggests optimizations | Query analysis, bundle size, response times |
| DISPUTE_ANALYZER | Analyzes chargeback disputes | Win probability, strategy recommendation |
| EVIDENCE_PROCESSOR | Processes and validates evidence | OCR validation, completeness checks, quality scoring |

### AI Agent Configuration

Each agent is configured with:
- **Model Provider:** Default `anthropic`
- **Model Name:** Default `claude-3-sonnet`
- **Max Tokens:** Default 4096
- **Temperature:** Default 0.7
- **Schedule:** Optional cron expression for automated runs
- **Priority:** 1-10 scale (higher = more priority)
- **Capabilities:** Array of permissions/actions the agent can perform

### AI Agent Run Tracking

Every agent execution is logged with:
- Trigger type (scheduled, manual, webhook, event)
- Input/output payloads
- Duration in milliseconds
- Tokens consumed and cost
- Success/failure status with error details
- Retry count

### Technical Backlog System

The backlog system supports full agile project management:

- **Epics:** High-level feature groupings with progress tracking
- **Sprints:** Time-boxed iterations with velocity tracking
- **Items:** Individual tasks with story points, assignees, and acceptance criteria
- **Dependencies:** Block/relates-to/duplicates relationships between items
- **Comments:** Threaded comments from users and AI agents
- **Activities:** Full activity history for every state change
- **Attachments:** File attachments stored in S3

### AI Confidence Scoring Algorithm

The fraud detection engine (`services/fraudDetection.js`) calculates confidence scores using a weighted formula:

```
Total Score = (Reason Code Score * 0.40)
            + (Evidence Score * 0.35)
            + (Fraud Indicator Score * 0.25)
            +/- Adjustment (max 25 points)
```

**Reason Code Score (40% weight):**
- Maps each reason code to historical win rates
- Covers Visa (13.x, 10.x), Mastercard (48xx), Amex (Cxx, Fxx), and Discover codes
- Higher win rate = higher score contribution

**Evidence Score (35% weight):**
- ID scan exists and verified via OCR: +points
- Authorization signature present: +points
- Checkout signature present: +points
- Folio/invoice present: +points
- Each missing piece reduces the score

**Fraud Indicator Score (25% weight):**
- Card-present vs. card-not-present transaction
- IP geolocation match with property location
- Repeat dispute behavior by the same guest
- Transaction amount anomaly detection

**Adjustment (+/- 25 points):**
- Time remaining bonus (more days = higher bonus)
- Similar case historical outcomes
- Property-specific win rate trends

---

## Security & Compliance

### Security Architecture

```
+--------------------------------------------------------------+
|                     SECURITY LAYERS                           |
+--------------------------------------------------------------+

Layer 1: Network Security
+-- AWS WAF (Web Application Firewall)
+-- DDoS Protection (AWS Shield)
+-- IP Whitelisting (for processor webhooks)
+-- TLS 1.3 encryption (all traffic)
+-- Nginx reverse proxy with security headers

Layer 2: Application Security
+-- JWT authentication (HS256 via jsonwebtoken 9.0.2)
+-- Refresh token rotation with Redis blacklisting
+-- RBAC (4 roles: ADMIN, MANAGER, STAFF, READONLY)
+-- Property-level access control (users scoped to their hotel)
+-- Rate limiting (express-rate-limit, Redis-backed)
|   +-- General API: 100 requests per 15 minutes
|   +-- Auth endpoints: 20 requests per 15 minutes
+-- Helmet security middleware (CSP, XSS protection, etc.)
+-- Zod input validation (3.22.4)
+-- Prisma ORM (SQL injection prevention via parameterized queries)
+-- CORS with explicit origin whitelist
+-- Raw body parsing only for webhook endpoints

Layer 3: Data Security
+-- Encryption at rest (AES-256)
|   +-- Aurora PostgreSQL native encryption
|   +-- S3 Server-side encryption (SSE-S3)
|
+-- Encryption in transit (TLS 1.3)
|   +-- All API calls
|   +-- Database connections (SSL mode)
|   +-- S3 uploads/downloads
|
+-- Secrets management
|   +-- AWS Secrets Manager
|   +-- Environment variables via dotenv
|   +-- Processor API keys (encrypted in DB)
|
+-- Password security
|   +-- bcryptjs with 12 salt rounds
|   +-- Minimum password requirements
|
+-- PII handling
    +-- Tokenization of credit card data (only last 4 stored)
    +-- Data retention policies
    +-- GDPR-compliant deletion

Layer 4: Access Control
+-- Role-based authorization middleware
+-- Property-scoped data access (non-admins only see their property)
+-- Audit logging (all actions logged with user, IP, timestamp)
+-- JWT token blacklisting on logout

Layer 5: Compliance
+-- PCI DSS Level 1 (card data handling)
+-- SOC 2 Type II (trust & security)
+-- GDPR compliance (EU properties)
+-- Regular penetration testing (quarterly)
```

### Authentication Flow

```
1. Login: POST /api/auth/login
   - Validates email/password with bcryptjs (12 rounds)
   - Issues JWT access token (short-lived)
   - Issues refresh token (stored in Session table)
   - Returns both tokens to client

2. Authenticated Requests:
   - Client sends: Authorization: Bearer <access_token>
   - Middleware checks token not blacklisted (Redis)
   - Middleware verifies JWT signature
   - Middleware loads user from database
   - Middleware checks user.isActive

3. Token Refresh: POST /api/auth/refresh
   - Validates refresh token against Session table
   - Issues new access token
   - Rotates refresh token (old one invalidated)

4. Logout: POST /api/auth/logout
   - Blacklists access token in Redis (TTL = token expiry)
   - Deletes Session record
   - Client clears localStorage
```

### Data Retention & Privacy

```javascript
// Automated data retention policy
{
  evidence_files: {
    retention: '7 years',
    storage_class: 'S3 Standard -> Glacier after 90 days'
  },

  chargebacks: {
    retention: '7 years',
    anonymize_after: '2 years'  // Remove PII, keep stats
  },

  audit_logs: {
    retention: '3 years',
    hot_storage: '90 days',
    cold_storage: '3 years'
  },

  webhook_events: {
    retention: '90 days',
    auto_delete: true
  },

  user_accounts: {
    soft_delete: true,
    hard_delete_after: '30 days',
    export_on_request: true  // GDPR right to data portability
  },

  notifications: {
    retention: '90 days',
    auto_expire: true
  }
}
```

---

## Infrastructure & Deployment

### AWS Architecture

```
+--------------------------------------------------------------+
|                      AWS INFRASTRUCTURE                       |
+--------------------------------------------------------------+

+------------------------------------------------------------+
| Route 53 (DNS)                                              |
| - app.accudefend.com     -> CloudFront                      |
| - api.accudefend.com     -> ALB                             |
| - dev.accudefend.com     -> Dev ALB                         |
| - staging.accudefend.com -> Staging ALB                     |
+----------------------------+-------------------------------+
                             |
            +----------------+------------------+
            |                                   |
+-----------v------------+   +------------------v--------+
| CloudFront (CDN)       |   |  ALB (Load Balancer)      |
| - Static assets        |   |  - SSL termination        |
| - React SPA (Vite)     |   |  - Health check routing   |
+------------------------+   +------------------+--------+
                                                |
                              +-----------------+
                              |
                    +---------v----------+
                    | ECS Fargate        |
                    | (Web API + Webhooks)|
                    | - 2-10 tasks       |
                    | - Auto-scaling     |
                    +---------+----------+
                              |
                 +------------+------------+
                 |            |            |
      +----------v---+  +----v-------+  +-v-----------+
      | Aurora        |  | ElastiCache|  |    S3       |
      | PostgreSQL 16 |  | Redis 7    |  |  Evidence   |
      | (Multi-AZ)    |  | 3-node     |  |  Storage    |
      | - Primary     |  | cluster    |  | Cross-region|
      | - Standby     |  +------------+  | replication |
      | - Read replica|                  +-------------+
      +---------------+

Additional Services:
+-- AWS Textract (OCR)
+-- AWS Rekognition (ID verification)
+-- AWS Secrets Manager (credentials)
+-- CloudWatch (monitoring & logs)
+-- SNS / SQS (notifications & queuing)
+-- AWS Backup (daily snapshots)
```

### Terraform Infrastructure as Code

The infrastructure is defined in `infrastructure/aws/`:

| File | Purpose |
|------|---------|
| `main.tf` | Core infrastructure: VPC, ECS, Aurora, ElastiCache, S3, CloudFront, Route 53, ALB, Secrets Manager, SQS, SNS, CloudWatch |
| `variables.tf` | Configurable variables: regions, instance sizes, scaling parameters, domain names |

**Key Terraform Configuration:**
- Multi-region deployment (primary + secondary)
- S3 backend for state management with DynamoDB locking
- All resources tagged with Project=AccuDefend, Environment, ManagedBy=Terraform

### Docker Configuration

| File | Purpose |
|------|---------|
| `backend/Dockerfile` | Production backend image (Node.js 20/25.5 Alpine) |
| `backend/Dockerfile.dev` | Development backend with nodemon hot-reload |
| `frontend/Dockerfile` | Production frontend (multi-stage: Vite build + Nginx) |
| `docker-compose.yml` | Production orchestration (API + Frontend + PostgreSQL + Redis) |
| `docker-compose.dev.yml` | Development orchestration with hot-reload and volume mounts |

### Startup Scripts

| Script | Purpose |
|--------|---------|
| `start-dev.sh` | Launches development environment (docker-compose.dev.yml + Prisma migrations + seed) |
| `start-production.sh` | Launches production environment (docker-compose.yml with health checks) |
| `start-frontend.sh` | Standalone frontend development server (Vite on port 3000) |

### Deployment Environments

| Environment | Frontend URL | Backend URL | Purpose |
|-------------|-------------|-------------|---------|
| Local | `http://localhost:3000` | `http://localhost:8000` | Developer workstation |
| Development | `https://dev.accudefend.com` | `https://api-dev.accudefend.com` | Integration testing |
| Staging | `https://staging.accudefend.com` | `https://api-staging.accudefend.com` | Pre-production validation |
| Production | `https://app.accudefend.com` | `https://api.accudefend.com` | Live system |

### Deployment Pipeline

```
Developer Push
      |
      v
+---------------------+
|  GitHub Repo         |
|  (main branch)       |
+----------+----------+
           |
           | Webhook trigger
           v
+-------------------------------------+
|  GitHub Actions                      |
|                                      |
|  Stage 1: Build & Test              |
|  +-- npm install                    |
|  +-- npm run lint                   |
|  +-- npm run test                   |
|  +-- npm run build                  |
|                                      |
|  Stage 2: Docker Build              |
|  +-- docker build -t api:latest     |
|  +-- docker build -t frontend:latest|
|  +-- Push to ECR                    |
|                                      |
|  Stage 3: Database Migration        |
|  +-- npx prisma migrate deploy      |
|                                      |
|  Stage 4: Deploy                    |
|  +-- Update ECS task definition     |
|  +-- Blue/green deployment          |
|  +-- Health check verification      |
|                                      |
|  Stage 5: Post-Deploy               |
|  +-- Run smoke tests                |
|  +-- Notify team                    |
|  +-- Update status badge            |
+-------------------------------------+

Total deployment time: 8-12 minutes
Zero-downtime deployment: Yes (blue/green)
Rollback capability: Instant (previous task definition)
```

### Environment Configuration

```yaml
# Development
development:
  database_url: postgres://localhost:5432/accudefend_dev
  redis_url: redis://localhost:6379
  s3_bucket: accudefend-dev-evidence
  log_level: debug
  auto_submit_enabled: false
  frontend_port: 3000
  backend_port: 8000

# Staging
staging:
  database_url: ${STAGING_DB_URL}
  redis_url: ${STAGING_REDIS_URL}
  s3_bucket: accudefend-staging-evidence
  log_level: info
  auto_submit_enabled: true
  processors:
    stripe: test_mode
    adyen: test_mode

# Production
production:
  database_url: ${PROD_DB_URL}     # Aurora PostgreSQL Multi-AZ
  redis_url: ${PROD_REDIS_URL}     # ElastiCache 3-node cluster
  s3_bucket: accudefend-prod-evidence
  log_level: warn
  auto_submit_enabled: true
  processors:
    stripe: live_mode
    adyen: live_mode
    shift4: live_mode
    elavon: live_mode
```

---

## Monitoring & Observability

### Logging

- **Library:** Winston 3.11.0
- **Transports:** Console (development) + CloudWatch Logs (production)
- **HTTP Logging:** Morgan (combined format) piped through Winston
- **Log Levels:** error, warn, info, http, debug
- **Structured Output:** JSON format with timestamps and request IDs

### Health Checks

| Endpoint | Purpose | Checks |
|----------|---------|--------|
| `GET /health` | Basic liveness probe | Server is running |
| `GET /ready` | Readiness probe | PostgreSQL connected, Redis connected, S3 configured |

### Monitoring Stack

| Component | Tool |
|-----------|------|
| Application Logs | Winston + CloudWatch Logs |
| Metrics | CloudWatch Metrics |
| Error Tracking | Sentry |
| Uptime Monitoring | UptimeRobot / Pingdom |
| Infrastructure | AWS CloudWatch Dashboards |
| Database | Aurora Performance Insights |
| Cache | ElastiCache CloudWatch metrics |

### Key Metrics Tracked

- API response times (p50, p95, p99)
- Webhook processing latency
- Chargeback case processing time (webhook to submission)
- AI confidence score distribution
- Win rate trends by property and reason code
- Evidence collection completeness rates
- PMS sync success/failure rates
- Redis cache hit/miss ratios
- Database query performance

---

## Document History

### Version 2.0 (February 2026)

**Major changes from Version 1.0 (January 2026):**

1. **Product Branding:** Renamed from "Chargeback Defense System" to "AccuDefend" throughout the document to reflect the official product name.

2. **Technology Stack Updates:**
   - Removed TypeScript references; project uses plain JavaScript (JSX for frontend, CommonJS for backend)
   - Removed React Query, Zustand, and shadcn/ui; project uses plain React with Context API, Axios, and Lucide React icons
   - Removed React Native mobile apps; AccuDefend is web-only
   - Removed Kong API Gateway; uses Express directly with Nginx reverse proxy
   - Removed Bull Queue; uses direct async processing and AWS SQS/SNS
   - Added actual package versions from package.json files (jsonwebtoken 9.0.2, bcryptjs 2.4.3, Zod 3.22.4, Winston 3.11.0, Multer 1.4.5, etc.)

3. **Frontend Architecture:**
   - Documented actual 9-page structure: Login, Dashboard, Cases, CaseDetail, Analytics, Settings, PMSIntegration, DisputeIntegration, Tutorial (expanded to 10 pages in v3.0)
   - Documented 3 components: Layout, NotificationPanel, Tutorial (expanded to 7 components in v3.0)
   - Documented hooks (useAuth.jsx) and utils (api.js, helpers.js)
   - Added Recharts, date-fns, clsx as actual dependencies

4. **Backend Architecture:**
   - Documented actual 9 route modules: auth, cases, evidence, analytics, admin, webhooks, disputes, notifications, pms (expanded to 10 in v3.0)
   - Documented 8 services: fraudDetection, aiDefenseConfig, aiAgents, backlog, integrations, pmsIntegration, pmsSyncService, disputeCompanies
   - Documented 2 controllers: documentsController, notificationsController
   - Documented config modules: database, redis, s3, storage
   - Added mockData.js for development testing
   - Added dual Dockerfile support (production + dev with nodemon)

5. **Prisma Schema Updated:**
   - Replaced original conceptual schema with actual `schema.prisma` from the codebase
   - Updated UserRole enum: ADMIN, MANAGER, STAFF, READONLY (was admin, manager, user)
   - Added enums: ChargebackStatus, EvidenceType, ProviderType, TimelineEventType, AIRecommendation, BacklogStatus, BacklogPriority, BacklogCategory, AIAgentType, AIAgentStatus, DocumentCategory, NotificationType, NotificationPriority
   - Added models: Session, TimelineEvent, CaseNote, DisputeSubmission, AnalyticsSnapshot, SystemConfig, BacklogItem, BacklogEpic, Sprint, BacklogComment, BacklogDependency, BacklogActivity, BacklogAttachment, AIAgent, AIAgentRun, Integration, IntegrationEvent, SupportingDocument, Notification

6. **New Features Documented:**
   - Dispute company integrations with Merlink 2-way sync
   - In-app notification system with priority levels and NotificationPanel component
   - Tutorial/Help system with keyboard shortcut (?) and auto-launch for first-time users
   - AI Agents system (8 agent types: backlog manager, code reviewer, security scanner, dispute analyzer, evidence processor, etc.)
   - Technical backlog system with epics, sprints, items, dependencies, and AI-generated items
   - Supporting document management with local + S3 storage

7. **PMS Integrations Expanded:**
   - Expanded from 3 systems (Opera, Mews, Cloudbeds) to 30 PMS systems in 4 categories
   - Enterprise (15): Oracle Opera Cloud, Mews, Cloudbeds, AutoClerk, Agilysys, Infor, Stayntouch, RoomKey, Maestro, Hotelogix, RMS Cloud, Protel, eZee, SIHOT, innRoad
   - Boutique/Independent (6): Apaleo, WebRezPro, RoomMaster, Little Hotelier, Visual Matrix, ResNexus
   - Vacation Rental (4): Guesty, Hostaway, Lodgify, Escapia
   - Brand-Specific (5): Marriott FOSSE/MARSHA, Hilton OnQ, Hyatt OPERA, IHG Concerto, Best Western Central (with loyalty program integration)
   - Added 21 dispute/chargeback portal adapters: Prevention (3), Card Networks (4), Merchant Processors (9), Third-Party (5) (names standardized in v3.0)
   - All 51 adapters implement full two-way sync
   - Brand-specific PMS adapters include loyalty integration (Marriott Bonvoy, Hilton Honors, World of Hyatt, IHG One Rewards, Best Western Rewards)
   - Demo mode support: server starts gracefully without DB/Redis

8. **Infrastructure Updates:**
   - Documented Terraform IaC in infrastructure/aws/ (main.tf + variables.tf)
   - Documented Docker Compose configs (production + development)
   - Documented startup scripts (start-dev.sh, start-production.sh, start-frontend.sh)
   - Updated deployment environments with AccuDefend domain names
   - Documented Aurora PostgreSQL, ElastiCache Redis 3-node cluster, S3 cross-region replication

9. **Security Updates:**
   - Documented actual rate limiting configuration (100/15min general, 20/15min auth)
   - Documented JWT with Redis-backed token blacklisting
   - Documented bcryptjs 12 salt rounds
   - Documented Helmet middleware configuration
   - Documented property-level access control middleware
   - Documented Zod validation, Prisma SQL injection prevention

10. **API Routes Updated:**
    - Updated base URL to api.accudefend.com
    - Added /api/disputes/* endpoints
    - Added /api/notifications/* endpoints
    - Added /api/pms/* endpoints
    - Documented health check endpoints (/health, /ready)

11. **AI Confidence Scoring:**
    - Updated formula weights: 40% reason code + 35% evidence + 25% fraud indicators (+/-25 points)
    - Documented comprehensive reason code win rates for Visa, Mastercard, Amex, and Discover

12. **Code Examples:**
    - Updated all code examples from TypeScript to JavaScript to match actual codebase
    - Updated interface patterns to JavaScript class patterns

### Version 3.0 (February 2026)

**Major changes from Version 2.0:**

Node.js v25.5 compatibility, standardized PMS/adapter names, 7 components, 10 pages, 8 AI agents, deferred Prisma proxy.

1. **Node.js v25.5 Compatibility:** Added Node.js v25.5 support alongside Node.js 20 LTS across backend stack, Docker configuration, and deployment pipeline.

2. **Frontend Architecture:**
   - Expanded from 9 pages to 10 pages (added Reservations.jsx page)
   - All 7 components now documented: Layout, Tutorial, NotificationPanel, OutcomeTab, ArbitrationModal, ReservationViewer, GuestFolioViewer

3. **Backend Architecture:**
   - Expanded from 9 to 10 route modules (added reservations.js)
   - 2 controllers documented: documentsController.js, notificationsController.js
   - Removed legacy railway.json from directory listing

4. **Auto-Submit Threshold:** Changed from 80% (`confidenceScore >= 80`) to 85% (`confidenceScore >= 85`) for consistency across all documentation.

5. **PMS System Names Standardized:** Enterprise (15) names standardized to: Oracle Opera Cloud, Mews, Cloudbeds, AutoClerk, Agilysys, Infor, Stayntouch, RoomKey, Maestro, Hotelogix, RMS Cloud, Protel, eZee, SIHOT, innRoad.

6. **Dispute Adapter Names Standardized:**
   - Prevention (3): Verifi (Visa CDRN/RDR), Ethoca (Mastercard), Merlink
   - Card Networks (4): Visa VROL, Mastercom, AMEX Merchant, Discover Dispute
   - Merchant Processors (9): Elavon, Fiserv, Worldpay, Chase Merchant, Global Payments, TSYS, Square, Stripe, Authorize.net
   - Third-Party (5): Chargebacks911, Kount, Midigator, Signifyd, Riskified

7. **Notifications Endpoint:** Standardized to `POST /api/notifications/read-all` (was `POST /api/notifications/mark-all-read`).

8. **Database Configuration:** Added note about deferred Prisma proxy pattern enabling graceful server startup without database connectivity.

9. **AI Agents:** Confirmed 8 agent types documented: Backlog Manager, Code Reviewer, Documentation Agent, Test Generator, Security Scanner, Performance Monitor, Dispute Analyzer, Evidence Processor.
