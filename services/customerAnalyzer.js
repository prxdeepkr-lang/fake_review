const { WEIGHTS, THRESHOLDS } = require('../config/weights');

// Detects a customer submitting many reviews in a short window --
// coordinated/automated posting rather than a single review viewed as one
// data point in isolation (spec section 20).
async function analyzeCustomerVelocity(client, customerId) {
    const signals = [];

    const result = await client.query(
        `SELECT COUNT(*) FROM reviews
         WHERE customer_id = $1 AND created_at >= NOW() - ($2 || ' milliseconds')::INTERVAL`,
        [customerId, THRESHOLDS.CUSTOMER_BURST_WINDOW_MS]
    );
    const recentCount = parseInt(result.rows[0].count, 10);

    if (recentCount >= THRESHOLDS.CUSTOMER_BURST_COUNT) {
        signals.push({
            category: 'BEHAVIOR',
            type: 'CUSTOMER_REVIEW_BURST',
            score: WEIGHTS.CUSTOMER_REVIEW_BURST,
            details: `${recentCount} reviews submitted by this customer in the last hour`,
        });
    }

    return signals;
}

// Detects customers who almost exclusively leave extreme ratings (spec
// section 22). This is contextual -- a genuine customer who dislikes most
// products they buy is not automatically fraudulent, so it only fires once
// there's enough history to be meaningful.
async function analyzeRatingBias(client, customerId) {
    const signals = [];

    const result = await client.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE rating IN (1, 5)) AS extreme
         FROM reviews WHERE customer_id = $1`,
        [customerId]
    );
    const total = parseInt(result.rows[0].total, 10);
    const extreme = parseInt(result.rows[0].extreme, 10);

    if (total >= THRESHOLDS.EXTREME_RATING_MIN_REVIEWS) {
        const ratio = extreme / total;
        if (ratio >= THRESHOLDS.EXTREME_RATING_RATIO) {
            signals.push({
                category: 'BEHAVIOR',
                type: 'EXTREME_RATING_BIAS',
                score: WEIGHTS.EXTREME_RATING_BIAS,
                details: `${Math.round(ratio * 100)}% of this customer's ${total} reviews are 1-star or 5-star`,
            });
        }
    }

    return signals;
}

// Recomputes and persists a customer's overall risk score from their most
// recent reviews, used after each review submission.
async function updateCustomerRiskScore(client, customerId) {
    const result = await client.query(
        `SELECT COALESCE(ROUND(AVG(risk_score)), 0) AS avg_risk
         FROM (
             SELECT risk_score FROM reviews
             WHERE customer_id = $1
             ORDER BY created_at DESC LIMIT 10
         ) recent`,
        [customerId]
    );
    const riskScore = Math.min(100, parseInt(result.rows[0].avg_risk, 10));
    await client.query('UPDATE customers SET risk_score = $1 WHERE customer_id = $2', [riskScore, customerId]);
    await client.query('INSERT INTO customer_risk_history (customer_id, risk_score) VALUES ($1, $2)', [
        customerId,
        riskScore,
    ]);
    return riskScore;
}

module.exports = { analyzeCustomerVelocity, analyzeRatingBias, updateCustomerRiskScore };
