# VaultDrop Admin Paneli MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dashboard, Users, Transactions ve Logs ekranlarını; sunucuda zorunlu RBAC, kullanıcı kısıtları, özel limitler ve silinemez audit kayıtlarıyla oluşturmak.

**Architecture:** Mevcut Express kimlik doğrulamasına rol ve hesap durumu eklenir; admin endpoint'leri ayrı router, validation ve repository metotlarında tutulur. React tarafında `/admin` rotası, izinlere göre menü ve sayfa bileşenleri sunar; güvenlik kararı her zaman backend'dedir.

**Tech Stack:** React 19, Vite 8, Express 5, Neon/PostgreSQL, Zod 4, Vitest 4, Testing Library, Supertest, düz CSS.

**Spec:** `docs/superpowers/specs/2026-08-24-admin-panel-mvp-design.md`

## Global Constraints

- Dosya adı, dosya içeriği, şifreleme anahtarı ve QR verisi admin verisine veya loglara yazılmayacak.
- Admin mutasyonları CSRF kaynak ve `X-VaultDrop-Request` kontrolünden geçecek.
- Yetki kontrolü yalnız arayüz gizleme ile bırakılmayacak; API her isteği ayrıca denetleyecek.
- Kullanıcı kendi durumunu değiştiremeyecek; super admin kısıtlanamayacak.
- Mevcut React/CSS görsel dili ve Türkçe kullanıcı metinleri korunacak.

---

### Task 1: RBAC ve hesap erişim kuralları

**Files:**
- Create: `server/admin/rbac.js`
- Create: `server/account-access.js`
- Modify: `server/auth.js`
- Test: `server/__tests__/rbac.test.js`
- Test: `server/__tests__/account-access.test.js`

**Interfaces:**
- Produces: `ROLE_PERMISSIONS`, `hasPermission(user, permission)`, `requirePermission(permission)`, `getAccountRestriction(user, now)`, `requireTransferAccess`.

- [ ] RBAC rol matrisi ve 401/403 davranışını gösteren başarısız testleri yaz.
- [ ] `npm test -- server/__tests__/rbac.test.js` çalıştır ve eksik modül nedeniyle RED doğrula.
- [ ] En küçük rol matrisi ve middleware uygulamasını yaz.
- [ ] Ban, askı, süresi dolmuş askı ve işlem engeli testlerini yazıp RED doğrula.
- [ ] Hesap erişim middleware'ini uygula; `npm test -- server/__tests__/rbac.test.js server/__tests__/account-access.test.js` ile GREEN doğrula.

### Task 2: Admin veri şeması ve repository sözleşmeleri

**Files:**
- Create: `server/db/migrations/008_admin_panel_mvp.sql`
- Create: `server/admin/repositories.js`
- Modify: `server/repositories.js`
- Modify: `server/runtime.js`
- Test: `server/__tests__/admin-migration.test.js`
- Test: `server/__tests__/admin-repositories.test.js`

**Interfaces:**
- Produces: `getAdminDashboard()`, `listAdminUsers(query)`, `getAdminUser(id)`, `updateUserRestriction(input)`, `updateUserLimit(input)`, `listAdminTransactions(query)`, `listSystemLogs(query)`, `listAuditLogs(query)`.

- [ ] Migration kolonları, indeksleri ve audit tablosunun silme API'si olmamasını doğrulayan testi yazıp RED çalıştır.
- [ ] `008_admin_panel_mvp.sql` dosyasını güvenli varsayılanlar ve indekslerle ekleyip GREEN doğrula.
- [ ] Parametreli sorgu ve audit işlemi sözleşmelerini test-first yaz.
- [ ] Listeleme, dashboard ve atomik kullanıcı mutasyonlarını en küçük SQL repository uygulamasıyla geçir.
- [ ] Geliştirme için bellek repository karşılıklarını ekle ve ilgili testleri çalıştır.

### Task 3: Admin API ve gerçek backend enforcement

**Files:**
- Create: `server/admin/validation.js`
- Create: `server/admin/router.js`
- Modify: `server/app.js`
- Test: `server/__tests__/admin-api.test.js`
- Modify: `server/__tests__/auth-api.test.js`

