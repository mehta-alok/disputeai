# DisputeAI - Product Requirements Document

**Version:** 1.0
**Date:** February 16, 2026
**Status:** Phase 1 (MVP) - Active Development
**Document Owner:** DisputeAI Product Team

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Solution Overview](#3-solution-overview)
4. [Target Users](#4-target-users)
5. [Feature Requirements](#5-feature-requirements)
6. [Technical Architecture](#6-technical-architecture)
7. [API Specification](#7-api-specification)
8. [Security Requirements](#8-security-requirements)
9. [Performance Requirements](#9-performance-requirements)
10. [Success Metrics](#10-success-metrics)
11. [Roadmap](#11-roadmap)
12. [Appendix](#12-appendix)

---

## 1. Executive Summary

DisputeAI is a SaaS platform that helps hotels and hospitality businesses defend against fraudulent chargebacks. The hotel industry loses billions of dollars annually to chargebacks, many of which are filed fraudulently or could be successfully disputed with proper evidence. DisputeAI addresses this by combining AI-powered analysis, automated evidence collection, and deep integrations with Property Management Systems (PMS) and dispute processors to maximize chargeback win rates.

The platform provides a unified dashboard where hotel teams can manage disputes end-to-end: from initial detection through evidence compilation to final resolution. Eight specialized AI agents analyze each case, score fraud likelihood, draft responses, and predict outcomes. Integration with 30 PMS platforms, 29 dispute processors, and 9 OTA integrations (68 total) ensures that evidence gathering and dispute filing are largely automated, reducing manual effort by over 90%.

DisputeAI is currently in its MVP phase with a fully functional demo mode, a complete frontend application, and production-ready backend infrastructure.

---

## 2. Problem Statement

### Industry Challenge

Hotels face a disproportionate chargeback problem compared to other industries:

- **High dispute rates**: Hotels see chargeback rates 2-3x higher than retail, driven by booking-stay time gaps, no-show disputes, and "friendly fraud" where guests dispute legitimate charges after checkout.
- **Complex evidence requirements**: Defending a hotel chargeback requires assembling multiple evidence types (folios, registration cards, key card logs, signatures) across disparate systems that rarely communicate with each other.
- **Tight response windows**: Card networks impose strict deadlines (typically 20-45 days) for chargeback responses. Missing a deadline results in an automatic loss regardless of case merit.
- **Manual, labor-intensive process**: Most hotels handle chargebacks manually, requiring staff to log into multiple systems, locate records, compile evidence packages, and submit responses through processor-specific portals.
- **Low win rates**: Industry average chargeback win rates for hotels hover around 20-30%, largely because responses are incomplete, late, or fail to address the specific reason code.

### Business Impact

- Revenue loss from uncontested or poorly contested chargebacks
- Staff hours diverted from revenue-generating activities
- Increased processing fees and potential loss of merchant account status
- Lack of visibility into chargeback patterns that could inform preventive measures

---

## 3. Solution Overview

DisputeAI solves these problems through three core capabilities:

### Intelligent Analysis

Eight specialized AI agents evaluate every incoming chargeback, scoring fraud likelihood, identifying the optimal defense strategy, checking compliance with card network rules, and predicting the outcome probability. This ensures every case receives expert-level analysis within seconds.

### Automated Evidence Collection

DisputeAI connects directly to PMS platforms to pull guest folios, registration cards, payment receipts, digital signatures, and key card access logs automatically. Evidence is compiled into processor-compliant packages without manual intervention.

### Streamlined Dispute Management

A unified case management dashboard tracks every dispute from detection to resolution. Integrations with 29 dispute processors enable direct submission, webhook-based status updates, and real-time outcome tracking.

---

## 4. Target Users

### Primary Users

| Persona | Role | Key Needs |
|---------|------|-----------|
| **Revenue Manager** | Oversees hotel revenue streams | Minimize revenue leakage from chargebacks; visibility into dispute trends |
| **Finance/Accounting Team** | Manages hotel financial operations | Efficient dispute processing; accurate reporting; audit trails |
| **Independent Hotel Operator** | Owns/operates small to mid-size properties | Simple, low-effort chargeback defense; cost-effective solution |
| **Hospitality Management Company** | Manages multiple properties | Multi-property dashboard; centralized analytics; staff role management |

### User Roles within the Platform

- **Admin**: Full system access including user management, AI configuration, PMS settings, and security controls.
- **Manager**: Case management, analytics, evidence review, and property-level reporting.
- **Staff**: Case viewing, evidence attachment, and basic dispute operations.

---

## 5. Feature Requirements

### 5.1 AI-Powered Chargeback Analysis

**Description**: Eight specialized AI agents analyze each dispute case and provide actionable intelligence.

**AI Agents**:

| Agent | Purpose |
|-------|---------|
| Fraud Detector | Identifies fraud indicators and patterns in transaction data |
| Evidence Analyzer | Evaluates strength and completeness of available evidence |
| Response Drafter | Generates dispute response narratives tailored to reason codes |
| Outcome Predictor | Estimates win probability based on case attributes and historical data |
| Pattern Analyzer | Identifies recurring fraud patterns across properties and time periods |
| Risk Assessor | Evaluates financial and operational risk of each dispute |
| Compliance Checker | Validates responses against card network rules and deadlines |
| Recovery Optimizer | Recommends strategies to maximize recovery amounts |

**Acceptance Criteria**:
- Each agent produces a confidence score from 0-100% for its analysis.
- All eight agents run on every new case within 30 seconds of case creation.
- AI recommendations are viewable in the case detail view alongside supporting evidence.
- AI provider is pluggable, supporting OpenAI, Anthropic, and Ollama backends.
- System degrades gracefully when AI service is unavailable, allowing manual case management to continue.

---

### 5.2 Case Management Dashboard

**Description**: Central hub for viewing, filtering, and managing all chargeback cases.

**Acceptance Criteria**:
- Dashboard displays four real-time KPIs: total cases, win rate, recovered amount, and urgent cases count.
- Cases follow the status workflow: `PENDING` -> `IN_REVIEW` -> `SUBMITTED` -> `WON` | `LOST` | `EXPIRED`.
- Users can filter cases by status, date range, amount range, and property.
- Case detail view displays the full case history, all attached evidence, AI agent analysis, and a timeline of status changes.
- Status transitions are logged with timestamps and user attribution.
- Urgent cases (within 5 days of deadline) are visually highlighted.

---

### 5.3 Evidence Collection System

**Description**: Automated and manual evidence gathering for dispute defense.

**Supported Evidence Types**:

| Type | Description |
|------|-------------|
| Guest Folio | Itemized bill from PMS showing all charges |
| Registration Card | Signed guest registration document |
| Payment Receipt | Credit card transaction records |
| Guest Signature | Digital or scanned signature verification |
| ID Document Scan | Government-issued ID captured at check-in |
| Reservation Confirmation | Booking confirmation with terms and cancellation policy |
| Audit Trail | System-generated log of all guest-related events |

**Acceptance Criteria**:
- Evidence can be fetched automatically from a connected PMS with a single action.
- Manual evidence upload supports PDF, PNG, JPG, and TIFF formats.
- Each evidence item is associated with a specific case and timestamped.
- Digital signature verification confirms authenticity against registration records.
- Key card access logs are generated as evidence showing physical presence at the property.
- Evidence files are stored securely in AWS S3 with pre-signed URLs for access.
- Evidence packages can be compiled for submission to dispute processors.

---

### 5.4 PMS Integration

**Description**: Connectivity with Property Management Systems for real-time data access.

**Supported Platforms (30 adapters)**:
- AutoClerk PMS (built-in emulator for demo/development)
- Oracle Opera PMS
- Mews, Cloudbeds, Protel, RoomKey
- And 24 additional PMS platforms

**Acceptance Criteria**:
- Each PMS adapter implements a standard interface: `connect()`, `sync()`, `fetchReservation()`, `fetchFolio()`, `getStatus()`.
- Real-time reservation sync pulls new and updated reservations on a configurable schedule.
- Guest folio data is retrievable by reservation ID, guest name, or confirmation number.
- Check-in and checkout timestamps are extracted for timeline verification.
- Connection status is monitored and displayed in the PMS management interface.
- AutoClerk emulator provides realistic demo data without requiring an external PMS connection.
- PMS connection failures are logged and trigger notifications.

---

### 5.5 Dispute Processor Integration

**Description**: Direct integration with card network dispute systems and third-party chargeback services.

**Supported Processors (29 adapters)**:

| Category | Processors |
|----------|------------|
| Visa | VROL, RDR, CDRN |
| Mastercard | Mastercom |
| American Express | GFCC, Merlink |
| Acquirer | Chase Merchant Services |
| Alert Services | Ethoca, Verifi |
| Chargeback Management | Kount, Chargebacks911, Midigator |
| Fraud Prevention | Signifyd, Riskified |
| Payment Platform | Stripe Disputes |
| Additional | 6 more processors |

**Acceptance Criteria**:
- Each processor adapter supports: `submitDispute()`, `checkStatus()`, `receiveWebhook()`, `getRequirements()`.
- Webhook endpoints receive real-time status updates from processors.
- Dispute submissions conform to processor-specific format requirements.
- Submission receipts and confirmation codes are stored with the case record.
- Failed submissions are retried with exponential backoff via the job queue.

---

### 5.6 Reservation Management

**Description**: Comprehensive reservation search and data access for evidence gathering.

**Acceptance Criteria**:
- Search supports the following fields: guest name, email, confirmation number, room number, card last 4 digits, loyalty number, room type, and booking source.
- Search results display reservation summary with guest info, dates, and amount.
- Reservation detail view shows full guest profile, stay details, and associated charges.
- PMS connection status is visible on the reservations page.
- One-click evidence collection initiates an automated pull of all available evidence for a reservation.
- Reservations can be linked to chargeback cases.

---

### 5.7 Analytics and Reporting

**Description**: Data visualization and trend analysis for chargeback performance.

**Acceptance Criteria**:
- KPI dashboard displays: total cases, win rate percentage, total recovered amount.
- Status breakdown chart shows case distribution across all statuses.
- Monthly trend chart shows case volume, win rate, and recovery amount over time.
- Evidence collection statistics show automation rate and coverage by evidence type.
- Date range filtering applies to all analytics views.
- Data is exportable for external reporting.

---

### 5.8 Interactive Tutorial System

**Description**: Guided onboarding experience for new users.

**Acceptance Criteria**:
- Seven-step walkthrough covers: welcome, dashboard overview, case management, evidence collection, PMS integration, analytics, and settings.
- Welcome modal appears automatically for first-time users.
- Tutorial is accessible from any page via the help system.
- Users can skip or dismiss the tutorial at any point.
- Tutorial completion state is persisted per user.

---

### 5.9 ChatHelp AI Assistant

**Description**: In-app conversational support powered by AI.

**Acceptance Criteria**:
- Chat widget is accessible from all pages via a floating button.
- AI assistant understands DisputeAI-specific terminology and workflows.
- Context-aware responses consider the user's current page and active case.
- Chat history is maintained within the session.
- Fallback to human support contact when the AI cannot resolve a query.

---

### 5.10 OTA Integration

**Description**: Integration with Online Travel Agencies for booking data.

**Supported OTAs**: Booking.com, Expedia, Hotels.com, Airbnb, Vrbo, Agoda

**Acceptance Criteria**:
- Each OTA adapter syncs booking data including guest details, payment information, and cancellation policies.
- OTA-specific dispute handling accounts for platform-specific policies and evidence requirements.
- Booking source is tracked and available as a filter in case management and analytics.
- OTA connection status is monitored alongside PMS connections.

---

### 5.11 Settings and Configuration

**Description**: System configuration and administration interface.

**Configuration Tabs**:
1. General Settings
2. User Management
3. Notification Preferences
4. AI Agent Configuration
5. PMS Connection Settings
6. Dispute Processor Settings
7. Security Settings

**Acceptance Criteria**:
- Admin users can manage user accounts: create, edit, deactivate, and assign roles.
- Notification preferences are configurable per user (email, in-app, webhook).
- AI agent settings allow toggling individual agents, adjusting confidence thresholds, and selecting the AI provider.
- PMS connection settings support adding, editing, testing, and removing PMS connections.
- Security settings include password policy configuration, session timeout, and API key management.
- All configuration changes are audit-logged.

---

### 5.12 Role-Based Access Control

**Description**: Granular permission system for multi-user and multi-property operations.

**Acceptance Criteria**:
- Three roles are supported: Admin, Manager, and Staff, with descending privilege levels.
- Property-level access control restricts users to cases and data from their assigned property.
- Admin users can access all properties and manage system-wide settings.
- Authentication uses JWT tokens with configurable expiry (default: 15-minute access token).
- Refresh tokens support session persistence without re-authentication.
- Token blacklisting enables immediate session revocation.
- Failed login attempts are rate-limited.

---

## 6. Technical Architecture

### 6.1 System Overview

```
+-------------------+       +-------------------+       +-------------------+
|                   |       |                   |       |                   |
|  React Frontend   | <---> |  Express Backend   | <---> |  PostgreSQL DB    |
|  (Vite + Tailwind)|       |  (Node.js 20 LTS) |       |  (Prisma ORM)     |
|                   |       |                   |       |                   |
+-------------------+       +---------+---------+       +-------------------+
                                      |
                            +---------+---------+
                            |                   |
                            |  Redis + BullMQ   |
                            |  (Cache + Queues) |
                            |                   |
                            +---------+---------+
                                      |
                  +-------------------+-------------------+
                  |                   |                   |
           +------+------+    +------+------+    +------+------+
           |  AWS S3     |    |  AI Service |    |  External   |
           |  (Evidence  |    |  (OpenAI /  |    |  APIs (PMS, |
           |   Storage)  |    |  Anthropic) |    |  Processors)|
           +-------------+    +-------------+    +-------------+
```

### 6.2 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend Framework** | React | 18.x |
| **Build Tool** | Vite | 5.x |
| **CSS Framework** | Tailwind CSS | 3.4.x |
| **Routing** | React Router | 6.x |
| **Charts** | Recharts | Latest |
| **Backend Runtime** | Node.js | 20 LTS |
| **Backend Framework** | Express | 4.18.x |
| **ORM** | Prisma | 5.22.x |
| **Database** | PostgreSQL | 15+ |
| **Cache/Queue** | Redis + BullMQ | 5.x |
| **Object Storage** | AWS S3 | SDK v3 |
| **Authentication** | JWT (jsonwebtoken) | 9.x |
| **Password Hashing** | bcryptjs | 2.4.x |
| **Logging** | Winston | 3.x |
| **HTTP Security** | Helmet | 8.x |
| **Rate Limiting** | express-rate-limit | 7.x |
| **File Upload** | Multer | 1.4.x |

### 6.3 Deployment Architecture

- **Backend**: Docker container using `node:20-alpine` base image
- **Frontend**: Docker container using `nginx:alpine` serving the built static assets
- **Database**: Managed PostgreSQL service (e.g., AWS RDS, Supabase)
- **Cache**: Managed Redis service (e.g., AWS ElastiCache, Upstash)
- **Storage**: AWS S3 bucket with IAM-based access control
- **Orchestration**: Docker Compose for development; Kubernetes-ready for production

### 6.4 Demo Mode

DisputeAI supports a fully functional demo mode that operates without external dependencies (no database, no Redis, no S3). The server detects unavailable services at startup and gracefully degrades to in-memory mock data. This enables:

- Sales demonstrations without infrastructure setup
- Local development without running databases
- CI/CD pipeline testing

---

## 7. API Specification

### 7.1 Base URL

```
Production: https://api.disputeai.com/api
Development: http://localhost:8000/api
```

### 7.2 Authentication

All endpoints except `/api/auth/login` and `/api/auth/register` require a valid JWT in the `Authorization: Bearer <token>` header.

### 7.3 Route Groups

| Route Group | Base Path | Description | Auth Required |
|-------------|-----------|-------------|---------------|
| **Auth** | `/api/auth` | User authentication and session management | Partial |
| **Cases** | `/api/cases` | Chargeback case CRUD operations | Yes |
| **Evidence** | `/api/evidence` | Evidence upload, retrieval, and management | Yes |
| **Analytics** | `/api/analytics` | Dashboard KPIs, trends, and reports | Yes |
| **Webhooks** | `/api/webhooks` | Inbound webhooks from dispute processors | Signature-based |
| **Admin** | `/api/admin` | User management and system administration | Yes (Admin) |
| **PMS** | `/api/pms` | PMS adapter management and sync operations | Yes |
| **Notifications** | `/api/notifications` | User notification preferences and history | Yes |
| **Disputes** | `/api/disputes` | Dispute processor configuration and status | Yes |
| **Reservations** | `/api/reservations` | Reservation search and evidence collection | Yes |
| **Sync** | `/api/sync` | Manual and scheduled data synchronization | Yes (Admin) |

### 7.4 Key Endpoints

#### Authentication
- `POST /api/auth/login` -- Authenticate user, returns access + refresh tokens
- `POST /api/auth/register` -- Create new user account (Admin only in production)
- `POST /api/auth/refresh` -- Exchange refresh token for new access token
- `POST /api/auth/logout` -- Invalidate current session

#### Cases
- `GET /api/cases` -- List cases with filtering and pagination
- `GET /api/cases/:id` -- Get case detail with evidence and AI analysis
- `POST /api/cases` -- Create a new chargeback case
- `PUT /api/cases/:id` -- Update case status or details
- `POST /api/cases/:id/analyze` -- Trigger AI analysis on a case

#### Evidence
- `GET /api/evidence/:caseId` -- List evidence for a case
- `POST /api/evidence/:caseId` -- Upload evidence to a case
- `DELETE /api/evidence/:id` -- Remove an evidence item
- `POST /api/evidence/:caseId/fetch` -- Auto-fetch evidence from PMS

#### Analytics
- `GET /api/analytics/dashboard` -- KPI summary
- `GET /api/analytics/trends` -- Monthly trend data
- `GET /api/analytics/status-breakdown` -- Case status distribution

#### Reservations
- `GET /api/reservations/search` -- Search reservations across connected PMS
- `GET /api/reservations/:id` -- Get reservation detail
- `POST /api/reservations/:id/evidence` -- Collect evidence from reservation

### 7.5 Standard Response Format

```json
{
  "success": true,
  "data": { },
  "message": "Operation completed successfully",
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150
  }
}
```

### 7.6 Error Response Format

```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "Invalid input parameters",
  "details": [
    { "field": "email", "message": "Valid email is required" }
  ]
}
```

---

## 8. Security Requirements

### 8.1 Authentication and Authorization

| Requirement | Implementation |
|-------------|---------------|
| Password storage | bcrypt hashing with configurable salt rounds (default: 12) |
| Session tokens | JWT with short-lived access tokens (15 min) and refresh tokens |
| Token revocation | Redis-backed token blacklist for immediate session invalidation |
| Rate limiting | Login endpoint limited to prevent brute-force attacks |
| Role enforcement | Middleware-based role checks on all protected endpoints |

### 8.2 Data Protection

| Requirement | Implementation |
|-------------|---------------|
| Encryption in transit | TLS 1.2+ required for all connections |
| Encryption at rest | Database and S3 encryption enabled |
| PII handling | Guest personal data encrypted, access logged |
| Evidence security | S3 objects accessed via time-limited pre-signed URLs |
| Input validation | Request validation on all endpoints using schema validators |

### 8.3 Infrastructure Security

| Requirement | Implementation |
|-------------|---------------|
| HTTP headers | Helmet middleware applies security headers (HSTS, X-Frame-Options, CSP) |
| CORS | Configured to allow only known frontend origins |
| Request logging | All API requests logged with Winston (sanitized for PII) |
| Dependency security | Regular `npm audit` and dependency updates |
| Container security | Minimal Alpine-based images, non-root process execution |

### 8.4 Compliance Readiness

- **PCI-DSS**: Credit card data is never stored; only card last-4 is retained for matching purposes. All payment processing is handled by integrated processors.
- **GDPR**: Data access, export, and deletion capabilities are architected into the data layer. Consent tracking and data retention policies are configurable.
- **SOC 2**: Audit logging, access controls, and encryption practices align with SOC 2 Type II requirements.

---

## 9. Performance Requirements

| Metric | Requirement |
|--------|-------------|
| API response time (p95) | < 200ms for standard CRUD operations |
| AI analysis completion | < 30 seconds for full 8-agent analysis |
| Dashboard load time | < 2 seconds initial load |
| Concurrent users | Support 1,000+ simultaneous authenticated users |
| Database query time | < 50ms for indexed queries |
| Evidence upload | Support files up to 25MB per upload |
| Job queue throughput | Process 100+ dispute jobs per minute |
| System uptime | 99.9% availability (< 8.76 hours downtime/year) |
| Frontend bundle size | < 500KB gzipped for initial load |
| WebSocket latency | < 100ms for real-time notifications |

### Scaling Strategy

- **Horizontal scaling**: Stateless backend containers behind a load balancer.
- **Database scaling**: Read replicas for analytics queries; connection pooling via Prisma.
- **Queue scaling**: BullMQ workers scale independently from API servers.
- **Cache strategy**: Redis caching for frequently accessed data (dashboard KPIs, user sessions).
- **CDN**: Static frontend assets served via CDN for global performance.

---

## 10. Success Metrics

### Primary KPIs

| Metric | Target | Measurement |
|--------|--------|-------------|
| Chargeback win rate | > 75% | Percentage of submitted disputes resolved in favor of the hotel |
| Average response time | < 24 hours | Time from case creation to dispute submission |
| Evidence automation rate | > 90% | Percentage of evidence collected without manual intervention |
| System uptime | > 99.9% | Measured via infrastructure monitoring |

### Secondary KPIs

| Metric | Target | Measurement |
|--------|--------|-------------|
| User adoption | > 80% daily active rate | Active users / total users |
| Case throughput | 500+ cases/month per property | Total cases processed |
| AI accuracy | > 85% outcome prediction accuracy | Predicted vs. actual outcomes |
| Revenue recovered | 3x platform cost | Total recovered amount vs. subscription fees |
| Time to resolution | < 7 days average | Case creation to final outcome |
| User satisfaction | > 4.5/5 | In-app feedback and NPS surveys |

---

## 11. Roadmap

### Phase 1: MVP (Current)

**Status**: Active Development

| Deliverable | Status |
|-------------|--------|
| Core case management dashboard | Complete |
| 8 AI agent framework | Complete |
| AutoClerk PMS integration with emulator | Complete |
| 30 PMS adapter interfaces | Complete |
| 29 dispute processor adapter interfaces | Complete |
| Evidence collection system (7 types) | Complete |
| Reservation search and management | Complete |
| Analytics dashboard with charts | Complete |
| Interactive tutorial system | Complete |
| ChatHelp AI assistant | Complete |
| OTA integration (6 providers) | Complete |
| Settings and configuration (7 tabs) | Complete |
| Role-based access control | Complete |
| Demo mode (no external dependencies) | Complete |
| Docker deployment configuration | Complete |

### Phase 2: Production Readiness

**Timeline**: Q2-Q3 2026

| Deliverable | Description |
|-------------|-------------|
| Production database deployment | Migrate from demo mode to managed PostgreSQL |
| Live PMS connections | Activate real-time connections to Opera, Mews, Cloudbeds |
| Real-time webhook processing | Process inbound processor webhooks with status updates |
| Email notification system | Transactional emails for case updates and deadlines |
| Data migration tooling | Import historical chargeback data from spreadsheets and legacy systems |
| Automated testing suite | Unit, integration, and E2E test coverage > 80% |

### Phase 3: Growth

**Timeline**: Q4 2026 - Q1 2027

| Deliverable | Description |
|-------------|-------------|
| Advanced analytics and ML | Machine learning models trained on historical outcomes |
| Multi-property dashboard | Aggregate view for hotel chains and management companies |
| White-label support | Customizable branding for reseller partners |
| Mobile application | iOS and Android apps for on-the-go case management |
| Bulk operations | Mass case update, bulk evidence collection, batch submissions |
| Custom report builder | User-defined reports with scheduling and export |

### Phase 4: Enterprise

**Timeline**: Q2-Q4 2027

| Deliverable | Description |
|-------------|-------------|
| Enterprise SSO | SAML 2.0 and OIDC integration for corporate identity providers |
| Custom AI model training | Property-specific models trained on historical dispute data |
| Automated dispute filing | Zero-touch dispute submission for high-confidence cases |
| Revenue forecasting | Predictive analytics for expected chargeback volumes and recovery |
| API marketplace | Public API for third-party integrations |
| Compliance reporting | Automated PCI-DSS and GDPR compliance reports |

---

## 12. Appendix

### A. Glossary

| Term | Definition |
|------|------------|
| **Chargeback** | A reversal of a credit card transaction initiated by the cardholder's bank |
| **Friendly fraud** | A chargeback filed by a guest who actually received the services charged |
| **Reason code** | A code assigned by the card network indicating why the chargeback was filed |
| **Representment** | The process of contesting a chargeback by submitting evidence to the issuing bank |
| **PMS** | Property Management System; the core software hotels use to manage reservations and guest accounts |
| **OTA** | Online Travel Agency; platforms like Booking.com and Expedia that facilitate hotel bookings |
| **Folio** | An itemized statement of all charges and payments on a guest's hotel account |
| **RDR** | Rapid Dispute Resolution; Visa's automated dispute resolution program |
| **CDRN** | Chargeback Dispute Resolution Network; Visa's alert network |
| **Mastercom** | Mastercard's dispute management platform |
| **GFCC** | Global Fraud and Chargeback Center; American Express dispute system |
| **BullMQ** | A Node.js job queue library built on Redis |

### B. Demo Mode Credentials

| Field | Value |
|-------|-------|
| Email | `admin@disputeai.com` |
| Password | `DisputeAdmin123!` |
| Role | Admin |

### C. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 8000) |
| `NODE_ENV` | No | Environment: development, production |
| `JWT_SECRET` | Yes | Secret key for JWT signing |
| `JWT_ACCESS_EXPIRY` | No | Access token lifetime (default: 15m) |
| `DATABASE_URL` | No* | PostgreSQL connection string |
| `REDIS_URL` | No* | Redis connection string |
| `AWS_ACCESS_KEY_ID` | No* | AWS credentials for S3 |
| `AWS_SECRET_ACCESS_KEY` | No* | AWS credentials for S3 |
| `S3_BUCKET` | No* | S3 bucket name for evidence storage |
| `OPENAI_API_KEY` | No* | OpenAI API key for AI agents |
| `ANTHROPIC_API_KEY` | No* | Anthropic API key (alternative AI provider) |

*Not required in demo mode; required for production deployment.

### D. Port Configuration

| Service | Port |
|---------|------|
| Backend API | 8000 |
| Frontend Dev Server | 3000 |
| PostgreSQL | 5432 |
| Redis | 6379 |

---

*This document is maintained by the DisputeAI product team and updated with each major release. For questions or clarifications, contact the document owner.*
