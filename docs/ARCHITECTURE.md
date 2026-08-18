# Architecture & Technology Stack

**Project:** Kamala Infra Digital Property Platform
**Scope basis:** MVP Definition Document — Telangana Pilot, Month 1
**Status:** Proposed — pending sign-off
**Last updated:** 2026-07-27

---

## 1. Purpose

This document records the technology choices for the platform and the reasoning behind them. It is written for a team shipping **one module per month**, so every decision is judged on two criteria:

1. Does it deliver the Month 1 scope quickly?
2. Does it still hold when the deferred modules arrive?

A choice that only satisfies (1) is a choice we pay for twice.

---

## 2. Architectural drivers

The MVP document defines Month 1, but it also tells us — explicitly — what is coming. The "Out of Scope" list is not a list of things we will never build; it is a roadmap. Each deferred item imposes a technical requirement that is cheap to accommodate now and expensive to retrofit later.

| Deferred module (from MVP doc §4) | Technical demand it creates |
|---|---|
| Payment gateway (booking fees, deposits) | ACID transactions, idempotency, reconciliation, audit trail, PCI scope containment |
| Auction / distress sale | Time-bound state machines, concurrency control under contention, real-time push, **long-lived server processes** |
| In-app chat | Persistent WebSocket connections, message durability, unread state |
| Loan eligibility / lender integration | Third-party APIs, inbound webhooks, retry-with-backoff, async job processing |
| AI recommendations / AI search / AI pricing | Vector embeddings and similarity search |
| Automated image / document fraud detection | Asynchronous worker pool, object-storage event triggers, GPU or external inference APIs |
| Broker portal / multi-listing management | Agency entity, act-on-behalf-of permissions, richer RBAC |

Two further drivers are implied rather than listed:

- **Native mobile.** MVP doc §3.1 Step 1 reads *"Buyer opens the app/website."* An app is expected. That makes an **API-first** architecture mandatory — a stable, versioned, documented API that a web client and a mobile client consume as equals.
- **Geographic expansion.** "Telangana-only" is a Month 1 *policy*, not a permanent property of the business. The schema must treat Telangana as seeded data, never as a hardcoded assumption.

> **The single most consequential driver is auctions + chat.** Both require long-lived, stateful server connections and background workers. That requirement alone rules out a purely serverless backend, and it is the reason this document recommends a container-based API service rather than serverless functions.

---

## 3. Recommended stack

| Layer | Technology | Why |
|---|---|---|
| **Language** | TypeScript (end to end) | One language across web, API, and shared validation. Types for the Property model are written once and enforced on both sides. |
| **Monorepo** | Turborepo + pnpm | Shared types and schemas between clients and API without a publishing step. Cached builds keep CI fast as modules accumulate. |
| **Web frontend** | Next.js 15 (App Router), React 19 | SSR for listing pages (property search must be indexable by Google — organic search is a primary acquisition channel for property marketplaces). Mature, well-staffed hiring pool in India. |
| **Styling / UI** | Tailwind CSS + shadcn/ui | Accessible primitives we own in-repo rather than a dependency we fight. Consistent design system across buyer, seller, and admin surfaces. |
| **Client state** | TanStack Query | Cache, retry, and invalidation for API data. Removes most hand-written loading/error handling. |
| **Forms** | React Hook Form + Zod | The listing form (MVP doc §5) is long, conditional, and validation-heavy. Zod schemas are shared with the API so validation rules are defined once. |
| **Internationalisation** | next-intl | Telugu support. Trivial to scaffold now, invasive to retrofit across every screen later. See §7. |
| **Backend API** | NestJS (Node.js) | Module system maps 1:1 onto a roadmap delivered module-by-module. First-class support for WebSockets, queues, guards, and interceptors — every deferred module's requirement is a documented NestJS pattern, not a bolt-on. |
| **ORM** | Prisma | Type-safe queries, first-class migrations, generated types feeding the shared package. |
| **Database** | PostgreSQL 16 | Ownership, verification, payments, and audit data are inherently relational and demand ACID guarantees. See §6.1. |
| **DB extensions** | PostGIS, pgvector | Enabled at creation, unused in Month 1. PostGIS for future map/radius search; pgvector for future AI search. Enabling later on a live database is disruptive; enabling now costs nothing. |
| **Cache / queues** | Redis + BullMQ | Background jobs from day 1 (seller notifications, email/SMS dispatch). Same infrastructure later carries image processing, fraud-detection jobs, and the WebSocket scale-out adapter. |
| **Object storage** | S3-compatible (AWS S3 / Cloudflare R2) | Two buckets: public property photos behind a CDN, and a private, encrypted bucket for KYC documents. See §8. |
| **Auth** | JWT access + refresh tokens (Passport strategies) | Works identically for web and future mobile clients, unlike cookie-session-only designs. |
| **SMS / OTP** | MSG91 (primary), Twilio (fallback) | MSG91 handles Indian DLT registration natively. Isolated behind a `NotificationProvider` interface so the vendor can be swapped without touching business logic. |
| **Transactional email** | AWS SES or Resend | Verification outcome notifications, inquiry alerts. |
| **API documentation** | OpenAPI, auto-generated by NestJS | The contract the future mobile app and the QA team both work against. |
| **Testing** | Vitest (unit), Supertest (API integration), Playwright (E2E) | E2E covers the two journeys in MVP doc §3 as regression gates. |
| **Error tracking** | Sentry | Frontend and backend, with release tagging. |
| **CI/CD** | GitHub Actions | See `DEPLOYMENT.md`. |
| **Infrastructure as code** | Terraform | Environments reproducible and reviewable rather than hand-clicked. |

