-- Review Fraud Detection & Trust Scoring System
-- Core relational schema. Normalized design: an order can contain many
-- products via order_items (never a direct product_id on orders), returns
-- reference order_items (not products) so a partial-order return is
-- traceable to the exact purchased line, and fraud evidence (review_signals,
-- connection_signals) is kept separate from reviews/flagged_reviews so a
-- review is never duplicated across tables -- only referenced by id.

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------
CREATE TABLE customers (
    customer_id     SERIAL PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    role            VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER'
                        CHECK (role IN ('CUSTOMER', 'ADMIN')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    risk_score      INTEGER NOT NULL DEFAULT 0
                        CHECK (risk_score BETWEEN 0 AND 100),
    account_status  VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                        CHECK (account_status IN ('ACTIVE', 'SUSPENDED', 'BANNED'))
);

-- ---------------------------------------------------------------------
-- sellers
-- ---------------------------------------------------------------------
CREATE TABLE sellers (
    seller_id       SERIAL PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    risk_score      INTEGER NOT NULL DEFAULT 0
                        CHECK (risk_score BETWEEN 0 AND 100)
);

-- ---------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------
CREATE TABLE products (
    product_id      SERIAL PRIMARY KEY,
    seller_id       INTEGER NOT NULL REFERENCES sellers(seller_id) ON DELETE RESTRICT,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    price           NUMERIC(10, 2) NOT NULL CHECK (price > 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

-- ---------------------------------------------------------------------
-- orders (never carries product_id directly -- see order_items)
-- ---------------------------------------------------------------------
CREATE TABLE orders (
    order_id        SERIAL PRIMARY KEY,
    customer_id     INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
    order_date      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status          VARCHAR(20) NOT NULL DEFAULT 'PLACED'
                        CHECK (status IN ('PLACED', 'DELIVERED', 'CANCELLED'))
);

-- ---------------------------------------------------------------------
-- order_items (join between orders and products, one row per line item)
-- ---------------------------------------------------------------------
CREATE TABLE order_items (
    order_item_id   SERIAL PRIMARY KEY,
    order_id        INTEGER NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id      INTEGER NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
    quantity        INTEGER NOT NULL CHECK (quantity > 0),
    price           NUMERIC(10, 2) NOT NULL CHECK (price > 0)
);

-- ---------------------------------------------------------------------
-- returns (references order_items, not products directly, so we know
-- exactly which purchased line was returned)
-- ---------------------------------------------------------------------
CREATE TABLE returns (
    return_id       SERIAL PRIMARY KEY,
    order_item_id   INTEGER NOT NULL REFERENCES order_items(order_item_id) ON DELETE CASCADE,
    returned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason          TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'REQUESTED'
                        CHECK (status IN ('REQUESTED', 'APPROVED', 'REJECTED'))
);

-- ---------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------
-- UNIQUE(customer_id, product_id) is a database-level guarantee (not just
-- frontend validation) that a customer can only ever review a product once.
-- embedding is a 384-dim vector (matches all-MiniLM-L6-v2) used for
-- semantic/fuzzy similarity search via pgvector.
CREATE TABLE reviews (
    review_id           SERIAL PRIMARY KEY,
    customer_id         INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
    product_id          INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    rating              SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    review_text         TEXT NOT NULL,
    verified_purchase   BOOLEAN NOT NULL DEFAULT FALSE,
    visible             BOOLEAN NOT NULL DEFAULT TRUE,
    risk_score          INTEGER NOT NULL DEFAULT 0
                            CHECK (risk_score BETWEEN 0 AND 100),
    embedding           VECTOR(384),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (customer_id, product_id)
);

-- ---------------------------------------------------------------------
-- flagged_reviews -- references the review by id, never duplicates it
-- ---------------------------------------------------------------------
CREATE TABLE flagged_reviews (
    flagged_id      SERIAL PRIMARY KEY,
    review_id       INTEGER NOT NULL REFERENCES reviews(review_id) ON DELETE CASCADE,
    risk_score      INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
    flag_reason     TEXT NOT NULL,
    flagged_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by     INTEGER REFERENCES customers(customer_id) ON DELETE SET NULL,
    resolution      VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                        CHECK (resolution IN ('PENDING', 'APPROVED', 'REMOVED')),
    resolved_at     TIMESTAMPTZ,
    UNIQUE (review_id)
);

-- ---------------------------------------------------------------------
-- review_signals -- every individual fraud signal, stored so the risk
-- score is fully explainable to an administrator
-- ---------------------------------------------------------------------
CREATE TABLE review_signals (
    signal_id       SERIAL PRIMARY KEY,
    review_id       INTEGER NOT NULL REFERENCES reviews(review_id) ON DELETE CASCADE,
    category        VARCHAR(20) NOT NULL
                        CHECK (category IN ('ACCOUNT', 'CONNECTION', 'TEXT', 'BEHAVIOR', 'SELLER', 'PURCHASE')),
    signal_type     VARCHAR(60) NOT NULL,
    score           INTEGER NOT NULL,
    details         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- connection_signals -- supporting evidence, not proof of fraud
-- ---------------------------------------------------------------------
CREATE TABLE connection_signals (
    connection_id           SERIAL PRIMARY KEY,
    customer_id             INTEGER REFERENCES customers(customer_id) ON DELETE SET NULL,
    review_id               INTEGER REFERENCES reviews(review_id) ON DELETE CASCADE,
    ip_hash                 CHAR(64) NOT NULL,
    isp                     VARCHAR(150),
    country                 VARCHAR(80),
    is_proxy                BOOLEAN NOT NULL DEFAULT FALSE,
    is_vpn                  BOOLEAN NOT NULL DEFAULT FALSE,
    is_tor                  BOOLEAN NOT NULL DEFAULT FALSE,
    risk_score              INTEGER NOT NULL DEFAULT 0,
    user_agent              TEXT,
    header_anomaly_score    INTEGER NOT NULL DEFAULT 0,
    honeypot_triggered      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- suspicious_phrases -- admin-managed, never hardcoded in the engine
-- ---------------------------------------------------------------------
CREATE TABLE suspicious_phrases (
    phrase_id       SERIAL PRIMARY KEY,
    phrase          VARCHAR(200) NOT NULL UNIQUE,
    weight          INTEGER NOT NULL DEFAULT 5
);

-- ---------------------------------------------------------------------
-- customer_risk_history -- optional historical trend of customer risk
-- ---------------------------------------------------------------------
CREATE TABLE customer_risk_history (
    history_id      SERIAL PRIMARY KEY,
    customer_id     INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
    risk_score      INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
    calculated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- seller_risk_history -- optional historical trend of seller fraud index
-- ---------------------------------------------------------------------
CREATE TABLE seller_risk_history (
    history_id      SERIAL PRIMARY KEY,
    seller_id       INTEGER NOT NULL REFERENCES sellers(seller_id) ON DELETE CASCADE,
    risk_score      INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
    fraud_index     NUMERIC(5, 2) NOT NULL DEFAULT 0,
    calculated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
