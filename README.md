# Review Fraud Detection & Trust Scoring System

## 1. Project Title

Review Fraud Detection & Trust Scoring System -- a small e-commerce
platform with a built-in trust & safety layer for product reviews.

## 2. Problem Statement

Online marketplaces are routinely targeted by fake, spam, incentivized,
templated, and bot-generated reviews. Binary "real vs fake" classifiers are
brittle and produce hard-to-explain false positives (e.g. flagging a group
of genuine customers who happen to report the same defect in similar
words). This project builds a **multi-signal, explainable** risk-scoring
system instead: every review gets a 0-100 risk score built from many
independent, individually weak signals, with a full breakdown of exactly
which signals fired and why.

## 3. Motivation

No single signal (account age, a VPN connection, similar wording, a
returned product, a low rating) should ever be treated as proof of fraud.
The system is designed so that:

- Signals combine across categories (account, connection, text, behavior,
  seller, purchase history), each with a capped contribution.
- Purchase/verification evidence can only ever *reduce* risk.
- Administrators see the full reasoning behind a score, not just a verdict.

## 4. Features

- Customer + admin accounts (bcrypt + JWT, role-based authorization).
- Product catalog, sellers, orders with multi-item transactions, returns.
- Reviews with a database-enforced one-review-per-customer-per-product rule.
- Backend-authoritative "Verified Purchase" determination (never trusts the
  client).
- A fraud engine combining ~20 signals: account age, purchase/return
  history, review velocity, rating bias, seller fraud index, VADER
  sentiment vs. rating mismatch, capitalization/punctuation/emoji/TTR,
  promotional-phrase matching, exact-duplicate detection, pgvector
  semantic/cross-product similarity, IP/VPN/proxy/Tor/ISP signals, header
  anomaly detection, and a server-checked honeypot field.
- Full explainable signal breakdown per review, grouped by category.
- Admin dashboard: flagged review queue, seller fraud index rankings,
  suspicious-customer list, suspicious-phrase management, system stats.
- Jest + Supertest suite covering DB constraints, auth/authorization, and
  core fraud scenarios.

## 5. Architecture

```
fake_review/
├── server.js              Express app entrypoint
├── db/                     schema, indexes, views, triggers, pool, seed script
├── middleware/             auth, admin role check, validation, rate limiting
├── routes/                 auth, products, orders, reviews, admin
├── services/               fraudEngine + one analyzer per signal category
├── config/weights.js        every weight/threshold, single source of truth
├── utils/                   scoring (category caps + clamp), text normalization
├── tests/                   Jest + Supertest
└── frontend/                React (Vite) + plain CSS
```

Request flow for a review submission: `routes/reviews.js` opens one DB
transaction, verifies the customer/product, computes `verified_purchase`
with the exact backend query from the spec, calls `services/fraudEngine.js`
(which fans out to every analyzer), inserts the review + every individual
`review_signals` row + (if high risk) a `flagged_reviews` row, all within
the same transaction, then commits. Any failure rolls back the whole thing
-- no partial fraud-analysis rows are ever left behind.

## 6. Database Schema

13 tables: `customers`, `sellers`, `products`, `orders`, `order_items`,
`returns`, `reviews`, `flagged_reviews`, `review_signals`,
`connection_signals`, `suspicious_phrases`, `customer_risk_history`,
`seller_risk_history`. See `db/schema.sql` for full DDL with comments.

Key constraints:
- `customers.email` UNIQUE, password never stored in plaintext (bcrypt).
- `reviews` has `UNIQUE(customer_id, product_id)` -- enforced at the
  database level, not just in application code.
- `reviews.rating` has `CHECK (rating BETWEEN 1 AND 5)`.
- `products.price`, `order_items.quantity`/`price` all have positive-value
  `CHECK` constraints.
- `orders` never stores a `product_id` directly -- an order's products
  always go through `order_items`, so one order can contain many products.
- `returns` references `order_items` (not `products`), so a return is
  traceable to the exact purchased line item.

## 7. ER Diagram Description

```
customers ──< orders ──< order_items >── products >── sellers
    │                        │
    │                        └──< returns
    │
    └──< reviews >── products
            │
            ├──< review_signals
            ├──< connection_signals
            └──< flagged_reviews (1:1, references review_id only)

suspicious_phrases                (standalone, admin-managed)
customer_risk_history ── customers
seller_risk_history   ── sellers
```

