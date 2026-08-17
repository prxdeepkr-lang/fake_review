const { WEIGHTS } = require('../config/weights');

// Backend-authoritative verified-purchase check -- the exact query from
// spec section 11. Never trust a client-supplied verifiedPurchase flag.
async function isVerifiedPurchase(client, customerId, productId) {
    const result = await client.query(
        `SELECT oi.order_item_id
         FROM orders o
         JOIN order_items oi ON o.order_id = oi.order_id
         LEFT JOIN returns r ON r.order_item_id = oi.order_item_id
         WHERE o.customer_id = $1
           AND oi.product_id = $2
           AND o.status = 'DELIVERED'
           AND r.return_id IS NULL`,
        [customerId, productId]
    );
    return result.rows.length > 0;
}

// Purchase/trust signals only ever reduce risk (spec sections 19, 29, 46).
async function analyzePurchase(client, customerId, productId, verifiedPurchase) {
    const signals = [];

    if (verifiedPurchase) {
        signals.push({
            category: 'PURCHASE',
            type: 'VERIFIED_PURCHASE',
            score: WEIGHTS.VERIFIED_PURCHASE,
            details: 'Customer has a delivered, non-returned order for this product',
        });
    }

    const historyResult = await client.query(
        `SELECT COUNT(*) FROM orders o
         JOIN order_items oi ON oi.order_id = o.order_id
         WHERE o.customer_id = $1 AND o.status = 'DELIVERED'`,
        [customerId]
    );
    const deliveredItemCount = parseInt(historyResult.rows[0].count, 10);
    if (deliveredItemCount >= 3) {
        signals.push({
            category: 'PURCHASE',
            type: 'LEGITIMATE_PURCHASE_HISTORY',
            score: WEIGHTS.LEGITIMATE_PURCHASE_HISTORY,
            details: `Customer has ${deliveredItemCount} delivered purchases across their account`,
        });
    }

    return signals;
}

module.exports = { isVerifiedPurchase, analyzePurchase };
