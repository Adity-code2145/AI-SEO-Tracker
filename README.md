# AI SEO Tracker

AI SEO Tracker is a full-stack web application for exploring website SEO audits and keyword ranking workflows. It combines a React and TypeScript client with an Express API and MongoDB-backed user authentication.

> **Project status:** Registration, login, authenticated user lookup, and Google keyword rank checks are connected to the MongoDB-backed API. The analysis, report, history, and dashboard screens still use sample data and simulated analysis flows.

## Contents

- [Features](#features)
- [Technology stack](#technology-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Available scripts](#available-scripts)
- [Authentication API](#authentication-api)
- [Security notes](#security-notes)
- [License](#license)

## Features

- Website analysis flow with a simulated progress experience and sample SEO report.
- Dashboard and analysis history views populated with example data.
- Google keyword rank tracking with stored position history, competitors, filters, and sorting. Checks cover up to the first 50 organic results and use the configured Google country/language; rankings can vary by location and personalization.
- User registration and login with password hashing and JSON Web Token authentication.
- Protected client routes for the dashboard, analysis, reports, history, and rank tracker.
- Responsive interface built with React, TypeScript, Tailwind CSS, and Vite.

## Technology stack

| Area | Technologies |
| --- | --- |
| Client | React 19, TypeScript, React Router, Axios |
| Styling and build | Tailwind CSS 4, Vite |
| Server | Node.js, Express 5 |
| Database | MongoDB with Mongoose |
| Authentication | bcrypt password hashing and JSON Web Tokens |

## Project structure

```text
AI-SEO-Tracker/
├── client/
│   ├── public/
│   └── src/
│       ├── components/
│       ├── context/
│       ├── pages/
│       └── assets/
└── server/
    ├── config/          # MongoDB connection
    ├── controllers/     # Authentication and rank-tracking handlers
    ├── middleware/      # JWT authentication
    ├── models/          # Mongoose models
    ├── routes/          # Express routes
    ├── services/        # Google rank lookup and persistence
    └── tests/           # Rank utility tests
```

## Getting started

### Prerequisites

- Node.js **20.19+** or **22.12+** and npm (required by the client toolchain).
- A MongoDB database, local or hosted, for the server's authentication features.

### 1. Clone the repository

```bash
git clone https://github.com/Adity-code2145/AI-SEO-Tracker.git
cd AI-SEO-Tracker
```

### 2. Install dependencies

Install the client and server dependencies in their respective directories:

```bash
cd client
npm install
cd ../server
npm install
cd ..
```

### 3. Configure environment variables

Create `server/.env` with the MongoDB connection string and a strong, private JWT secret:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/ai-seo-tracker
JWT_SECRET=replace-with-a-long-random-secret
BROWSERBASE_API_KEY=your-browserbase-api-key
PORT=5000
GOOGLE_SEARCH_COUNTRY=in
GOOGLE_SEARCH_LANGUAGE=en
```

For a hosted MongoDB database, use its connection string for `MONGODB_URI`. The `PORT` variable is optional; the server defaults to port `5000`.
`BROWSERBASE_API_KEY` is required to run keyword checks. `GOOGLE_SEARCH_COUNTRY` and `GOOGLE_SEARCH_LANGUAGE` are optional and default to `in` and `en`.

The client defaults to `http://localhost:5000` for its API. To use another API URL, create `client/.env`:

```dotenv
VITE_BACKEND_URL=http://localhost:5000
```

Do not commit `.env` files or put private credentials in client-side variables. Variables prefixed with `VITE_` are included in the browser build and are not secret.

### 4. Start the application

Run each process in a separate terminal from the project root.

**Terminal 1 — API server:**

```bash
cd server
npm run server
```

The server starts on `http://localhost:5000` by default. Its root endpoint (`GET /`) returns a basic server status message.

**Terminal 2 — client:**

```bash
cd client
npm run dev
```

Open the local URL printed by Vite in your browser (typically `http://localhost:5173`).

## Available scripts

### Client (`client/`)

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Type-check and build the client for production. |
| `npm run preview` | Preview the production build locally. |
| `npm run lint` | Run ESLint on the client source. |

### Server (`server/`)

| Command | Description |
| --- | --- |
| `npm start` | Start the Express server with Node.js. |
| `npm run server` | Start the server with Nodemon for development. |

## Authentication API

The server exposes the following endpoints under `/api/auth`:

| Method | Endpoint | Description | Authentication |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | Create an account and return a token and user. | No |
| `POST` | `/api/auth/login` | Authenticate an account and return a token and user. | No |
| `GET` | `/api/auth/user` | Return the current authenticated user. | Bearer token |

For the authenticated endpoint, send the token in the request header:

```http
Authorization: Bearer <token>
```

## Security notes

- Keep `server/.env` private. Rotate any credential that has been exposed.
- Use a long, randomly generated `JWT_SECRET` outside local development.
- Configure appropriate CORS origins and HTTPS before deploying publicly.
- The root `.gitignore` excludes environment files, dependencies, and build output.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
