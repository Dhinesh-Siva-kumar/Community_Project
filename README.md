# Community Project

A full-stack community platform built with **NestJS**, **Angular 19**, and **PostgreSQL**. It supports communities, posts (with moderation), comments, likes, businesses, events, jobs, notifications, and real-time WebSocket features.

---

## Tech Stack

| Layer     | Technology                                      |
|-----------|-------------------------------------------------|
| Frontend  | Angular 19, Angular Material 19, Bootstrap 5.3  |
| Backend   | NestJS 11, TypeScript 5.7                       |
| Database  | PostgreSQL 14+                                  |
| ORM       | Prisma 7                                        |
| Auth      | JWT (access + refresh tokens), Passport         |
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

The backend reads configuration from `backend/.env`. A file is already present — update it with your local values.

```env
# ── Database ──────────────────────────────────────────────────────────
# Local PostgreSQL connection string
DATABASE_URL="postgresql://<DB_USER>:<DB_PASSWORD>@localhost:5432/community_db?schema=public"

# ── JWT ───────────────────────────────────────────────────────────────
# Change these secrets before deploying to production
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRATION="7d"
JWT_REFRESH_SECRET="your-refresh-secret-key-change-in-production"
JWT_REFRESH_EXPIRATION="30d"

# ── App ───────────────────────────────────────────────────────────────
PORT=3000
FRONTEND_URL="http://localhost:4200"

# ── File Upload ───────────────────────────────────────────────────────
UPLOAD_DIR="./uploads"
MAX_FILE_SIZE=5242880          # 5 MB in bytes

# ── Google Maps (used by frontend via backend config) ─────────────────
GOOGLE_MAPS_API_KEY="your-google-maps-api-key"
```

**Variable reference:**

| Variable               | Description                                          |
|------------------------|------------------------------------------------------|
| `DATABASE_URL`         | PostgreSQL connection string for the main database   |
| `JWT_SECRET`           | Secret key for signing access tokens                 |
| `JWT_EXPIRATION`       | Access token expiry (e.g. `7d`, `1h`)                |
| `JWT_REFRESH_SECRET`   | Secret key for signing refresh tokens                |
| `JWT_REFRESH_EXPIRATION` | Refresh token expiry (e.g. `30d`)                  |
| `PORT`                 | Port the NestJS server listens on (default: `3000`)  |
| `FRONTEND_URL`         | Allowed CORS origin for the Angular frontend         |
| `UPLOAD_DIR`           | Directory for uploaded files                         |
| `MAX_FILE_SIZE`        | Max upload size in bytes (`5242880` = 5 MB)          |
| `GOOGLE_MAPS_API_KEY`  | Google Maps API key (get one at console.cloud.google.com) |

---

## 3. Configure the Frontend Environment

Open `frontend/src/environments/environment.ts` and set your Google Maps API key:

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

Apply the Prisma migrations to create all tables:

```bash
cd backend
npx prisma migrate deploy
```

> This runs all migration files found in `prisma/migrations/` against your database.

To also generate the Prisma client (if not auto-generated):

```bash
npx prisma generate
```

---

## 7. Seed the Database

Populate the database with initial master data and an admin user:

```bash
cd backend
npm run seed
```

**What gets seeded:**

| Data             | Count | Details                                      |
|------------------|-------|----------------------------------------------|
| Countries        | 60    | country_master table (name, code, flag emoji) |
| Interests        | 23    | interest_master table (Art, Sports, etc.)    |
| Admin user       | 1     | See default credentials below                |

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
npm run start:dev
```

The API will be available at: **http://localhost:3000/api**

| Script              | Description                        |
|---------------------|------------------------------------|
| `npm run start:dev` | Development mode with hot reload   |
| `npm run start`     | Standard start (compiled)          |
| `npm run start:prod`| Production mode (from `dist/`)     |
| `npm run build`     | Compile TypeScript to `dist/`      |

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
npm install
npx prisma migrate deploy
npx prisma generate
npm run seed
npm run start:dev

# 3. Frontend setup (new terminal)
cd frontend
npm install
npm start
```

---

## Prisma Utility Commands

Run these from the `backend/` directory:

| Command                        | Description                                        |
|--------------------------------|----------------------------------------------------|
| `npx prisma migrate deploy`    | Apply pending migrations to the database           |
| `npx prisma migrate dev`       | Create a new migration from schema changes (dev)   |
| `npx prisma migrate reset`     | Drop and recreate the DB, re-apply all migrations  |
| `npx prisma generate`          | Regenerate the Prisma client                       |
| `npx prisma studio`            | Open a visual database browser at localhost:5555   |
| `npx prisma db pull`           | Introspect existing DB and update schema           |

---

## Project Structure

```
Community_Project/
├── backend/                    # NestJS API server
│   ├── prisma/
│   │   ├── schema.prisma       # Database schema (models & enums)
│   │   ├── seed.ts             # Database seeder
│   │   └── migrations/         # Prisma migration history
│   ├── src/
│   │   ├── auth/               # Authentication (JWT, login, register)
│   │   ├── users/              # User management
│   │   ├── communities/        # Community CRUD & membership
│   │   ├── posts/              # Posts with approval workflow
│   │   ├── events/             # Community events
│   │   ├── jobs/               # Job listings
│   │   ├── business/           # Business directory
│   │   ├── notifications/      # Real-time notifications
│   │   ├── master-data/        # Countries & interests lookup
│   │   ├── otp/                # OTP verification
│   │   ├── upload/             # File upload handling
│   │   └── prisma/             # Prisma service module
│   ├── uploads/                # Uploaded files (auto-created)
│   └── .env                    # Environment variables
│
└── frontend/                   # Angular 19 app
    └── src/
        ├── app/
        │   ├── pages/
        │   │   ├── admin/      # Admin dashboard & management
        │   │   ├── auth/       # Login & registration
        │   │   ├── user/       # User-facing pages
        │   │   └── landing/    # Public landing page
        │   ├── core/           # Guards, interceptors, services
        │   ├── layouts/        # Shell layouts
        │   └── shared/         # Shared components & pipes
        └── environments/       # Environment config files
```

---

## Troubleshooting

### `Error: Environment variable not found: DATABASE_URL`
The `backend/.env` file is missing or the `DATABASE_URL` variable is not set. Check that the file exists and the value is correct.

### `prisma migrate deploy` fails with connection error
- Ensure PostgreSQL is running.
- Verify the `DATABASE_URL` in `.env` matches your PostgreSQL credentials.
- Confirm the database (`community_db`) has been created.

### `PrismaClientInitializationError` on backend start
Run `npx prisma generate` inside the `backend/` directory to regenerate the Prisma client.

### CORS errors in the browser
Check that `FRONTEND_URL` in `backend/.env` matches the URL your Angular app is running on (default: `http://localhost:4200`).

### Port already in use
- Backend default port is `3000`. Change it via `PORT` in `backend/.env`.
- Frontend default port is `4200`. Change it with: `npm start -- --port 4201`

### Google Maps not rendering
Set a valid API key in both `backend/.env` (`GOOGLE_MAPS_API_KEY`) and `frontend/src/environments/environment.ts` (`googleMapsApiKey`). Ensure the Maps JavaScript API is enabled in your Google Cloud Console project.