---

## 4. Repository structure

```
kamalainfra-digital-platform/
├── apps/
│   ├── web/                  # Next.js — buyer + seller (public)
│   ├── admin/                # Next.js — admin dashboard (separate deploy)
│   └── api/                  # NestJS — REST API, WebSocket gateway, workers
├── packages/
│   ├── db/                   # Prisma schema, migrations, Telangana seed data
│   ├── shared/               # Zod schemas, enums, DTO types (web ↔ admin ↔ api)
│   ├── ui/                   # Shared component library
│   └── config/               # eslint / tsconfig / tailwind presets
├── infra/                    # Terraform modules per environment
├── docs/                     # This document, DEPLOYMENT.md, ADRs
└── .github/workflows/        # CI/CD pipelines
```

**The admin dashboard is a separate application, not a route group inside `web`.** This is deliberate. The admin surface handles Aadhaar documents and ownership deeds, and it is the only place approval decisions are made. Keeping it a separate deployable means it can be network-restricted, given its own authentication policy, and — critically — **no admin code or route definitions ship in the public JavaScript bundle**. The isolation is worth the small duplication.

---

## 5. How each future module plugs in

This is the test of the stack. No entry below requires re-platforming.

| Module | Where it lands | Prepared in Month 1 by |
|---|---|---|
| **Broker portal** | New NestJS module + agency-scoped RBAC guard | `role` enum already includes `BROKER`; nullable `agency_id` on User; permission checks centralised in guards from day 1 |
| **In-app chat** | NestJS WebSocket gateway + Redis adapter | Redis already provisioned; API runs on long-lived containers, not functions |
| **Payments** | New module + provider webhook controller | PostgreSQL transactions; outbox pattern for reliable event dispatch; hosted checkout keeps card data out of our PCI scope |
| **Loan / lender integration** | Integration module + BullMQ workers | Queue infrastructure and webhook-handling pattern already established |
| **Auctions** | State-machine module + WS gateway | Postgres row-level locking for bid contention; Redis for live state; containers for persistent connections |
| **AI search & recommendations** | Embedding worker + vector queries | `pgvector` enabled at database creation |
| **AI fraud detection** | S3 event → BullMQ worker → inference API | Worker pool and storage events already in place. If a Python service is preferable for ML work, it is added as a separate containerised service consuming the same queue — no change to the existing stack. |
| **Map / radius search** | Spatial columns and indexes | `PostGIS` enabled at database creation |
| **Native mobile app** | New client, same API | API-first split with a generated OpenAPI contract; JWT auth works unchanged on mobile |
| **Multi-state expansion** | Seed additional data | `states` table sits above districts; Telangana is a seeded row, never a hardcoded constant |
| **Telugu UI** | Translation catalogues | `next-intl` scaffolded from the first screen |

---

## 6. Alternatives considered

Recording rejected options matters as much as recording the chosen one.

### 6.1 MongoDB / MERN — rejected

The domain is relational at its core: a user owns listings, a listing owns documents, a decision references an admin and a listing, and an audit trail must be provably complete. Two forthcoming modules make this decisive — payments demand ACID guarantees and reconciliation, and auctions demand correct behaviour under concurrent writes to the same row. PostgreSQL also delivers PostGIS and pgvector at no additional operational cost, covering two more roadmap items. There is no requirement here that a document store serves better.

### 6.2 Firebase / Supabase-as-backend — rejected as the primary backend

Attractive for speed, but a poor fit for this roadmap. The cascading District → Mandal → Village filter combined with price ranges and property type is exactly the query shape these platforms handle awkwardly. Server-side approval workflows, audit guarantees, and payment reconciliation want real backend code. Vendor lock-in also becomes a liability once lender and payment integrations arrive. *(Supabase remains a reasonable choice for managed **Postgres hosting** — that is a different decision, covered in `DEPLOYMENT.md`.)*

### 6.3 Next.js API routes only, no separate backend — rejected