**Interfaces:**
- Produces: `GET /api/admin/dashboard`, `/users`, `/users/:id`, `/transactions`, `/logs`, `/audit-logs`; `PATCH /api/admin/users/:id/restriction`, `/limit`.

- [ ] Oturumsuz ve izinsiz admin istekleri için 401/403 testlerini yazıp RED doğrula.
- [ ] Görüntüleme endpoint'lerini permission middleware ile bağlayıp GREEN doğrula.
- [ ] Askı, ban, kaldırma ve limit mutasyonlarının hedef koruması/audit davranışı testlerini yazıp RED doğrula.
- [ ] Zod şemaları ve mutasyon endpoint'lerini ekleyip GREEN doğrula.
- [ ] Normal transfer endpoint'lerinin banlı/askıdaki/engelli kullanıcıyı reddettiği testleri yaz; erişim middleware'ini bağlayıp tüm API testlerini geçir.

### Task 4: Admin istemci, rota ve erişim kapısı

**Files:**
- Create: `src/admin/admin-api.js`
- Create: `src/admin/AdminRoute.jsx`
- Create: `src/admin/AdminApp.jsx`
- Modify: `src/routes.js`
- Modify: `src/App.jsx`
- Modify: `src/auth/AuthContext.jsx`
- Test: `src/__tests__/admin-route.test.jsx`
- Modify: `src/__tests__/routes.test.js`

**Interfaces:**
- Produces: `adminApi`, `AdminRoute`, `/admin` ve `/admin/:section` çözümlemesi.

- [ ] Admin route çözümleme ve oturum/yetki durumlarını gösteren testleri yazıp RED doğrula.
- [ ] Auth kullanıcı eşlemesine rol/permissions ekle ve admin route kapısını uygula.
- [ ] Admin API istemcisini mevcut `apiRequest` üzerine ekle.
- [ ] Odaklı route testlerini GREEN doğrula.

### Task 5: Dashboard, Users, Transactions ve Logs arayüzü

**Files:**
- Create: `src/admin/AdminShell.jsx`
- Create: `src/admin/DashboardPage.jsx`
- Create: `src/admin/UsersPage.jsx`
- Create: `src/admin/UserDetailPanel.jsx`
- Create: `src/admin/TransactionsPage.jsx`
- Create: `src/admin/LogsPage.jsx`
- Create: `src/admin/admin.css`
- Test: `src/__tests__/admin-ui.test.jsx`

**Interfaces:**
- Consumes: `adminApi` ve kullanıcı permissions listesi.
- Produces: responsive admin kabuğu, filtreli tablolar, durum rozetleri, kullanıcı kısıtlama/limit formları ve boş/hata/yükleme durumları.

- [ ] Dashboard kartları ve permission'a göre menü davranışı testini yazıp RED doğrula.
- [ ] Admin kabuğu ile dashboard'u uygulayıp GREEN doğrula.
- [ ] Users filtreleri, detay açma, ban/askı/limit formu testlerini yazıp RED doğrula.
- [ ] Users ekranını ve kullanıcı detay panelini uygulayıp GREEN doğrula.
- [ ] Transactions ve Logs sekmelerinin gerçek API verisini/boş durumunu göstermesi testlerini yazıp RED doğrula.
- [ ] Transactions ve Logs ekranlarını uygulayıp tüm admin UI testlerini GREEN doğrula.

### Task 6: Tam doğrulama ve operasyon notları

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Documents: `VAULTDROP_SUPER_ADMIN_EMAILS`, migration ve admin erişim yolu.

- [ ] İlk admin kurulumu ve migration komutunu belgele.
- [ ] `npm test` çalıştır; sıfır başarısızlık doğrula.
- [ ] `npm run lint` çalıştır; sıfır hata doğrula.
- [ ] `npm run build` çalıştır; çıkış kodu 0 doğrula.
- [ ] Uygulamayı açıp `/admin` masaüstü ve dar ekran görünümünü, loading/error/empty durumlarını kontrol et.
- [ ] Değişen dosyaları ve migration gereksinimini kullanıcıya özetle.
