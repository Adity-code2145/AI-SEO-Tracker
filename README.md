# AI SEO Tracker

AI SEO Tracker is a full-stack web application for technical website SEO audits and Google keyword ranking workflows. It combines a React 19 and TypeScript client with an Express 5 API, MongoDB persistence, JWT authentication, and automated Google rank tracking.

> **Project status:** Production-ready MVP. Registration, login, authenticated user lookup, URL submission with SSRF protection, full HTML SEO audits, persisted reports, history management, and Google keyword rank checks are all wired to the MongoDB-backed API.

## Contents

- [Features](#features)
- [Technology stack](#technology-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Available scripts](#available-scripts)
- [API Reference](#api-reference)
  - [Authentication API](#authentication-api)
  - [Analysis API](#analysis-api)
  - [Rank Tracking API](#rank-tracking-api)
- [Security notes](#security-notes)
- [Known limitations](#known-limitations)
- [License](#license)

## Features

- **Real SEO Analysis Workflow:**
  - Submit any website URL from the dashboard or analysis page.
  - Robust SSRF protection (private IP blocking, protocol restrictions, redirect re-validation, size limits, and timeouts).
  - Comprehensive technical checks: metadata, canonical, robots, Open Graph, Twitter cards, viewport, heading hierarchy (`h1`–`h6`), link distribution (internal/external), image alt text coverage, body word count, and top keywords with keyword density.
  - Transparent, explainable category scores for SEO, Performance (server response & page weight), Accessibility, and Best Practices.
  - Prioritized, actionable recommendations sorted by severity (`critical`, `warning`, `info`).
  - Real-time progress experience with asynchronous backend execution and live status polling (`processing`, `completed`, `failed`).
- **Dashboard & History Management:**
  - Authenticated user dashboard with real total scans, average score, daily scan quotas, and recent audits.
  - Searchable, filterable, and sortable audit history with pagination and deletion confirmation.
- **Google Keyword Rank Tracking:**
  - Headless browser automation via Browserbase and Playwright scanning up to 5 Google search pages (top 50 organic results).
  - Stored ranking history over time, position changes, and top 10 competitors.
  - Transparent error reporting when upstream services block requests or require credentials.
- **Authentication & User Scoping:**
  - User registration and login with bcrypt password hashing and JSON Web Tokens.
  - Strict ownership access control: users can only view, manage, and delete their own audits and keyword tracking records.
  - Protected client routes for dashboard, analysis, reports, history, and rank tracking.
- **Responsive Modern UI:**
  - Built with React 19, TypeScript, Tailwind CSS 4, Lucide icons, and Vite.

## Technology stack

| Area | Technologies |
| --- | --- |
| Client | React 19, TypeScript, React Router 7, Axios, Tailwind CSS 4, Vite 8 |
| Server | Node.js (ESM), Express 5 |
| Database | MongoDB with Mongoose 9 |
| Authentication | bcrypt password hashing and JSON Web Tokens (JWT) |
| Scraping & Headless Automation | Playwright Core, Browserbase SDK (`@browserbasehq/sdk`) |
| Testing | Node.js native test runner (`node --test`) |

## Project structure

```text
AI-SEO-Tracker/
├── client/
│   ├── public/
│   └── src/
│       ├── components/      # UI components (AnalysesCard, IssueCard, Navbar, etc.)
│       ├── context/         # AppContext (auth, API instance, quota) & ThemeContext
│       ├── pages/           # Dashboard, Analyze, Report, History, RankTracker, Login
│       └── assets/          # Icons and static resources
└── server/
    ├── config/              # MongoDB connection
    ├── controllers/         # Auth, Analysis, and Rank controllers
    ├── middleware/          # JWT authentication middleware
    ├── models/              # User, Analysis, and KeywordTracking Mongoose models
    ├── routes/              # Express route declarations
    ├── services/            # SSRF guard, HTML analyzer, audit orchestrator, rank tracker
    └── tests/               # Focused unit tests (SSRF, HTML analyzer, ownership, rank)
```

## Getting started

### Prerequisites

- Node.js **20.19+** or **22.12+** and npm.
- A local or hosted MongoDB instance (e.g., MongoDB Atlas or local `mongod`).

### 1. Clone the repository

```bash
git clone https://github.com/Adity-code2145/AI-SEO-Tracker.git
cd AI-SEO-Tracker
```

### 2. Install dependencies

```bash
cd client
npm install
cd ../server
npm install
cd ..
```

### 3. Configure environment variables

Create `server/.env` with your configuration:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/ai-seo-tracker
JWT_SECRET=replace-with-a-long-random-secret
PORT=5000
CLIENT_URL=http://localhost:5173
BROWSERBASE_API_KEY=your-browserbase-api-key
GOOGLE_SEARCH_COUNTRY=in
GOOGLE_SEARCH_LANGUAGE=en
```

Create `client/.env` if connecting to a non-default API URL:

```dotenv
VITE_BACKEND_URL=http://localhost:5000
```

> **Note:** Client variables prefixed with `VITE_` are bundled directly into frontend JavaScript and are public. Never put private secrets (such as `JWT_SECRET` or `BROWSERBASE_API_KEY`) into `client/.env`.

### 4. Run tests and verify build

```bash
# Server tests
cd server
npm test

# Client type-check, lint, and build
cd ../client
npm run lint
npm run build
```

### 5. Start the application

Run each process in a separate terminal:

**Terminal 1 — API server:**

```bash
cd server
npm run server
```

The server starts on `http://localhost:5000` by default.

**Terminal 2 — Client:**

```bash
cd client
npm run dev
```

Open `http://localhost:5173` in your browser.

## Available scripts

### Client (`client/`)

| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite development server. |
| `npm run build` | Type-check with TypeScript and build production bundle. |
| `npm run preview` | Preview production build locally. |
| `npm run lint` | Run ESLint across client code. |

### Server (`server/`)

| Command | Description |
| --- | --- |
| `npm start` | Start Express server with Node.js. |
| `npm run server` | Start Express server with Nodemon (auto-reloading). |
| `npm test` | Run all unit tests with Node native test runner (`node --test`). |

## API Reference

All protected endpoints require an `Authorization: Bearer <token>` header.

### Authentication API (`/api/auth`)

| Method | Endpoint | Description | Auth Required |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | Create an account with name, email, and password. Returns token and user. | No |
| `POST` | `/api/auth/login` | Log in with email and password. Returns token and user. | No |
| `GET` | `/api/auth/user` | Fetch current authenticated user's profile and quota stats. | Yes |

### Analysis API (`/api/analysis`)

| Method | Endpoint | Description | Auth Required |
| --- | --- | --- | --- |
| `POST` | `/api/analysis` | Submit `{ url }` for technical audit. Runs SSRF checks, tracks daily quota, and begins scan. | Yes |
| `GET` | `/api/analysis` | List user's audits with pagination (`?page=1&limit=15`), status filter, search, and sort. | Yes |
| `GET` | `/api/analysis/:id` | Get full technical audit results, metadata, scores, and recommendations. | Yes |
| `DELETE` | `/api/analysis/:id` | Delete an audit record owned by the authenticated user. | Yes |

### Rank Tracking API (`/api/rank`)

| Method | Endpoint | Description | Auth Required |
| --- | --- | --- | --- |
| `POST` | `/api/rank/add` | Add keyword and domain to track (`{ keyword, url }`). | Yes |
| `GET` | `/api/rank/list` | List all tracked keywords for the user. | Yes |
| `GET` | `/api/rank/:id` | Get tracking details, rank history, and competitor positions. | Yes |
| `POST` | `/api/rank/:id/refresh` | Trigger a fresh Google search rank check for a keyword. | Yes |
| `POST` | `/api/rank/:id/toggle` | Toggle keyword active tracking status. | Yes |
| `DELETE` | `/api/rank/:id` | Delete keyword tracking entry. | Yes |

## Security notes

- **SSRF Defense:** The URL fetcher resolves DNS hostnames and verifies all resolved IP addresses against private, reserved, loopback, link-local, multicast, and carrier-grade NAT blocks using `ipaddr.js`. Redirects are followed manually and re-checked at every hop.
- **Resource Limits:** Requests enforce 15-second timeouts, a maximum response payload size of 5 MB, and content-type validation to prevent memory exhaustion.
- **CORS Configuration:** Origin access is restricted to configured `CLIENT_URL` values (defaulting to local Vite dev server in development).
- **Strict Data Scoping:** Every audit and keyword tracking record is verified against the authenticated user ID (`req.userId`), preventing unauthorized cross-user access or manipulation.

## Known limitations

1. **Performance Metrics Disclosure:** The website audit analyzes server response time and HTML document payload size via direct HTTP fetch. It does not execute in-browser JavaScript or measure Core Web Vitals (LCP, FID, CLS), which require a full headless browser session.
2. **Google Automated Searches:** Keyword rank tracking relies on live Google search scraping through Browserbase. Google may block or challenge automated requests during high volume or rapid refreshes. If blocked, the application displays an honest error without corrupting previous historical positions.
3. **Outgoing Link Spidering:** The quick single-page audit categorizes links as internal or external based on hostname resolution, but does not crawl third-party outbound URLs to verify live HTTP 200 responses.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
