-- Indexes: every one exists to serve a specific query pattern used by the
-- fraud engine, product pages, or admin dashboard -- not decoration.

-- Product review pages fetch "all reviews for this product" constantly.
CREATE INDEX idx_reviews_product ON reviews(product_id);

-- Customer analyzer looks up "all reviews by this customer" for velocity
-- and rating-bias checks on every review submission.
CREATE INDEX idx_reviews_customer ON reviews(customer_id);

-- Review-burst detection filters reviews by a rolling time window
-- (e.g. "reviews in the last hour").
CREATE INDEX idx_reviews_created ON reviews(created_at);

-- Orders are always looked up per customer (order history, verified-purchase
-- checks).
CREATE INDEX idx_orders_customer ON orders(customer_id);

-- order_items are always joined from the product side when checking
-- verified purchase / return-after-review for a given product.
CREATE INDEX idx_order_items_product ON order_items(product_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);

-- flagged_reviews is always looked up by review_id (1:1 with reviews) and
-- filtered by resolution in the admin flagged-review queue.
CREATE INDEX idx_flagged_reviews_review ON flagged_reviews(review_id);
CREATE INDEX idx_flagged_reviews_resolution ON flagged_reviews(resolution);

-- Admin review-investigation page fetches all signals for one review.
CREATE INDEX idx_review_signals_review ON review_signals(review_id);

-- Connection signals are looked up per review (investigation page) and per
-- customer (repeated-fingerprint / same-IP correlation across reviews).
CREATE INDEX idx_connection_signals_review ON connection_signals(review_id);
CREATE INDEX idx_connection_signals_customer ON connection_signals(customer_id);
CREATE INDEX idx_connection_signals_ip_hash ON connection_signals(ip_hash);

-- products are always filtered/joined by seller (seller dashboard, seller
-- fraud index aggregation).
CREATE INDEX idx_products_seller ON products(seller_id);

-- returns are joined from order_items to detect return-after-review.
CREATE INDEX idx_returns_order_item ON returns(order_item_id);

-- Approximate nearest-neighbor search for semantic similarity. IVFFlat with
-- cosine ops matches the cosine-similarity comparisons used throughout the
-- similarity analyzer (same-product weak signal, cross-product strong
-- signal). Built after schema/seed so list count reflects real row volume;
-- fine to create up front for a project of this size.
CREATE INDEX idx_reviews_embedding_cosine
    ON reviews USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
