# Community Project

A full-stack community platform built with **Express**, **Angular 19**, and **PostgreSQL**. It supports communities, posts (with an admin approval/moderation workflow), comments, likes, businesses, events, jobs, notifications, and real-time WebSocket features.

---

## Tech Stack

| Layer     | Technology                                      |
|-----------|-------------------------------------------------|
| Frontend  | Angular 19, Angular Material 19, Bootstrap 5.3  |
| Backend   | Express 5, TypeScript 5.7                       |
| Database  | PostgreSQL 14+                                  |
| DB access | Knex 3 query builder over the `pg` driver (no ORM) |
| Auth      | JWT (access + refresh tokens) via `jsonwebtoken`|
| Real-time | Socket.IO 4                                     |
| Maps      | Google Maps API (@angular/google-maps)          |

---

## Prerequisites

Make sure the following are installed before starting:

- **Node.js** v18 or higher — https://nodejs.org
- **npm** v9 or higher (comes with Node.js)
- **PostgreSQL** v14 or higher — https://www.postgresql.org/download
- **Angular CLI** (optional, for `ng` commands)
  ```bash
  npm install -g @angular/cli
  ```

---

## 1. Clone the Repository

```bash
git clone <your-repo-url>
cd Community_Project
```

---

## 2. Configure the Backend Environment

The backend reads configuration from `backend/.env`. Copy the example and fill in your local values:

```bash
cd backend
cp .env.example .env
```

Environment variables are validated at startup with Zod (see `src/config/env.ts`) — the server
exits immediately if a required value is missing or malformed.

```env
# ── Application ───────────────────────────────────────────────────────
PORT=3000
NODE_ENV=development

# ── Database (PostgreSQL) ─────────────────────────────────────────────
DB_HOST=localhost
DB_PORT=5432
DB_NAME=community_db
DB_USER=postgres
DB_PASSWORD=your-db-password

# ── JWT (each secret must be at least 32 characters) ──────────────────
JWT_SECRET=your-access-token-secret-min-32-chars
JWT_ACCESS_EXPIRES_IN=7d
JWT_REFRESH_SECRET=your-refresh-token-secret-min-32-chars
JWT_REFRESH_EXPIRES_IN=30d

# ── OTP (secret must be at least 32 characters) ───────────────────────
OTP_TOKEN_SECRET=your-otp-token-secret-min-32-chars
OTP_TOKEN_EXPIRES_IN=10m
OTP_EXPIRES_MINUTES=5
OTP_MAX_ATTEMPTS=5

# ── CORS / URLs ───────────────────────────────────────────────────────
CORS_ORIGIN=http://localhost:4200
APP_URL=http://localhost:3000
FRONTEND_URL=http://localhost:4200

# ── File Uploads ──────────────────────────────────────────────────────
UPLOADS_PATH=uploads

# ── Email (SMTP) — optional, omit to use an Ethereal test account ─────
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=
ADMIN_EMAIL=

# ── Twilio (WhatsApp OTP) — optional, omit to disable ─────────────────
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=

# ── OpenAI — optional, omit to disable ────────────────────────────────
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

# ── Google OAuth 2.0 — optional, omit to disable Google sign-in ───────
GOOGLE_CLIENT_ID=
```

**Variable reference:**

