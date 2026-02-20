# AccuDefend - System Design Document

## AI-Powered Chargeback Defense Platform

**Version:** 2.0.0
**Last Updated:** February 2026
**Document Type:** Technical Architecture & System Design

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview](#2-system-overview)
3. [Architecture](#3-architecture)
4. [Tech Stack](#4-tech-stack)
5. [Database Schema](#5-database-schema)
6. [API Design](#6-api-design)
7. [AI/ML Engine](#7-aiml-engine)
8. [Tutorial & Help System](#8-tutorial--help-system)
9. [Cloud Infrastructure](#9-cloud-infrastructure)
10. [Third-Party Integrations](#10-third-party-integrations)
11. [Technical Backlog System](#11-technical-backlog-system)
12. [AI Agents](#12-ai-agents)
13. [Security](#13-security)
14. [Deployment](#14-deployment)
15. [Appendix](#15-appendix)

---

## 1. Executive Summary

### 1.1 Purpose

AccuDefend is an AI-powered chargeback defense system specifically designed for the hospitality industry. It automates the collection, organization, and analysis of evidence to fight fraudulent chargebacks, significantly improving win rates and reducing revenue loss.

### 1.2 Key Features

- **Automated Evidence Collection** - Gather ID scans, signatures, folios, key card logs
- **AI-Powered Analysis** - Machine learning algorithms calculate win probability
- **Multi-Provider Support** - Integrates with Stripe, Adyen, Shift4, Elavon
- **Real-time Webhooks** - Instant notification of new disputes
- **Configurable Workflows** - Customizable evidence requirements per dispute type
- **Analytics Dashboard** - Track win rates, recovery amounts, trends

### 1.3 Business Value

| Metric | Impact |
|--------|--------|
| Win Rate Improvement | +25-40% |
| Response Time | -70% |
| Labor Cost Reduction | -60% |
| Evidence Completeness | +85% |

---

## 2. System Overview

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ACCUDEFEND PLATFORM                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│  │   Frontend   │     │   Backend    │     │   Storage    │                │
│  │   (React)    │◄───►│  (Node.js)   │◄───►│   (AWS S3)   │                │
│  │   Port 3000  │     │   Port 8000  │     │              │                │
│  └──────────────┘     └──────┬───────┘     └──────────────┘                │
│                              │                                              │
│                              ▼                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│  │  PostgreSQL  │◄───►│    Redis     │     │  AI Engine   │                │
│  │   Database   │     │    Cache     │     │   (Fraud     │                │
│  │              │     │              │     │   Detection) │                │
│  └──────────────┘     └──────────────┘     └──────────────┘                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL INTEGRATIONS                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │  Stripe  │  │  Adyen   │  │  Shift4  │  │  Elavon  │  │   PMS    │     │
│  │ Webhooks │  │ Webhooks │  │ Webhooks │  │ Webhooks │  │  System  │     │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Chargeback │     │   Webhook   │     │    Case     │     │     AI      │
│   Created   │────►│   Received  │────►│   Created   │────►│  Analysis   │
│  (Stripe)   │     │  (Backend)  │     │  (Database) │     │  (Scoring)  │
└─────────────┘     └─────────────┘     └─────────────┘     └──────┬──────┘
                                                                    │
                                                                    ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Dispute   │     │   Response  │     │  Evidence   │     │ Recommend-  │
│  Submitted  │◄────│  Generated  │◄────│  Collected  │◄────│   ation     │
│  (Provider) │     │  (System)   │     │   (Staff)   │     │  Generated  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

---

## 3. Architecture

### 3.1 Frontend Architecture

```
frontend/
├── src/
│   ├── App.jsx                 # Main application component
│   ├── main.jsx                # Entry point
│   ├── index.css               # Global styles (Tailwind)
│   │
│   ├── components/
│   │   ├── Layout.jsx              # Main layout with sidebar & help integration
│   │   ├── Tutorial.jsx            # Tutorial, HelpButton & HelpPanel components
│   │   ├── NotificationPanel.jsx   # Notification dropdown panel
│   │   ├── OutcomeTab.jsx          # Dispute outcome display (~250 lines)
│   │   ├── ArbitrationModal.jsx    # 3-step arbitration filing modal (~250 lines)
│   │   ├── ReservationViewer.jsx   # Reservation details viewer
│   │   └── GuestFolioViewer.jsx    # Guest folio details viewer
│   │
│   ├── pages/
│   │   ├── Login.jsx               # Authentication
│   │   ├── Dashboard.jsx           # Main dashboard with metrics
│   │   ├── Cases.jsx               # Case list & management
│   │   ├── CaseDetail.jsx          # Individual case view
│   │   ├── Analytics.jsx           # Reports & analytics
│   │   ├── Settings.jsx            # System configuration
│   │   ├── PMSIntegration.jsx      # PMS system connections
│   │   ├── DisputeIntegration.jsx  # Dispute company integrations (Merlink sync)
│   │   └── Tutorial.jsx            # Dedicated tutorial page
│   │
│   ├── hooks/
│   │   └── useAuth.jsx         # Authentication context & state
│   │
│   └── utils/
│       ├── api.js              # API client & formatting utilities
│       └── helpers.js          # Helper functions
│
├── tailwind.config.js          # Tailwind CSS config
├── vite.config.js              # Vite build config
├── nginx.conf                  # Production Nginx configuration
├── Dockerfile                  # Production container image
└── package.json
```

### 3.2 Backend Architecture

```
backend/
├── server.js                   # Express app entry point
│
├── config/
│   ├── database.js             # Prisma client setup (deferred Proxy pattern for Node.js v25 compatibility)
│   ├── redis.js                # Redis connection & session management
│   ├── s3.js                   # AWS S3 configuration
│   └── storage.js              # Storage abstraction layer
│
├── controllers/
│   ├── documentsController.js      # Document processing
│   └── notificationsController.js  # Notification handling
│
├── middleware/
│   └── auth.js                 # JWT authentication & role-based access
│
├── routes/
│   ├── auth.js                 # Login, register, refresh, logout
│   ├── cases.js                # Chargeback CRUD operations
│   ├── evidence.js             # File upload/download/deletion
│   ├── analytics.js            # Dashboard metrics, trends, reports
│   ├── admin.js                # User management, settings, storage health
│   ├── disputes.js             # Dispute company management
│   ├── notifications.js        # Notification panel & alerts
│   ├── pms.js                  # PMS system integration
│   ├── reservations.js         # Reservation viewing, folio, chargeback linking (demo fallback)
│   └── webhooks.js             # Payment processor webhooks (Stripe, Adyen, Shift4, Elavon)
│
├── services/
│   ├── fraudDetection.js       # AI fraud analysis engine
│   ├── aiDefenseConfig.js      # AI defense configuration management
│   ├── aiAgents.js             # Autonomous AI agent orchestration
│   ├── backlog.js              # Technical backlog management
│   ├── integrations.js         # Third-party API integration management
│   ├── pmsIntegration.js       # PMS system connection handler
│   ├── pmsSyncService.js       # PMS data synchronization service
│   └── disputeCompanies.js     # Dispute company integrations (Merlink, etc.)
│
├── data/
│   └── mockData.js             # Mock data for development testing
│
├── utils/
│   ├── validators.js           # Zod validation schemas
│   └── logger.js               # Winston logging configuration
│
├── prisma/
│   ├── schema.prisma           # Database schema
│   └── seed.js                 # Database seeding script
│
├── uploads/                    # Local file storage for evidence
├── Dockerfile                  # Production container image
├── Dockerfile.dev              # Development container (hot-reload with nodemon)
├── .env.example                # Environment variable template
└── package.json
```

### 3.3 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Layout Component                             │   │
│  │  ┌──────────┐  ┌──────────────────────────────────────────────┐    │   │
│  │  │ Sidebar  │  │              Page Content                     │    │   │
│  │  │          │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐     │    │   │
│  │  │ - Dash   │  │  │Dashboard │ │  Cases   │ │ Settings │     │    │   │
│  │  │ - Cases  │  │  │          │ │          │ │          │     │    │   │
│  │  │ - Stats  │  │  │ - Stats  │ │ - Table  │ │ - AI     │     │    │   │
│  │  │ - Config │  │  │ - Charts │ │ - Filter │ │ - Email  │     │    │   │
│  │  │ - PMS    │  │  │ - Urgent │ │ - Search │ │ - Storage│     │    │   │
│  │  │ - Dispute│  │  │          │ │          │ │          │     │    │   │
│  │  └──────────┘  │  └──────────┘ └──────────┘ └──────────┘     │    │   │
│  │                │                                              │    │   │
│  │                └──────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────────┐   │
│  │   Tutorial/Help     │  │    Auth Context     │  │  Notifications   │   │
│  │   - Onboarding      │  │    - User state     │  │  - Dropdown      │   │
│  │   - Help panel      │  │    - JWT tokens     │  │  - Alerts        │   │
│  └─────────────────────┘  └─────────────────────┘  └──────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Tech Stack

### 4.1 Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.x | UI framework |
| Vite | 5.x | Build tool |
| Tailwind CSS | 3.x | Styling |
| React Router | 6.x | Navigation |
| Lucide React | 0.x | Icons |
| Axios | 1.x | HTTP client |

### 4.2 Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 20+/25.5 | Runtime |
| Express.js | 4.x | Web framework |
| Prisma | 5.x | ORM |
| PostgreSQL | 16.x | Database |
| Redis | 7.x | Caching |
| JWT | - | Authentication |
| Zod | 3.x | Validation |
| Winston | 3.x | Logging |

### 4.3 Infrastructure

| Service | Purpose |
|---------|---------|
| AWS ECS Fargate | Container orchestration |
| AWS Aurora PostgreSQL | Managed database (Multi-AZ) |
| AWS ElastiCache Redis | Managed cache cluster |
| AWS S3 | Evidence file storage (cross-region replication) |
| AWS CloudFront | CDN for global edge distribution |
| AWS Route 53 | DNS management |
| AWS ALB | Load balancing with SSL termination |
| AWS Secrets Manager | Encrypted credential storage |
| AWS SQS | Webhook processing queue |
| AWS SNS | Notifications and alerts |
| AWS CloudWatch | Monitoring and alarms |
| Docker | Containerization |
| Terraform | Infrastructure as Code |
| Nginx | Reverse proxy |

---

## 5. Database Schema

### 5.1 Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│      User       │       │    Property     │       │    Provider     │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id              │       │ id              │       │ id              │
│ email           │       │ name            │       │ name            │
│ passwordHash    │       │ address         │       │ type            │
│ firstName       │◄─────►│ city            │       │ credentials     │
│ lastName        │       │ country         │◄─────►│ webhookSecret   │
│ role            │       │ timezone        │       │ enabled         │
│ propertyId      │       │ currency        │       │                 │
└─────────────────┘       └────────┬────────┘       └────────┬────────┘
                                   │                         │
                                   ▼                         ▼
                          ┌─────────────────────────────────────┐
                          │            Chargeback               │
                          ├─────────────────────────────────────┤
                          │ id                                  │
                          │ caseNumber                          │
                          │ status                              │
                          │ guestName / guestEmail              │
                          │ amount / currency                   │
                          │ transactionId / cardLastFour        │
                          │ reasonCode / reasonDescription      │
                          │ disputeDate / dueDate               │
                          │ checkInDate / checkOutDate          │
                          │ roomNumber / confirmationNumber     │
                          │ confidenceScore                     │
                          │ recommendation                      │
                          │ aiAnalysis                          │
                          │ fraudIndicators                     │
                          └──────────────┬──────────────────────┘
                                         │
           ┌─────────────────────────────┼─────────────────────────────┐
           │                             │                             │
           ▼                             ▼                             ▼
┌─────────────────┐           ┌─────────────────┐           ┌─────────────────┐
│    Evidence     │           │ TimelineEvent   │           │    CaseNote     │
├─────────────────┤           ├─────────────────┤           ├─────────────────┤
│ id              │           │ id              │           │ id              │
│ type            │           │ eventType       │           │ content         │
│ fileName        │           │ title           │           │ isInternal      │
│ s3Key           │           │ description     │           │ userId          │
│ mimeType        │           │ metadata        │           │ chargebackId    │
│ fileSize        │           │ chargebackId    │           │                 │
│ verified        │           │                 │           │                 │
│ chargebackId    │           │                 │           │                 │
└─────────────────┘           └─────────────────┘           └─────────────────┘
```

### 5.2 Key Enums

```typescript
// User Roles
enum UserRole {
  ADMIN      // Full system access
  MANAGER    // Property-level management
  STAFF      // Case handling
  READONLY   // View only
}

// Case Status
enum ChargebackStatus {
  PENDING     // New case, awaiting evidence
  IN_REVIEW   // Evidence collected, under review
  SUBMITTED   // Dispute response submitted
  WON         // Case won
  LOST        // Case lost
  EXPIRED     // Response deadline missed
  CANCELLED   // Case cancelled
}

// Evidence Types
enum EvidenceType {
  ID_SCAN                 // Government-issued photo ID
  AUTH_SIGNATURE          // Credit card authorization
  CHECKOUT_SIGNATURE      // Guest signature at checkout
  FOLIO                   // Detailed hotel bill
  RESERVATION_CONFIRMATION
  CANCELLATION_POLICY
  KEY_CARD_LOG            // Room access records
  CCTV_FOOTAGE            // Video evidence
  CORRESPONDENCE          // Emails/messages
  INCIDENT_REPORT         // Staff documentation
  DAMAGE_PHOTOS           // Property damage evidence
  POLICE_REPORT           // Law enforcement docs
  NO_SHOW_DOCUMENTATION
  ARBITRATION_DOCUMENT    // Arbitration filing evidence
  OTHER
}

// Dispute Types
enum DisputeType {
  FRAUD                   // Unauthorized transaction
  SERVICES_NOT_RECEIVED   // Guest claims no service
  NOT_AS_DESCRIBED        // Service mismatch
  CANCELLED               // Cancellation dispute
  IDENTITY_FRAUD          // Stolen identity
  GUEST_BEHAVIOR_ABUSE    // Damages/violations
  NO_SHOW                 // Failed to arrive
  OCCUPANCY_FRAUD         // Unauthorized guests
}

// AI Recommendations
enum AIRecommendation {
  AUTO_SUBMIT             // High confidence, submit automatically
  REVIEW_RECOMMENDED      // Needs human review
  GATHER_MORE_EVIDENCE    // Missing critical evidence
  UNLIKELY_TO_WIN         // Low win probability
}
```

---

## 6. API Design

### 6.1 Authentication

```
POST   /api/auth/login              # User login
POST   /api/auth/register           # New user registration
POST   /api/auth/refresh            # Refresh access token
POST   /api/auth/logout             # Invalidate session
GET    /api/auth/me                 # Current user info
```

### 6.2 Cases

```
GET    /api/cases                   # List cases (paginated)
GET    /api/cases/:id               # Get case details
POST   /api/cases                   # Create new case
PATCH  /api/cases/:id               # Update case
PATCH  /api/cases/:id/status        # Update case status
POST   /api/cases/:id/analyze       # Trigger AI analysis
POST   /api/cases/:id/notes         # Add case note
POST   /api/cases/:id/arbitration   # File arbitration for a lost case
```

### 6.3 Evidence

```
GET    /api/evidence/case/:id       # List evidence for case
POST   /api/evidence/upload/:id     # Upload single file
POST   /api/evidence/upload-multiple/:id  # Batch upload
GET    /api/evidence/:id/download   # Get download URL
PATCH  /api/evidence/:id/verify     # Mark as verified
DELETE /api/evidence/:id            # Delete evidence
```

### 6.4 Analytics

```
GET    /api/analytics/dashboard     # Dashboard metrics
GET    /api/analytics/trends        # Historical trends
GET    /api/analytics/by-reason     # Win rate by reason code
GET    /api/analytics/by-property   # Property comparison
```

### 6.5 Admin

```
GET    /api/admin/users             # List users
PATCH  /api/admin/users/:id         # Update user
GET    /api/admin/properties        # List properties
POST   /api/admin/properties        # Create property
GET    /api/admin/providers         # List providers
GET    /api/admin/config            # Get system config
PUT    /api/admin/config            # Update config
GET    /api/admin/storage/status    # Storage health check
GET    /api/admin/audit-log         # Audit trail
```

### 6.6 Webhooks

```
POST   /api/webhooks/stripe         # Stripe dispute events
POST   /api/webhooks/adyen          # Adyen notifications
POST   /api/webhooks/shift4         # Shift4 events
POST   /api/webhooks/elavon         # Elavon events
```

### 6.7 Disputes

```
GET    /api/disputes                # List dispute companies
POST   /api/disputes                # Add dispute company
PATCH  /api/disputes/:id            # Update dispute company
DELETE /api/disputes/:id            # Remove dispute company
```

### 6.8 Notifications

```
GET    /api/notifications           # List notifications
PATCH  /api/notifications/:id/read  # Mark notification as read
POST   /api/notifications/read-all  # Mark all as read
```

### 6.9 PMS

```
GET    /api/pms                     # List PMS connections
POST   /api/pms/connect             # Connect PMS system
POST   /api/pms/:id/sync            # Trigger PMS sync
DELETE /api/pms/:id                 # Disconnect PMS
```

### 6.10 Reservations

```
GET    /api/reservations                  # List reservations (filters, pagination w/ totalPages, demo fallback)
GET    /api/reservations/:id              # Get reservation details with folio items and linked chargebacks
GET    /api/reservations/search           # Search reservations (real-time PMS search)
GET    /api/reservations/:id/folio        # Get guest folio with line items
POST   /api/reservations/:id/link         # Link reservation to chargeback case
GET    /api/reservations/stats/summary    # Stats (totalReservations, linkedToChargebacks, flaggedGuests)
```

### 6.11 API Response Format

```json
// Success Response
{
  "success": true,
  "data": { ... },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}

// Error Response
{
  "error": "Error Type",
  "message": "Human readable message",
  "details": [ ... ]  // Validation errors
}
```

---

## 7. AI/ML Engine

### 7.1 Fraud Detection Algorithm

The AI engine calculates a **confidence score (0-100)** representing the probability of winning the dispute.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CONFIDENCE SCORE CALCULATION                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Final Score = Reason Code Base (40%) + Evidence Score (35%) + Indicators  │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ REASON CODE BASE (40% weight)                                        │   │
│   │                                                                      │   │
│   │ Each reason code has historical win rate:                            │   │
│   │ - 13.1 (Services Not Received): 75% base                            │   │
│   │ - 10.4 (Fraud - Card Absent): 45% base                              │   │
│   │ - 4837 (No Cardholder Auth): 40% base                               │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ EVIDENCE SCORE (35% weight)                                          │   │
│   │                                                                      │   │
│   │ Evidence Type         Weight                                         │   │
│   │ ─────────────────────────────                                        │   │
│   │ ID Scan               20%                                            │   │
│   │ Auth Signature        20%                                            │   │
│   │ Checkout Signature    15%                                            │   │
│   │ Folio                 15%                                            │   │
│   │ Key Card Log          10%                                            │   │
│   │ Police Report         12%                                            │   │
│   │ Incident Report       10%                                            │   │
│   │ Correspondence        5%                                             │   │
│   │ CCTV Footage          5%                                             │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ FRAUD INDICATORS (±25 points adjustment)                             │   │
│   │                                                                      │   │
│   │ POSITIVE (+points)           NEGATIVE (-points)                      │   │
│   │ ─────────────────────────────────────────────────                    │   │
│   │ Matching ID        +15       Missing Signature    -20                │   │
│   │ Repeat Guest       +10       Disputed Before      -15                │   │
│   │ Loyalty Member     +10       No-Show History      -15                │   │
│   │ Corporate Booking  +8        Third-Party Booking  -10                │   │
│   │ Advance Booking    +5        Foreign Card         -8                 │   │
│   │ Long Stay          +5        High Value (>$1000)  -5                 │   │
│   │ Direct Booking     +5        Same-Day Booking     -5                 │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Recommendation Thresholds

| Score Range | Recommendation | Action |
|-------------|----------------|--------|
| 85-100 | AUTO_SUBMIT | Submit dispute automatically |
| 70-84 | REVIEW_RECOMMENDED | Human review before submission |
| 50-69 | GATHER_MORE_EVIDENCE | Collect additional evidence |
| 0-49 | UNLIKELY_TO_WIN | Consider accepting the loss |

### 7.3 Evidence Requirements by Dispute Type

```javascript
const EVIDENCE_PACKETS = {
  fraud: {
    required: ['ID_SCAN', 'AUTH_SIGNATURE', 'FOLIO'],
    recommended: ['KEY_CARD_LOG', 'CCTV_FOOTAGE']
  },
  services_not_received: {
    required: ['FOLIO', 'CHECKOUT_SIGNATURE', 'KEY_CARD_LOG'],
    recommended: ['CORRESPONDENCE', 'CCTV_FOOTAGE']
  },
  identity_fraud: {
    required: ['ID_SCAN', 'AUTH_SIGNATURE', 'CCTV_FOOTAGE'],
    recommended: ['FOLIO', 'KEY_CARD_LOG', 'CORRESPONDENCE']
  },
  guest_behavior_abuse: {
    required: ['FOLIO', 'INCIDENT_REPORT', 'CCTV_FOOTAGE'],
    recommended: ['CORRESPONDENCE', 'DAMAGE_PHOTOS', 'POLICE_REPORT']
  },
  no_show: {
    required: ['RESERVATION_CONFIRMATION', 'CANCELLATION_POLICY', 'FOLIO'],
    recommended: ['CORRESPONDENCE', 'NO_SHOW_DOCUMENTATION']
  },
  occupancy_fraud: {
    required: ['KEY_CARD_LOG', 'FOLIO', 'CCTV_FOOTAGE'],
    recommended: ['INCIDENT_REPORT', 'CHECKOUT_SIGNATURE', 'CORRESPONDENCE']
  }
};
```

### 7.4 Dispute Outcome & Arbitration Workflow

When a case reaches a final resolution (WON or LOST), the system provides detailed outcome data and supports arbitration filing for lost cases.

**Outcome Display (OutcomeTab component):**

| Outcome | Data Displayed |
|---------|---------------|
| **WON** | Win factors, recovered amount, processor statement |
| **LOST** | Denial reason, denial code, evidence gaps analysis |

**Resolution Banners:**
- Green banner for WON cases with recovery details
- Red banner for LOST cases with denial summary
- Auto-navigation to Outcome tab for resolved cases

**Arbitration Workflow (ArbitrationModal component):**

For LOST cases, staff can file arbitration through a 3-step modal:

| Step | Name | Purpose |
|------|------|---------|
| 1 | Review | Review case details, denial reasons, and original evidence |
| 2 | Evidence & Narrative | Upload additional ARBITRATION_DOCUMENT evidence and compose arbitration narrative |
| 3 | Confirm | Review submission details and confirm arbitration filing |

**API Endpoint:** `POST /api/cases/:id/arbitration`

---

## 8. Tutorial & Help System

### 8.1 Overview

AccuDefend includes a comprehensive built-in tutorial and help system designed to onboard new users and provide contextual assistance throughout the application.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TUTORIAL & HELP SYSTEM                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    USER ONBOARDING FLOW                              │   │
│  │                                                                      │   │
│  │   First Login ──► Tutorial Auto-Launch ──► Step-by-Step Guide       │   │
│  │        │                                          │                  │   │
│  │        ▼                                          ▼                  │   │
│  │   localStorage ◄──────────────────────── Mark Complete              │   │
│  │   (tutorial_complete)                                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    HELP ACCESS METHODS                               │   │
│  │                                                                      │   │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │   │ Help Button  │  │  Keyboard    │  │  Help Panel  │              │   │
│  │   │ (Bottom-Right)│  │  Shortcut ?  │  │  (Sidebar)   │              │   │
│  │   └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Tutorial Steps

| Step | Title | Description |
|------|-------|-------------|
| 1 | Welcome | Introduction to AccuDefend platform |
| 2 | Dashboard Overview | Real-time metrics and KPIs |
| 3 | Managing Cases | Case list, filtering, and navigation |
| 4 | Uploading Evidence | Evidence requirements and file upload |
| 5 | AI Analysis | Confidence scores and recommendations |
| 6 | Configuration | Admin settings and thresholds |
| 7 | Completion | Ready to use confirmation |

### 8.3 Help Panel Features

```javascript
const helpTopics = [
  {
    title: 'Getting Started',
    items: [
      { label: 'Take the Tutorial', action: onStartTutorial },
      { label: 'Dashboard Overview', link: '/' },
      { label: 'Managing Cases', link: '/cases' },
      { label: 'Analytics & Reports', link: '/analytics' }
    ]
  },
  {
    title: 'Case Management',
    items: [
      { label: 'Creating a New Case', info: 'Via webhooks or API' },
      { label: 'Uploading Evidence', info: 'Evidence tab in case details' },
      { label: 'AI Recommendations', info: 'Confidence scores explained' }
    ]
  },
  {
    title: 'Admin Settings',
    items: [
      { label: 'Defense Configuration', link: '/settings' },
      { label: 'Email Notifications', link: '/settings' }
    ]
  },
  {
    title: 'Quick Tips',
    items: [
      { label: 'Keyboard Shortcuts', info: 'Press ? for help' },
      { label: 'Urgent Cases', info: 'Due within 7 days' },
      { label: 'Win Rate Calculation', info: 'Won / (Won + Lost)' }
    ]
  }
];
```

### 8.4 Component Architecture

```
frontend/src/components/Tutorial.jsx
├── Tutorial (Modal)          # Main tutorial overlay
│   ├── tutorialSteps[]       # Step configuration
│   ├── currentStep state     # Progress tracking
│   └── localStorage          # Completion persistence
│
├── HelpButton (FAB)          # Floating action button
│   └── Fixed bottom-right    # Always visible
│
└── HelpPanel (Sidebar)       # Help documentation panel
    ├── Navigation links      # Quick page access
    ├── Topic sections        # Organized help content
    └── Support contact       # Email link
```

### 8.5 Integration with Layout

The Tutorial system is integrated into the main Layout component:

```jsx
// Layout.jsx integration
import { Tutorial, HelpButton, HelpPanel } from './Tutorial';

// Auto-launch for first-time users
useEffect(() => {
  const tutorialComplete = localStorage.getItem('accudefend_tutorial_complete');
  if (!tutorialComplete) {
    setShowTutorial(true);
  }
}, []);

// Keyboard shortcut (? key)
useEffect(() => {
  const handleKeyDown = (e) => {
    if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
      setShowHelpPanel(true);
    }
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);
```

### 8.6 Persistence

| Key | Storage | Purpose |
|-----|---------|---------|
| `accudefend_tutorial_complete` | localStorage | Tracks if user completed tutorial |

---

## 9. Cloud Infrastructure

### 9.1 AWS Multi-Region Architecture

AccuDefend is deployed on AWS with a multi-region architecture for high availability and disaster recovery.

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              AWS CLOUD INFRASTRUCTURE                                     │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                         PRIMARY REGION (us-east-1)                               │   │
│  │                                                                                   │   │
│  │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │   │
│  │   │   Route 53  │───►│ CloudFront  │───►│     ALB     │───►│    ECS      │     │   │
│  │   │     DNS     │    │     CDN     │    │             │    │   Fargate   │     │   │
│  │   └─────────────┘    └─────────────┘    └─────────────┘    └──────┬──────┘     │   │
│  │                                                                    │             │   │
│  │                           ┌────────────────────────────────────────┤             │   │
│  │                           │                                        │             │   │
│  │                           ▼                                        ▼             │   │
│  │   ┌─────────────────────────────────────┐    ┌─────────────────────────────┐   │   │
│  │   │        Aurora PostgreSQL            │    │      ElastiCache Redis      │   │   │
│  │   │     (Multi-AZ, 3 Instances)         │    │    (3 Node Cluster)         │   │   │
│  │   └─────────────────────────────────────┘    └─────────────────────────────┘   │   │
│  │                           │                                                      │   │
│  │                           │ Replication                                          │   │
│  │                           ▼                                                      │   │
│  └───────────────────────────┼──────────────────────────────────────────────────────┘   │
│                              │                                                           │
│  ┌───────────────────────────┼──────────────────────────────────────────────────────┐   │
│  │                    SECONDARY REGION (us-west-2)                                   │   │
│  │                              │                                                    │   │
│  │   ┌──────────────────────────▼───────────────────────────────────┐               │   │
│  │   │            Aurora PostgreSQL (Read Replica)                   │               │   │
│  │   └───────────────────────────────────────────────────────────────┘               │   │
│  │                                                                                   │   │
│  └───────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              STORAGE LAYER                                        │   │
│  │                                                                                   │   │
│  │   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐               │   │
│  │   │  S3 - Evidence  │   │  S3 - Backlog   │   │  S3 - AI Models │               │   │
│  │   │   (Encrypted)   │   │    Storage      │   │                 │               │   │
│  │   │  Cross-Region   │   │                 │   │                 │               │   │
│  │   │   Replication   │   │                 │   │                 │               │   │
│  │   └─────────────────┘   └─────────────────┘   └─────────────────┘               │   │
│  │                                                                                   │   │
│  └───────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Infrastructure Components

| Component | Service | Configuration |
|-----------|---------|---------------|
| **Compute** | ECS Fargate | Backend (3 tasks), Frontend (2 tasks), AI Agent (2 tasks) |
| **Database** | Aurora PostgreSQL | Multi-AZ, 3 instances (1 writer, 2 readers) |
| **Cache** | ElastiCache Redis | 3-node cluster with automatic failover |
| **Storage** | S3 | Cross-region replication, lifecycle policies |
| **CDN** | CloudFront | Global edge locations |
| **DNS** | Route 53 | Health checks, failover routing |
| **Load Balancer** | ALB | SSL termination, path-based routing |
| **Secrets** | Secrets Manager | Encrypted credentials, automatic rotation |
| **Queues** | SQS | Webhook processing, AI analysis, backlog tasks |
| **Notifications** | SNS | Alerts, backlog updates |

### 9.3 S3 Bucket Structure

```
accudefend-evidence-production-us-east-1/
├── chargebacks/
│   └── {chargebackId}/
│       └── {evidenceType}/
│           └── {timestamp}-{uuid}-{filename}
│
accudefend-backlog-production/
├── attachments/
│   └── {backlogItemId}/
│       └── {filename}
├── exports/
│   └── {date}/
│       └── backlog-export.json
│
accudefend-ai-models-production/
├── models/
│   └── {modelVersion}/
│       └── model.bin
├── training-data/
│   └── {date}/
│       └── dataset.json
```

### 9.4 Database Relationships

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              DATABASE ENTITY RELATIONSHIPS                                │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│   ┌─────────────┐      ┌─────────────┐      ┌─────────────┐                            │
│   │    User     │──────│   Property  │──────│ Chargeback  │                            │
│   │             │ N:1  │             │ 1:N  │             │                            │
│   └──────┬──────┘      └─────────────┘      └──────┬──────┘                            │
│          │                                         │                                    │
│          │ 1:N                              ┌──────┴──────┐                            │
│          │                                  │             │                            │
│          ▼                                  ▼             ▼                            │
│   ┌─────────────┐                    ┌───────────┐ ┌───────────┐                       │
│   │BacklogItem  │◄───────────────────│ Evidence  │ │ Timeline  │                       │
│   │             │ Creator/Assignee   │           │ │  Event    │                       │
│   └──────┬──────┘                    └───────────┘ └───────────┘                       │
│          │                                                                              │
│   ┌──────┴──────┬─────────────┬─────────────┐                                          │
│   │             │             │             │                                          │
│   ▼             ▼             ▼             ▼                                          │
│ ┌───────┐  ┌────────┐  ┌──────────┐  ┌──────────┐                                     │
│ │ Epic  │  │ Sprint │  │ Comment  │  │ AIAgent  │                                     │
│ └───────┘  └────────┘  └──────────┘  └─────┬────┘                                     │
│                                            │                                           │
│                                      ┌─────┴─────┐                                     │
│                                      │           │                                     │
│                                      ▼           ▼                                     │
│                               ┌───────────┐ ┌──────────┐                              │
│                               │AIAgentRun │ │ Activity │                              │
│                               └───────────┘ └──────────┘                              │
│                                                                                        │
│   ┌─────────────┐                                                                      │
│   │ Integration │──────1:N─────┬─────────────────────┐                                │
│   │             │              │                     │                                 │
│   └─────────────┘              ▼                     ▼                                 │
│                         ┌─────────────┐      ┌─────────────┐                          │
│                         │ Integration │      │   Webhook   │                          │
│                         │    Event    │      │    Event    │                          │
│                         └─────────────┘      └─────────────┘                          │
│                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 9.5 Terraform Infrastructure

Infrastructure is managed as code using Terraform:

```bash
infrastructure/
├── aws/
│   ├── main.tf           # Main infrastructure definition (VPC, RDS, ECS, S3, ALB, etc.)
│   └── variables.tf      # Configuration variables (environment, sizing, API keys)
```

> **Note:** All infrastructure resources (VPC, Aurora PostgreSQL, ElastiCache, ECS Fargate, S3, CloudFront, Route 53, ALB, Secrets Manager, SQS, SNS, CloudWatch) are defined in `main.tf` (1,049 lines) with configurable variables in `variables.tf` (261 lines).

---

## 10. Third-Party Integrations

### 10.1 Integration Architecture (51 Total Integrations)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                     THIRD-PARTY INTEGRATIONS (51 Total)                                   │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│   PMS SYSTEMS (30)                      DISPUTE/CHARGEBACK PORTALS (21)                  │
│   ────────────────                      ───────────────────────────────                  │
│   ┌──────────────┐  ┌──────────────┐    ┌──────────────┐  ┌──────────────┐              │
│   │  Enterprise  │  │  Boutique/   │    │  Prevention  │  │ Card Network │              │
│   │  (15 systems)│  │  Independent │    │  (3 adapters)│  │ (4 adapters) │              │
│   └──────┬───────┘  │  (6 systems) │    └──────┬───────┘  └──────┬───────┘              │
│          │          └──────┬───────┘           │                 │                       │
│   ┌──────┴───────┐  ┌─────┴────────┐    ┌─────┴────────┐  ┌────┴─────────┐              │
│   │  Vacation    │  │ Brand-Specific│    │  Merchant    │  │  Third-Party │              │
│   │  Rental      │  │ (5 systems   │    │  Processors  │  │  (5 adapters)│              │
│   │  (4 systems) │  │  w/ loyalty) │    │  (9 adapters)│  │              │              │
│   └──────┬───────┘  └──────┬───────┘    └──────┬───────┘  └──────┬───────┘              │
│          │                 │                    │                 │                       │
│          └─────────────────┴────────────────────┴─────────────────┘                      │
│                                    │                                                     │
│                                    ▼                                                     │
│                    ┌───────────────────────────────────┐                                 │
│                    │       INTEGRATION SERVICE         │                                 │
│                    │  • Full two-way sync (all 51)    │                                 │
│                    │  • Webhook handling               │                                 │
│                    │  • Credential encryption          │                                 │
│                    │  • Event logging                  │                                 │
│                    │  • Demo mode support              │                                 │
│                    └───────────────────────────────────┘                                 │
│                                    │                                                     │
│        ┌───────────────────────────┼───────────────────────────┐                        │
│        │                           │                           │                        │
│        ▼                           ▼                           ▼                        │
│   ┌──────────┐              ┌──────────┐              ┌──────────┐                      │
│   │  Slack   │              │   Jira   │              │  GitHub  │                      │
│   │  Alerts  │              │  Issues  │              │   PRs    │                      │
│   └──────────┘              └──────────┘              └──────────┘                      │
│                                                                                          │
│   COMMUNICATION                   PROJECT MGMT                   VERSION CONTROL         │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 PMS Integrations (30 Systems)

| Category | Count | Systems | Features |
|----------|-------|---------|----------|
| **Enterprise** | 15 | Oracle Opera Cloud, Mews, Cloudbeds, AutoClerk, Agilysys, Infor, Stayntouch, RoomKey, Maestro, Hotelogix, RMS Cloud, Protel, eZee, SIHOT, innRoad | Full two-way sync, evidence collection |
| **Boutique/Independent** | 6 | Little Hotelier, Frontdesk Anywhere, WebRezPro, ThinkReservations, ResNexus, Guestline | Full two-way sync, evidence collection |
| **Vacation Rental** | 4 | Guesty, Hostaway, Lodgify, Escapia | Rental agreements, damage deposits, guest verification |
| **Brand-Specific** | 5 | Marriott GXP, Hilton OnQ, Hyatt Opera, IHG Concerto, Best Western | Loyalty program integration (Marriott Bonvoy, Hilton Honors, World of Hyatt, IHG One Rewards, Best Western Rewards) |

### 10.3 Dispute/Chargeback Portal Integrations (21 Adapters)

| Category | Count | Portals | Capabilities |
|----------|-------|---------|-------------|
| **Prevention** | 3 | Verifi (Visa), Ethoca (Mastercard), RDR | Real-time alerts, pre-dispute deflection |
| **Card Networks** | 4 | Visa Resolve Online, Mastercard Connect, Amex Dispute Center, Discover eDisputes | Evidence submission, status tracking, case management |
| **Merchant Processors** | 9 | Stripe, Adyen, Shift4, Elavon, Chase Paymentech, Worldpay, Global Payments, TSYS, First Data | Webhook disputes, evidence upload, representment |
| **Third-Party** | 5 | Merlink, Chargebacks911, SERTIFI, Midigator, DisputeHelp | Full 2-way sync, case management, analytics |

### 10.4 Other Integrations

| Category | Provider | Status | Capabilities |
|----------|----------|--------|--------------|
| **Comm** | Slack | Active | Alerts, notifications |
| **Comm** | MS Teams | Planned | Notifications |
| **PM** | Jira | Active | Issue sync, backlog |
| **PM** | GitHub | Active | Issues, PRs, webhooks |
| **Email** | SendGrid | Active | Transactional emails |
| **Email** | AWS SES | Active | Bulk notifications |

### 10.5 Integration Configuration

```javascript
// Example: Creating a Stripe integration
const integration = await IntegrationService.createIntegration(
  'STRIPE',
  { environment: 'production' },
  {
    apiKey: 'sk_live_...',
    webhookSecret: 'whsec_...',
    accountId: 'acct_...'
  }
);

// Test connection
await IntegrationService.testConnection(integration.id);

// Sync disputes
await IntegrationService.syncIntegration(integration.id);
```

---

## 11. Technical Backlog System

### 11.1 Backlog Architecture

AccuDefend includes a comprehensive technical backlog system for managing development tasks, bug fixes, and improvements.

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              BACKLOG MANAGEMENT SYSTEM                                    │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │                              BACKLOG HIERARCHY                                   │   │
│   │                                                                                  │   │
│   │   ┌─────────┐                                                                   │   │
│   │   │  EPIC   │  Large feature or initiative                                      │   │
│   │   └────┬────┘                                                                   │   │
│   │        │                                                                        │   │
│   │        ├───────────────┬───────────────┬───────────────┐                       │   │
│   │        ▼               ▼               ▼               ▼                       │   │
│   │   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐                    │   │
│   │   │  Item   │    │  Item   │    │  Item   │    │  Item   │  Backlog Items     │   │
│   │   └────┬────┘    └─────────┘    └─────────┘    └─────────┘                    │   │
│   │        │                                                                        │   │
│   │        ├───────────────┬───────────────┐                                       │   │
│   │        ▼               ▼               ▼                                       │   │
│   │   ┌─────────┐    ┌─────────┐    ┌─────────┐                                   │   │
│   │   │ Comment │    │Dependent│    │Attachment│  Related entities               │   │
│   │   └─────────┘    └─────────┘    └─────────┘                                   │   │
│   │                                                                                 │   │
│   └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                          │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │                              SPRINT WORKFLOW                                     │   │
│   │                                                                                  │   │
│   │   BACKLOG ──► SPRINT PLANNED ──► SPRINT ACTIVE ──► SPRINT COMPLETED            │   │
│   │      │              │                  │                   │                    │   │
│   │      │         Items moved to     Items worked on     Velocity calculated       │   │
│   │      │           sprint              in sprint         Incomplete items          │   │
│   │      │                                                  moved back               │   │
│   │      ▼                                                                          │   │
│   │   Items prioritized                                                             │   │
│   │   by AI agents                                                                  │   │
│   │                                                                                 │   │
│   └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Backlog Item States

| Status | Description |
|--------|-------------|
| **OPEN** | New item, not yet started |
| **IN_PROGRESS** | Currently being worked on |
| **IN_REVIEW** | Code complete, awaiting review |
| **TESTING** | Under QA testing |
| **DONE** | Completed and deployed |
| **BLOCKED** | Blocked by dependency or issue |
| **CANCELLED** | No longer needed |

### 11.3 Backlog Categories

| Category | Description | Examples |
|----------|-------------|----------|
| **BUG** | Software defects | Fix login error, API timeout |
| **FEATURE** | New functionality | Add export feature, new report |
| **ENHANCEMENT** | Improvements to existing | Better error messages |
| **TECH_DEBT** | Code quality improvements | Refactor module, update deps |
| **SECURITY** | Security improvements | Fix vulnerability, add auth |
| **PERFORMANCE** | Speed/efficiency | Optimize query, add caching |
| **DOCUMENTATION** | Docs updates | Update README, API docs |
| **INFRASTRUCTURE** | Infra changes | Add monitoring, scale DB |

### 11.4 AI-Generated Items

Backlog items can be automatically created by AI agents:

```javascript
// AI Agent creates backlog item
const item = await backlogService.createItem({
  title: '[Security] Update vulnerable dependency: lodash',
  description: 'CVE-2021-23337 found in lodash@4.17.20. Update to 4.17.21.',
  category: 'SECURITY',
  priority: 'HIGH',
  aiGenerated: true,
  aiAgentId: securityAgentId,
  aiConfidence: 0.95,
  aiReasoning: 'Critical vulnerability with known exploit',
  labels: ['security', 'dependencies', 'ai-generated']
}, null);
```

---

## 12. AI Agents

### 12.1 Agent Architecture

AccuDefend employs autonomous AI agents to manage various aspects of the system.

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              AI AGENT ECOSYSTEM                                          │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │                              AGENT TYPES                                         │   │
│   │                                                                                  │   │
│   │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │   │
│   │   │   Backlog    │  │    Code      │  │Documentation │  │     Test     │       │   │
│   │   │   Manager    │  │   Reviewer   │  │    Agent     │  │  Generator   │       │   │
│   │   │              │  │              │  │              │  │              │       │   │
│   │   │ • Prioritize │  │ • Review PRs │  │ • Generate   │  │ • Unit tests │       │   │
│   │   │ • Estimate   │  │ • Security   │  │   docs       │  │ • Integration│       │   │
│   │   │ • Dependencies│  │ • Best       │  │ • Changelogs │  │ • Edge cases │       │   │
│   │   │              │  │   practices  │  │ • API docs   │  │              │       │   │
│   │   └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘       │   │
│   │                                                                                  │   │
│   │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │   │
│   │   │   Security   │  │ Performance  │  │   Dispute    │  │   Evidence   │       │   │
│   │   │   Scanner    │  │   Monitor    │  │   Analyzer   │  │  Processor   │       │   │
│   │   │              │  │              │  │              │  │              │       │   │
│   │   │ • Vuln scan  │  │ • Metrics    │  │ • Win prob   │  │ • OCR        │       │   │
│   │   │ • Secrets    │  │ • Bottlenecks│  │ • Strategy   │  │ • Validation │       │   │
│   │   │ • Deps audit │  │ • Optimize   │  │ • Evidence   │  │ • Extraction │       │   │
│   │   └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘       │   │
│   │                                                                                  │   │
│   └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                          │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │                              AGENT EXECUTION                                     │   │
│   │                                                                                  │   │
│   │   Triggers:                                                                      │   │
│   │   ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐                   │   │
│   │   │ Scheduled │  │  Webhook  │  │   Event   │  │   Manual  │                   │   │
│   │   │  (Cron)   │  │  Trigger  │  │  Driven   │  │  Trigger  │                   │   │
│   │   └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘                   │   │
│   │         │              │              │              │                          │   │
│   │         └──────────────┴──────────────┴──────────────┘                          │   │
│   │                                    │                                             │   │
│   │                                    ▼                                             │   │
│   │                    ┌───────────────────────────────────┐                        │   │
│   │                    │         AGENT RUNNER              │                        │   │
│   │                    │  • Queue management               │                        │   │
│   │                    │  • Rate limiting                  │                        │   │
│   │                    │  • Error handling                 │                        │   │
│   │                    │  • Run logging                    │                        │   │
│   │                    └───────────────────────────────────┘                        │   │
│   │                                                                                  │   │
│   └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### 12.2 Agent Types

| Agent | Purpose | Schedule | Model |
|-------|---------|----------|-------|
| **Backlog Manager** | Create and prioritize backlog items | Daily 9 AM | Claude 3 Sonnet |
| **Code Reviewer** | Review pull requests | Event-driven | Claude 3 Sonnet |
| **Documentation Agent** | Generate/update docs | Weekly | Claude 3 Sonnet |
| **Test Generator** | Create test cases | Event-driven | Claude 3 Sonnet |
| **Security Scanner** | Scan for vulnerabilities | Daily 2 AM | Claude 3 Sonnet |
| **Performance Monitor** | Analyze metrics | Every 6 hours | Claude 3 Haiku |
| **Dispute Analyzer** | Analyze chargebacks | Event-driven | Claude 3 Opus |
| **Evidence Processor** | Process evidence docs | Event-driven | Claude 3 Sonnet |

### 12.3 Agent Configuration

```javascript
// Agent configuration structure
const agentConfig = {
  name: 'Backlog Manager',
  type: 'BACKLOG_MANAGER',
  status: 'IDLE',
  schedule: '0 9 * * 1-5',  // Cron expression
  priority: 5,
  capabilities: [
    'create_backlog_item',
    'update_backlog_item',
    'prioritize_items'
  ],
  modelProvider: 'anthropic',
  modelName: 'claude-3-sonnet',
  maxTokens: 4096,
  temperature: 0.7
};
```

### 12.4 Agent Run Lifecycle

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ TRIGGER  │───►│ RUNNING  │───►│COMPLETED │───►│  LOGGED  │
│          │    │          │    │          │    │          │
│ Scheduled│    │ Execute  │    │ Output   │    │ Stats    │
│ Manual   │    │ Logic    │    │ Stored   │    │ Updated  │
│ Event    │    │          │    │          │    │          │
└──────────┘    └──────┬───┘    └──────────┘    └──────────┘
                       │
                       │ Error
                       ▼
                ┌──────────┐
                │  FAILED  │
                │          │
                │ Error    │
                │ Logged   │
                │ Retry?   │
                └──────────┘
```

### 12.5 Agent Statistics Dashboard

The system tracks comprehensive metrics for each agent:

- Total runs
- Success rate
- Average duration
- Backlog items created
- Last run timestamp
- Error history

---

## 13. Security

### 13.1 Authentication Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │     │  Server  │     │   JWT    │     │ Database │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │  POST /login   │                │                │
     │───────────────►│                │                │
     │                │  Verify user   │                │
     │                │───────────────────────────────►│
     │                │                │                │
     │                │  Generate tokens                │
     │                │───────────────►│                │
     │                │                │                │
     │  Access Token (15m) + Refresh Token (7d)        │
     │◄───────────────│                │                │
     │                │                │                │
     │  API Request + Bearer Token     │                │
     │───────────────►│                │                │
     │                │  Verify JWT    │                │
     │                │───────────────►│                │
     │                │                │                │
     │  Response      │                │                │
     │◄───────────────│                │                │
```

### 13.2 Security Measures

| Layer | Protection |
|-------|------------|
| Transport | HTTPS/TLS 1.3 |
| Authentication | JWT with refresh tokens |
| Password | bcrypt (12 rounds) |
| API | Rate limiting (100 req/15min) |
| Files | S3 server-side encryption (AES-256) |
| Database | Prepared statements (Prisma) |
| Input | Zod validation schemas |
| CORS | Whitelist origins |

### 13.3 Role-Based Access Control

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PERMISSION MATRIX                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Feature              ADMIN    MANAGER    STAFF    READONLY                 │
│  ─────────────────────────────────────────────────────────                  │
│  View Dashboard        ✓         ✓          ✓         ✓                     │
│  View Cases            ✓         ✓          ✓         ✓                     │
│  Create Cases          ✓         ✓          ✓         ✗                     │
│  Update Cases          ✓         ✓          ✓         ✗                     │
│  Upload Evidence       ✓         ✓          ✓         ✗                     │
│  Delete Evidence       ✓         ✓          ✗         ✗                     │
│  View Analytics        ✓         ✓          ✓         ✓                     │
│  System Settings       ✓         ✗          ✗         ✗                     │
│  User Management       ✓         ✗          ✗         ✗                     │
│  AI Configuration      ✓         ✗          ✗         ✗                     │
│  Audit Logs            ✓         ✗          ✗         ✗                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 14. Deployment

### 14.1 Payment Processor Webhooks

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           WEBHOOK FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Payment Processor                    AccuDefend                           │
│   ─────────────────                    ──────────                           │
│                                                                              │
│   ┌─────────────┐                      ┌─────────────┐                      │
│   │   Stripe    │  POST /webhooks/     │   Webhook   │                      │
│   │   Dispute   │─────────────────────►│   Handler   │                      │
│   │   Created   │  stripe              │             │                      │
│   └─────────────┘                      └──────┬──────┘                      │
│                                               │                              │
│                                               ▼                              │
│                                        ┌─────────────┐                      │
│                                        │  Validate   │                      │
│                                        │  Signature  │                      │
│                                        └──────┬──────┘                      │
│                                               │                              │
│                                               ▼                              │
│                                        ┌─────────────┐                      │
│                                        │   Create    │                      │
│                                        │    Case     │                      │
│                                        └──────┬──────┘                      │
│                                               │                              │
│                                               ▼                              │
│                                        ┌─────────────┐                      │
│                                        │   Run AI    │                      │
│                                        │  Analysis   │                      │
│                                        └──────┬──────┘                      │
│                                               │                              │
│                                               ▼                              │
│                                        ┌─────────────┐                      │
│                                        │   Notify    │                      │
│                                        │   Staff     │                      │
│                                        └─────────────┘                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 14.2 Supported Providers

| Provider | Webhook Events | Status |
|----------|----------------|--------|
| Stripe | charge.dispute.created, updated, closed | ✓ Implemented |
| Adyen | CHARGEBACK, CHARGEBACK_REVERSED | ✓ Implemented |
| Shift4 | dispute.opened, dispute.closed | ✓ Implemented |
| Elavon | chargeback_notification | ✓ Implemented |

### 14.3 Reason Code Mapping

```javascript
// Visa Reason Codes
'13.1' → 'Services Not Received'
'13.2' → 'Cancelled Recurring'
'13.3' → 'Not as Described'
'10.4' → 'Fraud - Card Absent'

// Mastercard Reason Codes
'4855' → 'Non-Receipt'
'4853' → 'Cardholder Dispute'
'4837' → 'No Cardholder Auth'

// Amex Reason Codes
'C14' → 'Paid by Other Means'
'C31' → 'Not as Described'
'F29' → 'Card Not Present Fraud'
```

---

### 14.4 Environment Variables

```bash
# Application
NODE_ENV=production
PORT=8000
APP_NAME=AccuDefend

# Database
DATABASE_URL=postgresql://user:pass@host:5432/accudefend

# Redis
REDIS_URL=redis://host:6379

# JWT
JWT_SECRET=<secure-random-string>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# AWS S3
AWS_ACCESS_KEY_ID=<your-access-key>
AWS_SECRET_ACCESS_KEY=<your-secret-key>
AWS_REGION=us-east-1
AWS_S3_BUCKET=accudefend-evidence

# Payment Providers
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
ADYEN_API_KEY=...
ADYEN_HMAC_KEY=...

# Security
BCRYPT_SALT_ROUNDS=12
CORS_ORIGINS=https://app.accudefend.com
```

### 14.5 Docker Deployment

```yaml
# docker-compose.yml
version: '3.8'

services:
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - VITE_API_URL=http://backend:8000

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    depends_on:
      - postgres
      - redis
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/accudefend
      - REDIS_URL=redis://redis:6379

  postgres:
    image: postgres:16-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=accudefend

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### 14.6 Production Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PRODUCTION DEPLOYMENT                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                              ┌─────────────┐                                │
│                              │  Route 53 / │                                │
│                              │ CloudFront  │                                │
│                              └──────┬──────┘                                │
│                                     │                                        │
│                              ┌──────▼──────┐                                │
│                              │    Nginx    │                                │
│                              │   (SSL)     │                                │
│                              └──────┬──────┘                                │
│                                     │                                        │
│                    ┌────────────────┼────────────────┐                      │
│                    │                │                │                      │
│             ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐              │
│             │  Frontend   │  │   Backend   │  │   Backend   │              │
│             │   (React)   │  │  (Node 1)   │  │  (Node 2)   │              │
│             └─────────────┘  └──────┬──────┘  └──────┬──────┘              │
│                                     │                │                      │
│                    ┌────────────────┴────────────────┘                      │
│                    │                                                         │
│             ┌──────▼──────┐  ┌─────────────┐  ┌─────────────┐              │
│             │  PostgreSQL │  │    Redis    │  │   AWS S3    │              │
│             │   (RDS)     │  │ (Elasticache│  │  (Evidence) │              │
│             └─────────────┘  └─────────────┘  └─────────────┘              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 15. Appendix

### 15.1 Glossary

| Term | Definition |
|------|------------|
| **Chargeback** | A forced transaction reversal initiated by the cardholder's bank |
| **Reason Code** | A code assigned by card networks explaining the dispute reason |
| **Folio** | The itemized guest bill from the hotel |
| **Representment** | The process of fighting a chargeback by submitting evidence |
| **Pre-arbitration** | Second stage of dispute if initial representment fails |
| **Arbitration** | Final stage where card network makes binding decision |

### 15.2 Reason Code Win Rates (Historical Data)

| Code | Category | Avg Win Rate |
|------|----------|--------------|
| 13.1 | Services Not Received | 75% |
| 13.2 | Cancelled Recurring | 70% |
| 4855 | Non-Receipt (MC) | 75% |
| C14 | Paid by Other Means (Amex) | 70% |
| 13.3 | Not as Described | 55% |
| 10.4 | Fraud - Card Absent | 45% |
| 4837 | No Cardholder Auth | 40% |
| F29 | CNP Fraud (Amex) | 35% |

### 15.3 File Structure

```
accudefend/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout.jsx              # Main layout with sidebar & nav
│   │   │   ├── Tutorial.jsx            # Tutorial & Help system
│   │   │   ├── NotificationPanel.jsx   # Notification dropdown panel
│   │   │   ├── OutcomeTab.jsx          # Dispute outcome display
│   │   │   ├── ArbitrationModal.jsx    # Arbitration filing modal
│   │   │   ├── ReservationViewer.jsx   # Reservation details viewer
│   │   │   └── GuestFolioViewer.jsx    # Guest folio details viewer
│   │   ├── pages/
│   │   │   ├── Login.jsx               # Authentication
│   │   │   ├── Dashboard.jsx           # Main dashboard with metrics
│   │   │   ├── Cases.jsx               # Case list & management
│   │   │   ├── CaseDetail.jsx          # Individual case details
│   │   │   ├── Analytics.jsx           # Reports & analytics
│   │   │   ├── Settings.jsx            # System configuration
│   │   │   ├── PMSIntegration.jsx      # PMS connections
│   │   │   ├── DisputeIntegration.jsx  # Dispute company integrations
│   │   │   └── Tutorial.jsx            # Dedicated tutorial page
│   │   ├── hooks/
│   │   │   └── useAuth.jsx             # Auth context & state
│   │   └── utils/
│   │       ├── api.js                  # API client & formatting
│   │       └── helpers.js              # Helper functions
│   ├── .env                            # Frontend config
│   ├── nginx.conf                      # Production Nginx config
│   ├── Dockerfile                      # Production container
│   ├── package.json
│   └── vite.config.js
│
├── backend/
│   ├── config/
│   │   ├── database.js                 # Prisma setup (deferred Proxy pattern for Node.js v25 compatibility)
│   │   ├── redis.js                    # Redis connection & sessions
│   │   ├── s3.js                       # AWS S3 config
│   │   └── storage.js                  # Storage abstraction
│   ├── controllers/
│   │   ├── documentsController.js      # Document processing
│   │   └── notificationsController.js  # Notification handling
│   ├── middleware/
│   │   └── auth.js                     # JWT middleware & RBAC
│   ├── routes/
│   │   ├── auth.js                     # Authentication
│   │   ├── cases.js                    # Chargeback CRUD
│   │   ├── evidence.js                 # File uploads
│   │   ├── analytics.js               # Dashboard & reports
│   │   ├── admin.js                    # Admin functions
│   │   ├── disputes.js                 # Dispute company management
│   │   ├── notifications.js           # Notification panel & alerts
│   │   ├── pms.js                      # PMS integration
│   │   ├── reservations.js             # Reservation viewing, folio, chargeback linking
│   │   └── webhooks.js                 # Payment webhooks
│   ├── services/
│   │   ├── fraudDetection.js           # AI fraud analysis engine
│   │   ├── aiDefenseConfig.js          # AI defense configuration
│   │   ├── aiAgents.js                 # AI agent orchestration
│   │   ├── backlog.js                  # Backlog management
│   │   ├── integrations.js             # Third-party integrations
│   │   ├── pmsIntegration.js           # PMS connections
│   │   ├── pmsSyncService.js           # PMS data sync
│   │   └── disputeCompanies.js         # Dispute company integrations
│   ├── data/
│   │   └── mockData.js                 # Mock data for development
│   ├── utils/
│   │   ├── logger.js                   # Winston logging
│   │   └── validators.js              # Zod schemas
│   ├── prisma/
│   │   ├── schema.prisma               # Database schema
│   │   └── seed.js                     # Database seeding
│   ├── uploads/                        # Local file storage
│   ├── .env                            # Backend config
│   ├── .env.example                    # Config template
│   ├── Dockerfile                      # Production container
│   ├── Dockerfile.dev                  # Development container (hot-reload)
│   └── package.json
│
├── infrastructure/
│   └── aws/
│       ├── main.tf                     # Terraform infrastructure
│       └── variables.tf                # Infrastructure variables
├── docker-compose.yml                  # Production container orchestration
├── docker-compose.dev.yml              # Development environment
├── start-dev.sh                        # Development startup script
├── start-production.sh                 # Production startup script
├── start-frontend.sh                   # Frontend-only startup script
├── DEPLOYMENT.md                       # Deployment guide
├── README.md                           # Project documentation
└── AccuDefend_System_Design.md         # System architecture
```

### 15.4 Quick Start Commands

```bash
# Start Backend
cd backend
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev

# Start Frontend
cd frontend
npm install
npm run dev

# Access Application
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000

# Login
# Email: admin@accudefend.com
# Password: AccuAdmin123!
```

---

## Document Information

| Field | Value |
|-------|-------|
| Author | AccuDefend Engineering |
| Version | 2.0.0 |
| Status | Production Ready |
| Last Review | February 2026 |

---

*© 2026 AccuDefend. All rights reserved.*