## 8. Fraud Scoring Methodology

1. Every analyzer (`services/*Analyzer.js`) returns a list of
   `{ category, type, score, details }` signals.
2. `utils/scoring.js` groups signals by category and applies the caps from
   `config/weights.js` (ACCOUNT <=25, CONNECTION <=25, TEXT <=30,
   BEHAVIOR <=30, SELLER <=15, PURCHASE >= -30) so no single category can
   dominate the score.
3. `HONEYPOT_TRIGGERED` bypasses the category cap (a filled hidden field is
   near-decisive bot evidence) and also forces the review into the HIGH
   risk tier regardless of the numeric total.
4. The final sum is clamped to 0-100.
5. Risk levels: **0-29 LOW** (publish), **30-59 MEDIUM** (publish +
   monitor), **60-100 HIGH** (hide + flag for admin review). Thresholds are
   configurable via `RISK_THRESHOLD_MEDIUM`/`RISK_THRESHOLD_HIGH`.

The system never outputs "this review is fake" -- only a score and the
signals behind it. See `services/fraudEngine.js` for the orchestration.

## 9. Risk Signals

See `config/weights.js` for the full, single-source-of-truth list of every
weight and threshold (account age tiers, review velocity windows, rating
bias ratio, seller fraud index threshold, semantic-similarity thresholds,
text thresholds, rate limits). Signal types implemented: `NEW_ACCOUNT`,
`ESTABLISHED_CUSTOMER`, `VERIFIED_PURCHASE`, `LEGITIMATE_PURCHASE_HISTORY`,
`RETURN_AFTER_REVIEW`, `CUSTOMER_REVIEW_BURST`, `REVIEW_BURST`,
`EXTREME_RATING_BIAS`, `EXACT_DUPLICATE`, `SEMANTIC_DUPLICATE`,
`CROSS_PRODUCT_SEMANTIC_MATCH`, `VERIFIED_PURCHASER_TEXT_EXCEPTION`,
`ESTABLISHED_CUSTOMER_TEXT_EXCEPTION`, `RATING_SENTIMENT_MISMATCH`,
`EXCESSIVE_CAPITALIZATION`, `EXCESSIVE_PUNCTUATION`, `EXCESSIVE_EMOJI`,
`LOW_TTR`, `PROMOTIONAL_LANGUAGE`, `LLM_TEMPLATE_LEAK`, `HONEYPOT_TRIGGERED`,
`PROXY`, `VPN`, `TOR`, `HEADER_ANOMALY`, `SELLER_HIGH_FRAUD_INDEX`.

## 10. API Documentation

**Auth** -- `POST /api/auth/register`, `POST /api/auth/login`,
`POST /api/auth/logout`, `GET /api/auth/me`

**Products** -- `GET /api/products`, `GET /api/products/:id`,
`POST /api/products` (admin), `PUT /api/products/:id` (admin),
`DELETE /api/products/:id` (admin, deactivates)

**Orders** -- `POST /api/orders`, `GET /api/orders`, `GET /api/orders/:id`,
`PUT /api/orders/:id/status` (admin), `POST /api/orders/items/:orderItemId/return`

**Reviews** -- `POST /api/reviews`, `GET /api/products/:id/reviews`,
`GET /api/reviews/my`

**Admin** -- `GET /api/admin/reviews/flagged`, `GET /api/admin/reviews/:id`,
`POST /api/admin/reviews/:id/approve`, `POST /api/admin/reviews/:id/remove`,
`GET /api/admin/sellers`, `POST /api/admin/sellers`,
`GET /api/admin/customers`, `GET /api/admin/customers/risk`,
`GET /api/admin/phrases`, `POST /api/admin/phrases`,
`DELETE /api/admin/phrases/:id`, `GET /api/admin/dashboard`

## 11-13. Setup, PostgreSQL, pgvector

Requires PostgreSQL with the `pgvector` extension. If your system package
manager can install `postgresql-16-pgvector` (or equivalent) with `sudo`,
use that. This project's development instance instead runs a
**self-contained, no-sudo Postgres 16 + pgvector** under
`~/tools/pg16` (data in `~/pgdata16`), started via `scripts/db.sh` --
see that script if you need to replicate the setup on a machine without
root access.

