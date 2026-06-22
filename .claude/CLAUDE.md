# Project Memory — CLAUDE.md

Factual, stable context for this repository. Update only when something changes structurally
(new folder convention, new library, a rule worth not repeating). Day-to-day task details belong
in the prompt, not here.

---

## 1. Project Overview
- **What it is:** A full-stack community platform. Users join communities and post content (with an
  admin approval/moderation workflow), comment, and like; the app also covers businesses, events,
  job listings, notifications, and real-time features. Two surfaces: a user app and an admin console.
- **Stage:** Active development (functional, evolving).
- **Primary goal right now:** **Stabilize and refactor** — improve consistency and code quality of
  the existing Express + Knex backend and Angular frontend.

## 2. Tech Stack
- **Language(s):** TypeScript (backend `~5.7`, frontend `~5.7`).
- **Backend framework:** Express 5.
- **Frontend framework:** Angular 19 (standalone components) with Angular Material 19 + Bootstrap 5.3.
- **Database:** PostgreSQL, accessed via **Knex 3** query builder over the raw `pg` driver.
  (There is **no ORM** — Prisma was fully removed.)
- **Key backend libraries:** `knex` + `pg` (DB & migrations/seeds), `zod` (validation of both env
  and request DTOs), `jsonwebtoken` (auth), `socket.io` (real-time), `helmet` +
  `express-rate-limit` (security), `multer` (uploads), `nodemailer` (email), `twilio`
  (WhatsApp OTP), `openai`, `google-auth-library` (Google sign-in), `bcryptjs`, `uuid`.
- **Key frontend libraries:** `@angular/material`, `@angular/cdk`, `@angular/google-maps`,
  `bootstrap`, `@ngx-translate/core` (i18n), `socket.io-client`, `libphonenumber-js`, `rxjs`.
- **Package manager:** npm (separate `package.json` in `backend/` and `frontend/`).

## 3. Project Structure

### Backend (`backend/`)
```
backend/
  knexfile.ts            → Knex config (pg connection, migrations + seeds dirs)
  migrations/            → Knex migration files (timestamped .ts)
  seeds/                 → Knex seed files (e.g. 01_seed.ts: countries, interests, admin user)
  uploads/               → Uploaded files (profiles/, videos/, resumes/, certificates/)
  src/
    server.ts            → Process entry: HTTP + Socket.IO bootstrap
    app.ts               → Express app: middleware order, router mounting, error handler
    config/              → env.ts (Zod-validated config), db.ts (Knex instance), multer.ts
    middleware/          → authenticate, authorize, rateLimiter, errorHandler
    services/            → cross-module services: email, otp, token, openai, whatsapp,
                           notifications.gateway (Socket.IO), audit
    common/dto/          → shared DTO helpers
    types/               → ambient types (e.g. express.d.ts request augmentation)
    modules/<feature>/   → feature modules (see pattern below)
```
Feature modules under `src/modules/` (auth, users, communities, posts, business, events, jobs,
notifications, master-data, otp, upload) follow a consistent 4-file pattern:
```
<feature>.router.ts      → Express Router; wires routes + middleware to controller fns
<feature>.controller.ts  → thin HTTP layer: parse DTO with Zod, call service, send response
<feature>.service.ts     → business logic + Knex queries (the bulk of the code)
<feature>.dto.ts         → Zod schemas for request validation
```

### Frontend (`frontend/src/app/`)
```
core/
  services/      → API/domain services (api.service is the HTTP base; auth, user, post, job, ...)
  models/        → index.ts shared interfaces/types
  guards/        → auth.guard, admin.guard, guest.guard
  interceptors/  → auth.interceptor, error.interceptor
shared/
  components/    → reusable UI (file-upload, tag-input, toast, profile-*, etc.)
  pipes/ directives/ constants/ utils/
layouts/         → user-layout, admin-layout, public-layout (shells)
pages/
  landing/       → public landing page
  auth/          → login, register, forgot-password, admin-login
  user/          → user-facing pages (dashboard, profile, community, events, jobs, business)
  admin/         → admin console (dashboard, user-management, post-approval, ...)
  shared/        → pages shared across roles (e.g. community-detail)
app.routes.ts    → route table   app.config.ts → providers   app.component.* → root shell
```

### Where new code goes
- **New backend feature:** create `src/modules/<feature>/` with the four files above; mount its
  router in `app.ts` under `/api/<feature>`.
- **New backend cross-cutting helper:** `src/services/` (logic) or `src/middleware/` (request pipeline).
- **New Angular feature page:** under `pages/<role>/<feature>/`, with a matching service in
  `core/services/` for API calls and any types in `core/models`.
- **New reusable Angular UI:** `shared/components/`.
- **Avoid:** putting business logic/DB queries in controllers — keep controllers thin and push
  logic into services.

