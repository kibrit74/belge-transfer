# VaultDrop Auth, Neon and Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Google girişi, Neon kullanıcı/transfer geçmişi, misafir limitleri, çoklu dosya aktarımı ve profil dashboardu eklemek.

**Architecture:** Vite/React istemcisi `/api` üzerinden Express 5 backend'e bağlanır. Express Google OAuth, hash'lenmiş veritabanı oturumu ve parametreli Neon sorgularını yönetir; dosya içeriği daima tarayıcıda kalır.

**Tech Stack:** React 19, Express 5, Google Auth Library, `@neondatabase/serverless`, Zod, Helmet, Vitest, Testing Library

## Global Constraints

- Dosya adı, içerik, şifreleme anahtarı, QR verisi ve paket verisi veritabanına yazılmayacak.
- Misafir: tek dosya, en fazla 10 MiB, geçmiş ve seri aktarım yok.
- Giriş yapan: en fazla 15 dosya, dosya başına 50 MiB.
- QR Video: tüm kullanıcılar için en fazla 15 dosya ve toplam 15 MiB.
- Transfer geçmişi 90 gün tutulacak.
- Hiçbir gerçek gizli değer kaynak koduna veya örnek env dosyasına yazılmayacak.
- Proje Git deposu olmadığı için commit adımları uygulanmayacak.

---

### Task 1: Neon schema and repositories

**Files:**
- Create: `server/db/migrations/001_auth_and_transfer_history.sql`
- Create: `server/db/pool.js`
- Create: `server/db/migrate.js`
- Create: `server/repositories.js`
- Create: `server/__tests__/repositories.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `createRepositories(query)` with user, session, transfer and dashboard operations.

- [ ] Write failing repository tests using a controlled query adapter; verify user upsert, hash-only sessions, user-scoped history and dashboard filters.
- [ ] Run `cmd /c npx vitest run server/__tests__/repositories.test.js`; expect missing module failure.
- [ ] Add schema with `users`, `sessions`, `transfer_batches`, `transfer_items`, indexes and 90-day cleanup function.
- [ ] Implement parameterized repository methods and Neon pool/migration entrypoints.
- [ ] Re-run the focused test; expect PASS.

### Task 2: Secure Google OAuth and session API

**Files:**
- Create: `server/config.js`
- Create: `server/auth.js`
- Create: `server/validation.js`
- Create: `server/app.js`
- Create: `server/index.js`
- Create: `server/__tests__/auth-api.test.js`
- Create: `.env.example`
- Modify: `.gitignore`
- Modify: `vite.config.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `createApp(dependencies)`, `/api/auth/*`, `/api/transfers`, `/api/profile/*`.

- [ ] Write failing API tests for OAuth state, session cookie, auth checks, CSRF header, guest rejection and profile access.
- [ ] Run focused API tests; expect missing app module failure.
- [ ] Implement Helmet, body limits, rate limits, origin/header checks, Google OAuth callback, SHA-256 session tokens and generic error responses.
- [ ] Add Vite `/api` proxy and safe placeholder-only env example.
- [ ] Re-run API tests; expect PASS.

### Task 3: Frontend auth, navbar, login and dashboard

**Files:**
- Create: `src/auth/AuthContext.jsx`
- Create: `src/api/client.js`
- Create: `src/pages/LoginPage.jsx`
- Create: `src/pages/LoginPage.css`
- Create: `src/pages/ProfilePage.jsx`
- Create: `src/pages/ProfilePage.css`
- Create: `src/__tests__/auth-profile-ui.test.jsx`
- Modify: `src/main.jsx`
- Modify: `src/App.jsx`
- Modify: `src/routes.js`
- Modify: `src/components/SiteNavbar.jsx`
- Modify: `src/components/SiteNavbar.css`

**Interfaces:**
- Produces: `useAuth()`, `/giris`, `/profil`, auth-aware navbar and dashboard filters.

- [ ] Write failing UI tests for guest login link, authenticated profile link, protected profile route, summary cards and history table.
- [ ] Run focused UI tests; expect missing auth/page modules.
- [ ] Implement auth context, routes, login page, dashboard and logout.
- [ ] Re-run UI tests; expect PASS.

### Task 4: Usage policy and multi-file archive

**Files:**
- Create: `src/transfer/usage-policy.js`
- Create: `src/transfer/create-file-batch.js`
- Create: `src/__tests__/usage-policy.test.js`
- Create: `src/__tests__/file-batch.test.js`
- Modify: `src/SecurePackagePanel.jsx`
- Modify: `src/VideoTransferPanel.jsx`
- Modify: `src/pages/TransferPage.jsx`
- Modify: `src/App.css`

**Interfaces:**
- Produces: `validateTransferSelection(files, method, user)`, `createFileBatch(files)`.

- [ ] Write failing tests for 10 MiB guest single-file rule, authenticated 15-file/50 MiB rule, QR Video 15-file/15 MiB combined rule and ZIP batch output.
- [ ] Run focused tests; expect missing modules.
- [ ] Implement policy and ZIP batch creation using existing `fflate` dependency.
- [ ] Update Secure Package and QR Video selectors to accept multiple files only when authenticated and display selected count/total.
- [ ] Re-run focused tests; expect PASS.

### Task 5: Transfer activity recording

**Files:**
- Create: `src/transfer/activity-client.js`
- Create: `src/__tests__/transfer-activity.test.js`
- Modify: `src/SecurePackagePanel.jsx`
- Modify: `src/VideoTransferPanel.jsx`
- Modify: `src/SendPanel.jsx`
- Modify: `src/ReceivePanel.jsx`

**Interfaces:**
- Produces: `recordTransferActivity({ method, direction, status, files })` that sends metadata only.

- [ ] Write a failing test proving names, contents and keys are omitted from payloads.
- [ ] Implement metadata-only payload construction and API delivery.
- [ ] Record completed/failed authenticated transfers without breaking the local transfer result.
- [ ] Run focused activity and transfer UI tests; expect PASS.

### Task 6: Verification and operating workflow

**Files:**
- Modify: `README.md`
- Verify: all source and server files

- [ ] Document `npm run dev:all`, migration commands, required rotated env variables and ports 5173/5704.
- [ ] Run `cmd /c npm test -- --maxWorkers=1`.
- [ ] Run `cmd /c npm run lint`.
- [ ] Run `cmd /c npm run build`.
- [ ] Start frontend/backend, verify login/error fallback, navbar, guest limits and dashboard layouts in desktop/mobile browser.
