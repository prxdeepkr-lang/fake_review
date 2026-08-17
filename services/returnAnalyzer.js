const { WEIGHTS } = require('../config/weights');

// Detects "purchase -> verified review -> later return" (spec section 12).
// This never happens at review-creation time for the review itself (the
// return hasn't occurred yet), but a *prior* review on this product whose
// underlying order item has since been returned should carry the signal
// when re-scored, and new reviews check whether earlier order items for
// this product/customer pair were already returned before this review.
async function analyzeReturn(client, customerId, productId) {
    const signals = [];

    const result = await client.query(
        `SELECT r.return_id
         FROM order_items oi
         JOIN orders o ON o.order_id = oi.order_id
         JOIN returns r ON r.order_item_id = oi.order_item_id
         WHERE o.customer_id = $1 AND oi.product_id = $2`,
        [customerId, productId]
    );

    if (result.rows.length > 0) {
        signals.push({
            category: 'BEHAVIOR',
            type: 'RETURN_AFTER_REVIEW',
            score: WEIGHTS.RETURN_AFTER_REVIEW,
            details: 'Customer returned a purchased unit of this product',
        });
    }

    return signals;
}

module.exports = { analyzeReturn };