## 4. Build / Run / Test Commands

### Backend (run from `backend/`)
```
install            npm install
dev                npm run dev              # nodemon + ts-node, watches src/
build              npm run build            # tsc -> dist/
start              npm run start            # node dist/src/server.js
migrate            npm run migrate          # knex migrate:latest
migrate:rollback   npm run migrate:rollback # knex migrate:rollback
seed               npm run seed             # knex seed:run
```

### Frontend (run from `frontend/`)
```
install   npm install
dev       npm start          # ng serve -> http://localhost:4200
build     npm run build      # ng build -> dist/
test      npm test           # ng test (Karma + Jasmine)
```

## 5. Coding Conventions
- **Backend layering:** router → controller → service. Controllers stay thin: parse input with a
  Zod DTO (`SomeDto.parse(...)`), call the service, send the response. Services own business logic
  and all Knex queries.
- **Validation:** Zod everywhere — request DTOs in `*.dto.ts`, and environment variables in
  `config/env.ts`. Access config only through the exported `env` object (never `process.env`
  directly in feature code).
- **Error handling:** throw `new AppError(statusCode, message, code?)` for expected errors. Let
  `ZodError` / `MulterError` propagate — the central `errorHandler` middleware formats them
  (responses include a `requestId`). Controllers wrap bodies in `try/catch` and call `next(err)`.
- **Auth:** JWT access/refresh via `jsonwebtoken`; `authenticate` middleware populates `req.user`
  (`{ sub, role, ... }`); `authorize` guards roles (e.g. `ADMIN`).
- **Frontend:** Angular **standalone components** (no NgModules). Domain/API access goes through
  services in `core/services/`; HTTP wiring (auth token, error handling) lives in interceptors.
  i18n via `@ngx-translate`. UI uses Angular Material + Bootstrap.
- **Naming:** camelCase for variables/functions, PascalCase for classes/components/Zod schemas;
  files use kebab/dotted feature names (`posts.service.ts`, `auth.guard.ts`).

## 6. Architectural Decisions (the "why")
- **Express, not NestJS.** The backend was migrated off NestJS to plain Express 5. The original
  NestJS URL structure was preserved: a global `/api` prefix plus per-feature segments
  (e.g. `/api/posts`), and the standalone OTP endpoints at `/api/send-otp` and `/api/verify-otp`.
- **Knex + raw `pg`, not Prisma.** The project moved **completely** to Knex; Prisma was fully
  removed (no `schema.prisma`, no Prisma client, no `DATABASE_URL`). Schema changes are made via
  Knex migration files in `backend/migrations/`; reference/admin data via Knex seeds in
  `backend/seeds/`. The DB connection is configured by discrete `DB_*` env vars.
- **Zod as the single validation tool** for both runtime config (`env.ts`) and request DTOs, so
  invalid config fails fast at startup and invalid requests fail uniformly at the edge.
- **Centralized error handling** via one `errorHandler` so all responses share a shape and a
  `requestId`.

## 7. Things Claude Should NEVER Do
- (No project-specific hard rules defined. Follow general good practice and confirm before
  destructive or irreversible actions.)

## 8. Things Claude Should ALWAYS Do
- Run the relevant build/tests before declaring a backend or frontend task done
  (`npm run build` in the affected package; `npm test` for frontend logic changes).
- Keep schema changes in Knex migrations and reference data in seeds — never hand-edit the DB to
  make code work.
- Follow the module pattern (router/controller/service/dto) for new backend features and keep
  controllers thin.
- Keep `README.md` and this file consistent when the stack or structure changes.

## 9. Known Issues / Quirks
- `backend/.env.example` currently contains a **real-looking `DB_PASSWORD`** value — treat it as a
  leaked credential to scrub/rotate; use placeholders going forward.
- `knexfile.ts` has leftover `console.log` debug lines (including printing `DB_PASSWORD`) — a good
  early cleanup target for the stabilize/refactor effort.
- Some frontend files are very large (e.g. `pages/landing/landing.component.*` and several
  `*.scss`); refactor with care.
- `GOOGLE_MAPS_API_KEY` is a **frontend-only** value (set in `frontend/src/environments/`), not a
  backend env var. Google **OAuth** uses the backend `GOOGLE_CLIENT_ID`.

## 10. Glossary / Domain Terms
- **Community:** a group users join; the primary container for posts/events/members.
- **Post approval workflow:** user posts can require admin approval before becoming visible
  (pending → approved/rejected), surfaced in the admin console's post-approval page.
- **Master data:** reference lookups seeded into the DB (countries, interests) exposed via
  `/api/master-data`.
- **OTP:** one-time-password verification (email and/or WhatsApp via Twilio) used in auth flows.
- **ADMIN:** elevated role enforced by the `authorize` middleware / `admin.guard`.
