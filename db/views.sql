-- Views: reusable aggregations for the admin dashboard and fraud engine.
-- Demonstrates JOIN + GROUP BY + aggregate functions as first-class DB
-- objects rather than ad-hoc query duplication across services.

CREATE OR REPLACE VIEW seller_fraud_summary AS
SELECT
    s.seller_id,
    s.name                                                        AS seller_name,
    COUNT(DISTINCT p.product_id)                                  AS total_products,
    COUNT(DISTINCT r.review_id)                                   AS total_reviews,
    COUNT(DISTINCT fr.review_id)                                  AS flagged_reviews,
    ROUND(
        COALESCE(COUNT(DISTINCT fr.review_id), 0)::NUMERIC
            / NULLIF(COUNT(DISTINCT r.review_id), 0) * 100,
        2
    )                                                              AS fraud_index,
    ROUND(AVG(r.rating)::NUMERIC, 2)                               AS avg_rating,
    s.risk_score
FROM sellers s
LEFT JOIN products p ON p.seller_id = s.seller_id
LEFT JOIN reviews r ON r.product_id = p.product_id
LEFT JOIN flagged_reviews fr ON fr.review_id = r.review_id
GROUP BY s.seller_id, s.name, s.risk_score;

CREATE OR REPLACE VIEW customer_review_summary AS
SELECT
    c.customer_id,
    c.name                                                        AS customer_name,
    c.email,
    c.created_at                                                  AS account_created_at,
    c.risk_score,
    c.account_status,
    COUNT(r.review_id)                                            AS total_reviews,
    COUNT(r.review_id) FILTER (WHERE r.verified_purchase)         AS verified_reviews,
    COUNT(fr.review_id)                                           AS flagged_reviews,
    COUNT(r.review_id) FILTER (WHERE r.rating = 5)                AS five_star_reviews,
    COUNT(r.review_id) FILTER (WHERE r.rating = 1)                AS one_star_reviews,
    ROUND(AVG(r.rating)::NUMERIC, 2)                               AS avg_rating_given
FROM customers c
LEFT JOIN reviews r ON r.customer_id = c.customer_id
LEFT JOIN flagged_reviews fr ON fr.review_id = r.review_id
GROUP BY c.customer_id, c.name, c.email, c.created_at, c.risk_score, c.account_status;

CREATE OR REPLACE VIEW product_review_summary AS
SELECT
    p.product_id,
    p.name                                                        AS product_name,
    p.seller_id,
    COUNT(r.review_id)                                            AS total_reviews,
    COUNT(fr.review_id)                                           AS flagged_reviews,
    ROUND(
        COALESCE(COUNT(fr.review_id), 0)::NUMERIC
            / NULLIF(COUNT(r.review_id), 0) * 100,
        2
    )                                                              AS flagged_ratio,
    ROUND(AVG(r.rating)::NUMERIC, 2)                               AS avg_rating
FROM products p
LEFT JOIN reviews r ON r.product_id = p.product_id
LEFT JOIN flagged_reviews fr ON fr.review_id = r.review_id
GROUP BY p.product_id, p.name, p.seller_id;
