# AccuDefend - Complete Application Overview

**Version:** 3.0
**Last Updated:** February 2026
**Platform:** AccuDefend (formerly Chargeback Defense OMNI)

---

## Application Views

### 1. Complete Dashboard

- Welcome banner with key metrics
- 4 stat cards: Total Cases, Pending, Win Rate, Recovered
- Quick action buttons
- Recent cases overview
- Urgent cases section (due within 7 days)
- Real-time charts and trend visualization (Recharts)

### 2. Full Cases View

- Search functionality (by ID, guest name, confirmation number)
- Status filter dropdown (Pending, In Review, Submitted, Won, Lost, Expired, Cancelled)
- Detailed case cards with:
  - Guest info, reservation details
  - AI confidence scoring with visual progress bar
  - Evidence checklist with completion tracking
  - Auto-submit buttons for eligible cases
  - Status-specific action buttons

### 3. Analytics View

- Case status distribution with progress bars
- Performance metrics: Win Rate, Avg Confidence, Total Recovered
- 4 payment processor webhook endpoints (Stripe, Adyen, Shift4, Elavon)
- Win rate by reason code analysis
- Property comparison (multi-property)
- Historical trends with date range filtering

### 4. Case Detail View

- Full case information grid
- Evidence package viewer with upload/download
- AI confidence score with weighted breakdown:
  - Reason Code Base (40%)
  - Evidence Completeness (35%)
  - Fraud Indicators (25%)
- Recommendation display (AUTO_SUBMIT / REVIEW_RECOMMENDED / GATHER_MORE_EVIDENCE / UNLIKELY_TO_WIN)
- Timeline of case events
- Case notes (internal/external)
- Action buttons: Submit, Generate PDF, Download
- **Outcome tab** for resolved cases (WON/LOST) with detailed resolution data
- **Resolution banners:** green banner for WON cases, red banner for LOST cases
- **Win details:** win factors, recovered amount, processor statement
- **Loss details:** denial reason, denial code, evidence gaps analysis
- **Arbitration filing** via 3-step modal workflow for LOST cases
- Auto-navigation to Outcome tab when viewing resolved cases

### 5. Settings Page

- AI Defense Configuration (confidence thresholds)
- Email notification preferences
- Storage health monitoring
- Provider management
- User account settings

### 6. PMS Integration Page (NEW)

- Connect/disconnect 30 PMS systems across 4 categories
- Connection status monitoring
- Sync triggers and history
- Supported systems by category:
  - **Enterprise (15):** Oracle Opera Cloud, Mews, Cloudbeds, AutoClerk, Agilysys, Infor, Stayntouch, RoomKey, Maestro, Hotelogix, RMS Cloud, Protel, eZee, SIHOT, innRoad
  - **Boutique/Independent (6)**
  - **Vacation Rental (4)**
  - **Brand-Specific (5)**

### 7. Dispute Integration Page (NEW)

- Dispute company management
- 21 dispute adapters across 4 categories with full two-way sync:
  - **Prevention Networks (3)**
  - **Card Network Portals (4)**
  - **Merchant Processor Portals (9)**
  - **Third-Party Services (5)**
- All 21 adapters with full two-way sync
- Company CRUD operations
- Sync status and history

### 8. Reservations Page (NEW)

- **ReservationViewer component** for browsing PMS-synced reservations with demo mode fallback
- Stats bar showing: Total Synced, Linked to Chargebacks, Flagged Guests, Last Sync
- Search and filter by guest name, confirmation number, status, date range
- Inline expandable reservation detail with guest folio viewer (line items, charges, payments)
- Linked chargeback cases displayed per reservation
- Manual chargeback linking via `POST /api/reservations/:id/link-chargeback`
- Real-time PMS search via `/api/reservations/search/live`
- API endpoints with demo data fallback when database is unavailable

### 9. Tutorial Page (NEW)

- Dedicated tutorial walkthrough
- 8-step guided onboarding:
  1. Welcome - Introduction to AccuDefend
  2. Dashboard Overview - Understanding metrics and KPIs
  3. Managing Cases - Navigating and filtering
  4. Uploading Evidence - Adding documentation
  5. AI Analysis - Understanding confidence scores
  6. PMS Integration - Connecting to PMS systems
  7. Configuration - Admin settings and thresholds
  8. Completion - Ready to use

