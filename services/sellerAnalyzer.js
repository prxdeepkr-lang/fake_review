const { WEIGHTS, THRESHOLDS } = require('../config/weights');

// A high seller fraud index is a weak/moderate *contextual* signal, not
// proof any single review from that seller is fake (spec section 23).
async function analyzeSellerFraudIndex(client, sellerId) {
    const signals = [];

    const result = await client.query(
        `SELECT
            COUNT(r.review_id) AS total_reviews,
            COUNT(fr.review_id) AS flagged_reviews
         FROM products p
         LEFT JOIN reviews r ON r.product_id = p.product_id
         LEFT JOIN flagged_reviews fr ON fr.review_id = r.review_id
         WHERE p.seller_id = $1`,
        [sellerId]
    );
    const total = parseInt(result.rows[0].total_reviews, 10);
    const flagged = parseInt(result.rows[0].flagged_reviews, 10);
    const fraudIndex = total > 0 ? (flagged / total) * 100 : 0;

    if (total >= 5 && fraudIndex > THRESHOLDS.SELLER_FRAUD_INDEX_PCT) {
        signals.push({
            category: 'SELLER',
            type: 'SELLER_HIGH_FRAUD_INDEX',
            score: WEIGHTS.SELLER_HIGH_FRAUD_INDEX,
            details: `Seller fraud index is ${fraudIndex.toFixed(1)}% (${flagged}/${total} reviews flagged)`,
        });
    }

    return signals;
}

// Detects a burst of reviews across a seller's products -- coordinated
// fake-review campaigns often hit many listings from one seller at once
// (spec section 21).
async function analyzeSellerVelocity(client, sellerId) {
    const signals = [];

    const result = await client.query(
        `SELECT COUNT(r.review_id) AS recent_count
         FROM reviews r
         JOIN products p ON p.product_id = r.product_id
         WHERE p.seller_id = $1
           AND r.created_at >= NOW() - ($2 || ' milliseconds')::INTERVAL`,
        [sellerId, THRESHOLDS.SELLER_BURST_WINDOW_MS]
    );
    const recentCount = parseInt(result.rows[0].recent_count, 10);

    if (recentCount >= THRESHOLDS.SELLER_BURST_COUNT) {
        signals.push({
            category: 'SELLER',
            type: 'REVIEW_BURST',
            score: WEIGHTS.REVIEW_BURST,
            details: `${recentCount} reviews posted for this seller's products in the last 10 minutes`,
        });
    }

    return signals;
}

// Recomputes and persists a seller's overall risk score + fraud index.
async function updateSellerRiskScore(client, sellerId) {
    const result = await client.query(
        `SELECT COUNT(r.review_id) AS total, COUNT(fr.review_id) AS flagged
         FROM products p
         LEFT JOIN reviews r ON r.product_id = p.product_id
         LEFT JOIN flagged_reviews fr ON fr.review_id = r.review_id
         WHERE p.seller_id = $1`,
        [sellerId]
    );
    const total = parseInt(result.rows[0].total, 10);
    const flagged = parseInt(result.rows[0].flagged, 10);
    const fraudIndex = total > 0 ? (flagged / total) * 100 : 0;
    const riskScore = Math.min(100, Math.round(fraudIndex));

    await client.query('UPDATE sellers SET risk_score = $1 WHERE seller_id = $2', [riskScore, sellerId]);
    await client.query(
        'INSERT INTO seller_risk_history (seller_id, risk_score, fraud_index) VALUES ($1, $2, $3)',
        [sellerId, riskScore, fraudIndex]
    );
    return { riskScore, fraudIndex };
}

module.exports = { analyzeSellerFraudIndex, analyzeSellerVelocity, updateSellerRiskScore };
