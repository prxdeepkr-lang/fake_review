-- Triggers: kept intentionally narrow. The full fraud engine (weighted
-- multi-signal scoring) lives in Node.js services -- this trigger only
-- keeps a lightweight rollup statistic in sync at the DB level so simple
-- dashboard reads don't have to recompute it, per spec section 62.

CREATE OR REPLACE FUNCTION on_flagged_review_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_customer_id INTEGER;
    v_seller_id   INTEGER;
BEGIN
    SELECT r.customer_id, p.seller_id
    INTO v_customer_id, v_seller_id
    FROM reviews r
    JOIN products p ON p.product_id = r.product_id
    WHERE r.review_id = NEW.review_id;

    -- Record a snapshot of customer risk at the moment a review of theirs
    -- gets flagged, so admins can see the trend over time.
    INSERT INTO customer_risk_history (customer_id, risk_score)
    SELECT v_customer_id, risk_score FROM customers WHERE customer_id = v_customer_id;

    -- Same idea at the seller level, using the live fraud index view.
    INSERT INTO seller_risk_history (seller_id, risk_score, fraud_index)
    SELECT s.seller_id, s.risk_score, COALESCE(f.fraud_index, 0)
    FROM sellers s
    JOIN seller_fraud_summary f USING (seller_id)
    WHERE s.seller_id = v_seller_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_flagged_review_insert ON flagged_reviews;
CREATE TRIGGER trg_flagged_review_insert
    AFTER INSERT ON flagged_reviews
    FOR EACH ROW
    EXECUTE FUNCTION on_flagged_review_insert();