```bash
./scripts/db.sh start                 # start Postgres
./scripts/db.sh psql -f db/schema.sql
./scripts/db.sh psql -f db/indexes.sql
./scripts/db.sh psql -f db/views.sql
./scripts/db.sh psql -f db/triggers.sql
```

## 14. Environment Variables

Copy `.env.example` to `.env` and fill in:

- `DATABASE_URL` -- Postgres connection string
- `JWT_SECRET` -- long random string
- `PORT` -- API port (default 4000)
- `IP_INFO_API_KEY` / `IPQUALITYSCORE_API_KEY` -- optional; if unset,
  `services/ipIntelligence.js` falls back to a deterministic local
  classifier (private-range detection + a small illustrative list of
  known datacenter/Tor-adjacent prefixes) so the system works with zero
  external keys or network calls.
- `RISK_THRESHOLD_MEDIUM` / `RISK_THRESHOLD_HIGH` -- risk tier cutoffs

## 15. How to Run the Backend

```bash
npm install
./scripts/db.sh start
npm run seed     # populates realistic demo data (see section 17 below)
npm start        # or: npm run dev
```

## 16. How to Run the Frontend

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173, proxies /api to :4000
```

Seeded admin login: `admin@fakereview.test` / `admin12345`.

## 17. Demo Scenarios

`npm run seed` populates 9 scenarios end to end:

1. Genuine verified reviews (old accounts, delivered orders) -- LOW risk.
2. A group of 6 verified, established customers independently describing
   the same power-bank battery defect in similar words -- demonstrates
   that same-product semantic similarity + verified purchase does **not**
   auto-flag (false-positive protection, spec section 69).
3. A brand-new account's review -- picks up `NEW_ACCOUNT` but is not
   auto-flagged.
4. An exact-duplicate review -- `EXACT_DUPLICATE` signal, explainable
   MEDIUM/HIGH score depending on combined signals.
5. A templated review ("Absolutely amazing product...") posted across
   three unrelated products -- `CROSS_PRODUCT_SEMANTIC_MATCH`, flagged.
6. Purchase -> verified review -> later return -- `RETURN_AFTER_REVIEW`.
7. A customer with 5/5 extreme (1-star/5-star) ratings -- `EXTREME_RATING_BIAS`.
8. A "fraud ring" of 5 new accounts posting promotional reviews for one
   seller in a short window -- high seller fraud index + `REVIEW_BURST`.
9. A bot submission: honeypot triggered + proxy connection + excessive
   caps/punctuation + promotional language -- forced HIGH risk, hidden.

## 18. Database Concepts Demonstrated

Normalization (3NF across the order/product/seller/review graph),
PK/FK/UNIQUE/CHECK/NOT NULL constraints, multi-table JOINs, GROUP BY +
HAVING-style aggregation, indexes (including an IVFFlat pgvector index),
database transactions with COMMIT/ROLLBACK (ACID), views
(`seller_fraud_summary`, `customer_review_summary`,
`product_review_summary`), a trigger (`trg_flagged_review_insert`) that
maintains risk-history rollups without embedding the fraud engine itself in
the database, and pgvector cosine-similarity search.

## 19. Limitations

- The IP intelligence provider is a local deterministic mock unless a real
  `IP_INFO_API_KEY` is supplied -- it is illustrative, not authoritative.
- The embedding model (`all-MiniLM-L6-v2`, 384-dim, via
  `@xenova/transformers`) is a small general-purpose model, not fine-tuned
  for review-fraud detection specifically.
- This is a heuristic, multi-signal risk scorer -- it is explicitly **not**
  a reliable AI-generated-text detector, and no individual signal (or the
  system as a whole) should be treated as proof of fraud. Every score is a
  probabilistic risk estimate meant to guide human review, not a verdict.
- Browser-capability fingerprinting (spec section 44) is not implemented in
  this pass; connection-based signals are IP/header/honeypot-only.

## 20. Future Improvements

- Real IPInfo/IPQualityScore integration in production.
- A fine-tuned or larger embedding model for higher-precision semantic
  matching.
- Browser-side capability fingerprinting combined with existing signals.
- A feedback loop where admin approve/remove decisions retrain signal
  weights over time.