### 10. Notification Panel (NEW)

- Dropdown notification panel in header
- Real-time alerts for new chargebacks, status changes
- Mark as read/unread
- Mark all as read
- Quick navigation to related cases

### 11. Mobile Responsive

- Hamburger menu for mobile navigation
- Responsive grid layouts (Tailwind CSS breakpoints)
- Touch-friendly buttons and interactions
- Optimized for all screen sizes

### 12. Dispute Outcome & Arbitration

- **Outcome tracking** for resolved cases with WON/LOST resolution data
- **WON cases display:** win factors contributing to the successful outcome, recovered amount, processor statement confirming reversal
- **LOST cases display:** denial reason from the processor/issuer, denial code, evidence gaps that weakened the case
- **Resolution banners:** color-coded banners (green for WON, red for LOST) displayed prominently in Case Detail view
- **Arbitration workflow** for LOST cases with a 3-step filing modal:
  1. **Review** - Review case details and denial reasons
  2. **Evidence & Narrative** - Upload additional evidence (ARBITRATION_DOCUMENT type) and compose arbitration narrative
  3. **Confirm** - Review and submit arbitration filing
- **API endpoint:** `POST /api/cases/:id/arbitration` for submitting arbitration requests
- **Frontend components:**
  - OutcomeTab (~250 lines) - Displays resolution details, win/loss factors, and arbitration options
  - ArbitrationModal (~250 lines) - 3-step modal wizard for filing arbitration
- **Auto-navigation:** Resolved cases automatically navigate to the Outcome tab on load

### 13. Interactive Features

- Search cases by ID, guest name, or confirmation number
- Filter by status, processor, date range
- Auto-submit functionality for high-confidence cases
- View case details with full evidence package
- Notification badge with active count
- Keyboard shortcut (`?`) for help panel
- Smooth transitions and hover effects

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 |
| Build Tool | Vite 5 |
| Styling | Tailwind CSS 3 |
| Routing | React Router 6 |
| HTTP Client | Axios |
| Icons | Lucide React |
| Charts | Recharts |

## Frontend Architecture

```
frontend/src/
├── App.jsx                    # Main application component
├── main.jsx                   # Entry point
├── index.css                  # Global styles
├── components/
│   ├── Layout.jsx             # Main layout with sidebar & navigation
│   ├── Tutorial.jsx           # Tutorial, HelpButton, HelpPanel
│   ├── NotificationPanel.jsx  # Notification dropdown panel
│   ├── OutcomeTab.jsx         # Dispute outcome display (WON/LOST resolution data)
│   ├── ArbitrationModal.jsx   # 3-step arbitration filing modal
│   ├── ReservationViewer.jsx  # Reservation details viewer
│   └── GuestFolioViewer.jsx   # Guest folio details viewer
├── pages/
│   ├── Login.jsx              # Authentication
│   ├── Dashboard.jsx          # Main dashboard with metrics
│   ├── Cases.jsx              # Case list & management
│   ├── CaseDetail.jsx         # Individual case details
│   ├── Analytics.jsx          # Reports & analytics
│   ├── Settings.jsx           # System configuration
│   ├── PMSIntegration.jsx     # PMS system connections
│   ├── DisputeIntegration.jsx # Dispute company integrations
│   └── Tutorial.jsx           # Dedicated tutorial page
├── hooks/
│   └── useAuth.jsx            # Authentication context & state
└── utils/
    ├── api.js                 # API client & formatting utilities
    └── helpers.js             # Helper functions
```

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | January 2026 | Initial application overview |
| 2.0 | February 2026 | Updated to include: PMS Integration page, Dispute Integration page, Tutorial page, NotificationPanel component, helpers.js utility, 12+ PMS systems, Merlink sync, current tech stack |
| 3.0 | February 2026 | Updated PMS to 30 systems, dispute adapters to 21, standardized names, 7 frontend components, Node.js v25 compatibility |

---

*© 2026 AccuDefend. All rights reserved.*
