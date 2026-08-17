const express = require('express');
const { body, param, query } = require('express-validator');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const { validate } = require('../middleware/validation');
const { adminLimiter } = require('../middleware/rateLimiter');

const router = express.Router();
router.use(authenticate, requireAdmin, adminLimiter);

// ---------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------
router.get('/orders', async (req, res, next) => {
    try {
        const result = await pool.query(
            `SELECT o.order_id, o.order_date, o.status, c.customer_id, c.name AS customer_name,
                    COALESCE(json_agg(json_build_object(
                        'orderItemId', oi.order_item_id,
                        'productId', oi.product_id,
                        'productName', p.name,
                        'quantity', oi.quantity,
                        'price', oi.price
                    )) FILTER (WHERE oi.order_item_id IS NOT NULL), '[]') AS items
             FROM orders o
             JOIN customers c ON c.customer_id = o.customer_id
             LEFT JOIN order_items oi ON oi.order_id = o.order_id
             LEFT JOIN products p ON p.product_id = oi.product_id
             GROUP BY o.order_id, c.customer_id, c.name
             ORDER BY o.order_date DESC`
        );
        res.json({ orders: result.rows });
    } catch (err) {
        next(err);
    }
});

router.put(
    '/orders/:id/status',
    [param('id').isInt(), body('status').isIn(['PLACED', 'DELIVERED', 'CANCELLED'])],
    validate,
    async (req, res, next) => {
        try {
            const result = await pool.query(`UPDATE orders SET status = $1 WHERE order_id = $2 RETURNING *`, [
                req.body.status,
                req.params.id,
            ]);
            if (!result.rows[0]) {
                return res.status(404).json({ error: 'Order not found' });
            }
            res.json({ order: result.rows[0] });
        } catch (err) {
            next(err);
        }
    }
);

// ---------------------------------------------------------------------
// Sellers
// ---------------------------------------------------------------------
router.post('/sellers', [body('name').trim().isLength({ min: 1, max: 150 })], validate, async (req, res, next) => {
    try {
        const result = await pool.query('INSERT INTO sellers (name) VALUES ($1) RETURNING *', [req.body.name]);
        res.status(201).json({ seller: result.rows[0] });
    } catch (err) {
        next(err);
    }
});