| Variable                | Required | Description                                                  |
|-------------------------|----------|--------------------------------------------------------------|
| `PORT`                  | no (3000)| Port the Express server listens on                           |
| `NODE_ENV`              | no       | `development` / `production` / `test`                        |
| `DB_HOST`               | yes      | PostgreSQL host                                              |
| `DB_PORT`               | no (5432)| PostgreSQL port                                             |
| `DB_NAME`               | yes      | Database name (e.g. `community_db`)                          |
| `DB_USER`               | yes      | Database user                                               |
| `DB_PASSWORD`           | yes      | Database password                                           |
| `JWT_SECRET`            | yes      | Access-token signing secret (min 32 chars)                  |
| `JWT_ACCESS_EXPIRES_IN` | no (7d)  | Access token expiry (e.g. `7d`, `1h`)                       |
| `JWT_REFRESH_SECRET`    | yes      | Refresh-token signing secret (min 32 chars)                 |
| `JWT_REFRESH_EXPIRES_IN`| no (30d) | Refresh token expiry                                        |
| `OTP_TOKEN_SECRET`      | yes      | OTP token signing secret (min 32 chars)                     |
| `OTP_TOKEN_EXPIRES_IN`  | no (10m) | OTP token expiry                                            |
| `OTP_EXPIRES_MINUTES`   | no (5)   | OTP validity window in minutes                              |
| `OTP_MAX_ATTEMPTS`      | no (5)   | Max OTP verification attempts                               |
| `CORS_ORIGIN`           | no       | Allowed CORS origin (default `http://localhost:4200`)       |
| `APP_URL`               | no       | Public backend URL                                          |
| `FRONTEND_URL`          | no       | Frontend URL used in links/redirects                        |
| `UPLOADS_PATH`          | no       | Directory for uploaded files (default `uploads`)            |
| `SMTP_*`, `EMAIL_FROM`, `ADMIN_EMAIL` | no | Email delivery; omit to fall back to an Ethereal test account |
| `TWILIO_*`              | no       | WhatsApp OTP via Twilio; omit to disable                    |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | no | OpenAI integration; omit to disable                       |
| `GOOGLE_CLIENT_ID`      | no       | Google OAuth client ID; omit to disable Google sign-in      |

> **Note:** the Google **Maps** key is a *frontend* value (set in `frontend/src/environments/`), not
> a backend variable. The backend only uses Google **OAuth** via `GOOGLE_CLIENT_ID`.

---

## 3. Configure the Frontend Environment

Open `frontend/src/environments/environment.ts` and set your API/WebSocket URLs and Google Maps key:

```ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api',
  wsUrl: 'http://localhost:3000',
  googleMapsApiKey: 'YOUR_GOOGLE_MAPS_API_KEY',  // <-- replace this
};
```

> The app works without a Google Maps key, but map features will not render.

---

## 4. Create the PostgreSQL Database

Connect to PostgreSQL and create the database:

```bash
# Using psql
psql -U postgres -c "CREATE DATABASE community_db;"
```

Or create it via **pgAdmin** or any PostgreSQL GUI tool.

---

## 5. Install Backend Dependencies

```bash
cd backend
npm install
```

---

## 6. Run Database Migrations

Apply the Knex migrations to create all tables:

```bash
cd backend
npm run migrate
```

> This runs all migration files in `backend/migrations/` (configured via `knexfile.ts`) against the
> database defined by your `DB_*` variables. To undo the most recent batch, use
> `npm run migrate:rollback`.

---

## 7. Seed the Database

Populate the database with initial master data and an admin user:

```bash
cd backend
npm run seed
```

This runs the Knex seed files in `backend/seeds/`.

**What gets seeded:**

| Data        | Details                                              |
|-------------|------------------------------------------------------|
| Countries   | country master data (name, ISO code, dial code, flag)|
| Interests   | interest master data (Art, Sports, etc.)             |
| Admin user  | 1 admin account — see default credentials below      |

---

## 8. Default Admin Credentials

After seeding, use these credentials to log in as admin:

| Field    | Value                   |
|----------|-------------------------|
| Username | `admin`                 |
| Password | `Admin@123`             |
| Email    | `admin@community.local` |
| Role     | `ADMIN`                 |

> **Change the admin password after first login in a production environment.**

---

## 9. Run the Backend

```bash
cd backend
npm run dev
```

The API will be available at: **http://localhost:3000/api**

| Script                     | Description                                  |
|----------------------------|----------------------------------------------|
| `npm run dev`              | Development mode with hot reload (nodemon)   |
| `npm run build`            | Compile TypeScript to `dist/`                |
| `npm run start`            | Run the compiled server (`dist/src/server.js`) |
| `npm run migrate`          | Apply pending Knex migrations                |
| `npm run migrate:rollback` | Roll back the last migration batch           |
| `npm run seed`             | Run Knex seed files                          |

---

## 10. Install Frontend Dependencies

```bash
cd frontend
npm install
```

---

## 11. Run the Frontend

```bash
cd frontend
npm start
```

The app will be available at: **http://localhost:4200**

| Script          | Description                              |
|-----------------|------------------------------------------|
| `npm start`     | Development server with live reload      |
| `npm run build` | Production build (output to `dist/`)     |
| `npm test`      | Run unit tests with Karma                |

---

## Quick Start (Summary)