The fastest path to Month 1, and genuinely tempting. Rejected for three reasons: a native mobile app is signalled in the MVP document and deserves a first-class API rather than one reverse-engineered from web routes; auctions and chat need persistent connections and background workers that serverless functions do not provide; and migrating a live platform to a real backend in month three — with payments in flight — is far more expensive than the roughly two days this split costs now.

**Honest trade-off:** if the business decides the mobile app and auctions are genuinely off the table, this decision should be revisited. It is the one recommendation here that buys future flexibility at a real present-day cost.

### 6.4 Django / Python backend — rejected for the core API

A capable choice, and stronger than Node for the later ML modules. Rejected because splitting languages across frontend and backend doubles the context a small team carries and forfeits shared validation schemas between client and server. The AI modules, when they arrive, can be added as separate Python services consuming the shared queue — which captures Python's advantage exactly where it matters without imposing it on the whole platform.

---

## 7. Decisions worth making now, cheaply

Four items cost hours today and weeks later. All are recommended for Month 1 even though the MVP document does not require them.

1. **Internationalisation scaffolding.** Wrap strings in `next-intl` from the first screen. Telugu is a realistic requirement for a Telangana-first platform serving district and village markets. Retrofitting i18n means touching every component ever written.
2. **`states` table above districts.** One extra table and one foreign key. Without it, "Telangana-only" leaks from policy into schema and expansion becomes a migration.
3. **RBAC in centralised guards.** MVP doc §6 defines a full permissions matrix. Implement it as declarative guards, not scattered `if (user.role === ...)` checks, so the Broker role is a configuration change rather than an audit of every endpoint.
4. **Audit log as an append-only table with no update or delete path.** The MVP document treats the audit trail as a compliance artefact. Enforce that at the database level rather than by convention.

---

## 8. Handling of sensitive documents

Aadhaar and ownership documents are the highest-risk data on the platform, and the MVP document (§5) already specifies encrypted, admin-only access. The architecture enforces that as follows:

- A **dedicated private bucket**, separate from property photos, with public access blocked at the bucket level.
- **Server-side encryption using a dedicated KMS key**, with key access restricted to the API service role.
- Documents are **never served directly**. Admin document preview uses **presigned URLs with a short (≈5 minute) expiry**, generated per request after an authorisation check.
- **Every document access is written to the audit log** — not only approve and reject decisions. If a document is viewed, there is a record of who viewed it and when.
- **PII is masked in application logs**; Aadhaar numbers are never logged, and document URLs are redacted.
- Public search queries exclude `Draft` and `Rejected` listings **at the data-access layer**, not in the controller, so no future endpoint can accidentally expose them.

> **Legal review required before launch.** Storing Aadhaar copies carries specific obligations under Indian law, and private entities face restrictions on collection and retention. The platform should also be assessed against the Digital Personal Data Protection Act, 2023 for consent, retention limits, and breach notification. A masked-Aadhaar or DigiLocker-based offline-verification flow may be preferable to storing full document scans, and is worth evaluating before the pilot goes live with real sellers. This is a business and legal decision, not an engineering one — but the architecture keeps both paths open.

---

## 9. Deliberately excluded from Month 1

Consistent with MVP doc §4, the following are **not** built, and no code is written in anticipation of them beyond the schema and infrastructure accommodations listed in §5:

AI of any kind (recommendations, search, pricing, OCR, document parsing, image fraud detection) · payment gateway · loan or lender integration · auctions · broker portal · in-app chat.

Verification in Month 1 is **entirely manual** — a human admin visually comparing documents, as §4 of the MVP document requires. No auto-approval path exists in the code.

Two infrastructure components are also deferred until data volume justifies them:

- **Dedicated search engine** (Meilisearch / Typesense / OpenSearch). PostgreSQL full-text search with proper indexing is sufficient well past the pilot's listing volume. Introduce one when query latency, not speculation, demands it.
- **Microservice decomposition.** A well-structured NestJS modular monolith is the correct architecture at this stage. Module boundaries are drawn cleanly enough that extraction remains possible if scale ever warrants it.

---

## 10. Decision log

| # | Decision | Status | Revisit if |
|---|---|---|---|
| 1 | TypeScript end to end | Accepted | — |
| 2 | Turborepo monorepo | Accepted | Team splits into independent product groups |
| 3 | Next.js for web and admin | Accepted | — |
| 4 | NestJS API separate from web | Accepted | Mobile app and auctions are both cancelled |
| 5 | PostgreSQL over document store | Accepted | — |
| 6 | PostGIS + pgvector enabled upfront | Accepted | — |
| 7 | Admin as a separate deployable | Accepted | — |
| 8 | Modular monolith, not microservices | Accepted | Sustained scale genuinely requires independent scaling |
| 9 | Postgres FTS over a search engine | Accepted | Search latency degrades at volume |
| 10 | i18n scaffolding from day 1 | Accepted | — |