router.get('/sellers', async (req, res, next) => {
    try {
        const sortMap = {
            fraud_index: 'fraud_index DESC NULLS LAST',
            flagged_reviews: 'flagged_reviews DESC',
            total_reviews: 'total_reviews DESC',
        };
        const orderBy = sortMap[req.query.sort] || 's.seller_id';
        const result = await pool.query(
            `SELECT * FROM seller_fraud_summary s ORDER BY ${orderBy}`
        );
        res.json({ sellers: result.rows });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------
router.get('/customers', async (req, res, next) => {
    try {
        const result = await pool.query(
            `SELECT * FROM customer_review_summary ORDER BY risk_score DESC, customer_id`
        );
        res.json({ customers: result.rows });
    } catch (err) {
        next(err);
    }
});

router.get('/customers/risk', async (req, res, next) => {
    try {
        const result = await pool.query(
            `SELECT * FROM customer_review_summary WHERE risk_score > 0 ORDER BY risk_score DESC`
        );
        res.json({ customers: result.rows });
    } catch (err) {
        next(err);
    }
});

// Full explainable breakdown for one customer: profile, every review with
// its own risk score, and every signal type that has contributed across
// their review history, aggregated so an admin can see the overall pattern
// (e.g. "NEW_ACCOUNT fired once, EXACT_DUPLICATE fired twice") without
// having to open each review individually. Registered after the more
// specific /customers/risk route so "risk" is never captured as an :id.
router.get('/customers/:id', [param('id').isInt()], validate, async (req, res, next) => {
    try {
        const customerResult = await pool.query(`SELECT * FROM customer_review_summary WHERE customer_id = $1`, [
            req.params.id,
        ]);
        const customer = customerResult.rows[0];
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        const reviewsResult = await pool.query(
            `SELECT r.review_id, r.product_id, p.name AS product_name, r.rating, r.review_text,
                    r.verified_purchase, r.visible, r.risk_score, r.created_at,
                    fr.flagged_id, fr.resolution
             FROM reviews r
             JOIN products p ON p.product_id = r.product_id
             LEFT JOIN flagged_reviews fr ON fr.review_id = r.review_id
             WHERE r.customer_id = $1
             ORDER BY r.created_at DESC`,
            [req.params.id]
        );

        const signalSummaryResult = await pool.query(
            `SELECT rs.category, rs.signal_type, COUNT(*) AS occurrences,
                    SUM(rs.score) AS total_score, ROUND(AVG(rs.score)) AS avg_score
             FROM review_signals rs
             JOIN reviews r ON r.review_id = rs.review_id
             WHERE r.customer_id = $1
             GROUP BY rs.category, rs.signal_type
             ORDER BY total_score DESC`,
            [req.params.id]
        );

        const historyResult = await pool.query(
            `SELECT risk_score, calculated_at FROM customer_risk_history
             WHERE customer_id = $1 ORDER BY calculated_at DESC LIMIT 20`,
            [req.params.id]
        );

        res.json({
            customer,
            reviews: reviewsResult.rows,
            signalSummary: signalSummaryResult.rows,
            riskHistory: historyResult.rows,
        });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------
// Suspicious phrases
// ---------------------------------------------------------------------
router.get('/phrases', async (req, res, next) => {
    try {
        const result = await pool.query('SELECT * FROM suspicious_phrases ORDER BY phrase_id');
        res.json({ phrases: result.rows });
    } catch (err) {
        next(err);
    }
});

router.post(
    '/phrases',
    [body('phrase').trim().isLength({ min: 1, max: 200 }), body('weight').isInt({ min: 1, max: 50 })],
    validate,
    async (req, res, next) => {
        try {
            const result = await pool.query(
                'INSERT INTO suspicious_phrases (phrase, weight) VALUES ($1, $2) RETURNING *',
                [req.body.phrase.toLowerCase(), req.body.weight]
            );
            res.status(201).json({ phrase: result.rows[0] });
        } catch (err) {
            if (err.code === '23505') {
                return res.status(409).json({ error: 'Phrase already exists' });
            }
            next(err);
        }
    }
);

router.delete('/phrases/:id', [param('id').isInt()], validate, async (req, res, next) => {
    try {
        await pool.query('DELETE FROM suspicious_phrases WHERE phrase_id = $1', [req.params.id]);
        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------
// Reviews / flagged reviews
// ---------------------------------------------------------------------
router.get('/reviews/flagged', async (req, res, next) => {
    try {
        const result = await pool.query(
            `SELECT fr.flagged_id, fr.review_id, fr.risk_score, fr.flag_reason, fr.flagged_at, fr.resolution,
                    r.rating, r.review_text, r.created_at AS review_created_at,
                    c.customer_id, c.name AS customer_name,
                    p.product_id, p.name AS product_name, s.seller_id, s.name AS seller_name
             FROM flagged_reviews fr
             JOIN reviews r ON r.review_id = fr.review_id
             JOIN customers c ON c.customer_id = r.customer_id
             JOIN products p ON p.product_id = r.product_id
             JOIN sellers s ON s.seller_id = p.seller_id
             ORDER BY fr.flagged_at DESC`
        );
        res.json({ flaggedReviews: result.rows });
    } catch (err) {
        next(err);
    }
});

// Full explainable breakdown for one review: every signal grouped by
// category, plus connection evidence (spec section 53).
router.get('/reviews/:id', [param('id').isInt()], validate, async (req, res, next) => {
    try {
        const reviewResult = await pool.query(
            `SELECT r.review_id, r.rating, r.review_text, r.verified_purchase, r.visible,
                    r.risk_score, r.created_at,
                    c.customer_id, c.name AS customer_name,
                    p.product_id, p.name AS product_name, s.seller_id, s.name AS seller_name,
                    fr.flagged_id, fr.resolution, fr.flag_reason
             FROM reviews r
             JOIN customers c ON c.customer_id = r.customer_id
             JOIN products p ON p.product_id = r.product_id
             JOIN sellers s ON s.seller_id = p.seller_id
             LEFT JOIN flagged_reviews fr ON fr.review_id = r.review_id
             WHERE r.review_id = $1`,
            [req.params.id]
        );
        const review = reviewResult.rows[0];
        if (!review) {
            return res.status(404).json({ error: 'Review not found' });
        }

        const signalsResult = await pool.query(
            `SELECT category, signal_type, score, details, created_at
             FROM review_signals WHERE review_id = $1 ORDER BY category, signal_id`,
            [req.params.id]
        );
        const signalsByCategory = {};
        for (const signal of signalsResult.rows) {
            signalsByCategory[signal.category] = signalsByCategory[signal.category] || [];
            signalsByCategory[signal.category].push(signal);
        }

        const connectionResult = await pool.query(
            `SELECT isp, country, is_proxy, is_vpn, is_tor, risk_score, user_agent,
                    header_anomaly_score, honeypot_triggered, created_at
             FROM connection_signals WHERE review_id = $1`,
            [req.params.id]
        );

        const riskLevel = review.risk_score >= 60 ? 'HIGH' : review.risk_score >= 30 ? 'MEDIUM' : 'LOW';

        res.json({
            review,
            riskLevel,
            signalsByCategory,
            connectionEvidence: connectionResult.rows[0] || null,
        });
    } catch (err) {
        next(err);
    }
});

router.post('/reviews/:id/approve', [param('id').isInt()], validate, async (req, res, next) => {
    try {
        const result = await pool.query(
            `UPDATE flagged_reviews SET resolution = 'APPROVED', reviewed_by = $1, resolved_at = NOW()
             WHERE review_id = $2 RETURNING *`,
            [req.user.customerId, req.params.id]
        );
        if (!result.rows[0]) {
            return res.status(404).json({ error: 'Flagged review not found' });
        }
        await pool.query('UPDATE reviews SET visible = TRUE WHERE review_id = $1', [req.params.id]);
        res.json({ flaggedReview: result.rows[0] });
    } catch (err) {
        next(err);
    }
});

router.post('/reviews/:id/remove', [param('id').isInt()], validate, async (req, res, next) => {
    try {
        const result = await pool.query(
            `UPDATE flagged_reviews SET resolution = 'REMOVED', reviewed_by = $1, resolved_at = NOW()
             WHERE review_id = $2 RETURNING *`,
            [req.user.customerId, req.params.id]
        );
        if (!result.rows[0]) {
            return res.status(404).json({ error: 'Flagged review not found' });
        }
        await pool.query('UPDATE reviews SET visible = FALSE WHERE review_id = $1', [req.params.id]);
        res.json({ flaggedReview: result.rows[0] });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------
router.get('/dashboard', async (req, res, next) => {
    try {
        const [customers, sellers, products, reviews, flagged, highRiskCustomers, highRiskSellers, activity] =
            await Promise.all([
                pool.query('SELECT COUNT(*) FROM customers'),
                pool.query('SELECT COUNT(*) FROM sellers'),
                pool.query('SELECT COUNT(*) FROM products'),
                pool.query('SELECT COUNT(*) FROM reviews'),
                pool.query("SELECT COUNT(*) FROM flagged_reviews WHERE resolution = 'PENDING'"),
                pool.query('SELECT COUNT(*) FROM customers WHERE risk_score >= 60'),
                pool.query('SELECT COUNT(*) FROM sellers WHERE risk_score >= 60'),
                pool.query(
                    `SELECT DATE(created_at) AS day, COUNT(*) AS review_count
                     FROM reviews GROUP BY DATE(created_at) ORDER BY day DESC LIMIT 14`
                ),
            ]);

        const totalReviews = parseInt(reviews.rows[0].count, 10);
        const flagRate = totalReviews > 0 ? (parseInt(flagged.rows[0].count, 10) / totalReviews) * 100 : 0;

        const topSellers = await pool.query(
            `SELECT * FROM seller_fraud_summary ORDER BY fraud_index DESC NULLS LAST LIMIT 5`
        );
        const recentFlagged = await pool.query(
            `SELECT fr.flagged_id, fr.review_id, fr.risk_score, fr.flag_reason, fr.flagged_at, fr.resolution,
                    c.name AS customer_name, p.name AS product_name
             FROM flagged_reviews fr
             JOIN reviews r ON r.review_id = fr.review_id
             JOIN customers c ON c.customer_id = r.customer_id
             JOIN products p ON p.product_id = r.product_id
             ORDER BY fr.flagged_at DESC LIMIT 10`
        );
        const suspiciousCustomers = await pool.query(
            `SELECT * FROM customer_review_summary WHERE risk_score > 0 ORDER BY risk_score DESC LIMIT 10`
        );

        res.json({
            totals: {
                customers: parseInt(customers.rows[0].count, 10),
                sellers: parseInt(sellers.rows[0].count, 10),
                products: parseInt(products.rows[0].count, 10),
                reviews: totalReviews,
                flaggedPending: parseInt(flagged.rows[0].count, 10),
                flagRate: Math.round(flagRate * 100) / 100,
                highRiskCustomers: parseInt(highRiskCustomers.rows[0].count, 10),
                highRiskSellers: parseInt(highRiskSellers.rows[0].count, 10),
            },
            topSuspiciousSellers: topSellers.rows,
            recentFlaggedReviews: recentFlagged.rows,
            mostSuspiciousCustomers: suspiciousCustomers.rows,
            reviewActivity: activity.rows,
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