```bash
# 1. Create the database
psql -U postgres -c "CREATE DATABASE community_db;"

# 2. Backend setup
cd backend
cp .env.example .env      # then edit .env with your values
npm install
npm run migrate
npm run seed
npm run dev

# 3. Frontend setup (new terminal)
cd frontend
npm install
npm start
```

---

## Knex Utility Commands

Run these from the `backend/` directory:

| Command                     | Description                                        |
|-----------------------------|----------------------------------------------------|
| `npm run migrate`           | Apply all pending migrations (`knex migrate:latest`) |
| `npm run migrate:rollback`  | Roll back the most recent migration batch          |
| `npm run seed`              | Run all seed files (`knex seed:run`)               |
| `npx knex migrate:make <name> --knexfile knexfile.ts` | Create a new migration file in `migrations/` |
| `npx knex seed:make <name> --knexfile knexfile.ts`    | Create a new seed file in `seeds/`           |
| `npx knex migrate:status --knexfile knexfile.ts`      | Show applied vs. pending migrations          |

---

## Project Structure

```
Community_Project/
├── backend/                    # Express API server
│   ├── knexfile.ts             # Knex config (pg connection, migrations + seeds dirs)
│   ├── migrations/             # Knex migration files
│   ├── seeds/                  # Knex seed files (countries, interests, admin user)
│   ├── uploads/                # Uploaded files (auto-created)
│   ├── src/
│   │   ├── server.ts           # Process entry (HTTP + Socket.IO)
│   │   ├── app.ts              # Express app: middleware + router mounting + error handler
│   │   ├── config/             # env.ts (Zod-validated), db.ts (Knex), multer.ts
│   │   ├── middleware/         # authenticate, authorize, rateLimiter, errorHandler
│   │   ├── services/           # email, otp, token, openai, whatsapp, notifications, audit
│   │   ├── common/             # shared DTO helpers
│   │   ├── types/              # ambient types (e.g. express.d.ts)
│   │   └── modules/            # feature modules (router/controller/service/dto each)
│   │       ├── auth/           # Authentication (JWT, login, register, refresh)
│   │       ├── users/          # User management
│   │       ├── communities/    # Community CRUD & membership
│   │       ├── posts/          # Posts with approval workflow + comments/likes
│   │       ├── events/         # Community events
│   │       ├── jobs/           # Job listings
│   │       ├── business/       # Business directory
│   │       ├── notifications/  # Real-time notifications
│   │       ├── master-data/    # Countries & interests lookup
│   │       ├── otp/            # OTP send/verify endpoints
│   │       └── upload/         # File upload handling
│   └── .env                    # Environment variables (not committed)
│
└── frontend/                   # Angular 19 app (standalone components)
    └── src/
        ├── app/
        │   ├── core/           # services, models, guards, interceptors
        │   ├── shared/         # reusable components, pipes, directives, constants, utils
        │   ├── layouts/        # user / admin / public shell layouts
        │   └── pages/
        │       ├── landing/    # Public landing page
        │       ├── auth/       # Login & registration
        │       ├── user/       # User-facing pages
        │       ├── admin/      # Admin dashboard & management
        │       └── shared/     # Pages shared across roles
        └── environments/       # Environment config files
```

---

## Troubleshooting

### Server exits at startup with `[Config] Environment validation failed`
A required environment variable is missing or invalid (see the listed field). Common causes: a JWT
or OTP secret shorter than 32 characters, or a missing `DB_*` value. Fix `backend/.env` and restart.

### Backend can't connect to the database
- Ensure PostgreSQL is running.
- Verify the `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` values in `backend/.env`.
- Confirm the database (`community_db`) has been created.

### `npm run migrate` fails
- Confirm the database exists and the `DB_*` credentials are correct.
- Migration files live in `backend/migrations/` and are configured in `knexfile.ts`.

### CORS errors in the browser
Check that `CORS_ORIGIN` (and `FRONTEND_URL`) in `backend/.env` match the URL your Angular app runs
on (default: `http://localhost:4200`).

### Port already in use
- Backend default port is `3000`. Change it via `PORT` in `backend/.env`.
- Frontend default port is `4200`. Change it with: `npm start -- --port 4201`

### Google Maps not rendering
Set a valid API key in `frontend/src/environments/environment.ts` (`googleMapsApiKey`) and ensure
the Maps JavaScript API is enabled in your Google Cloud Console project. (This is a frontend-only
setting — there is no backend Maps key.)
