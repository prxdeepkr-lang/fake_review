const express = require('express');
const { body, param } = require('express-validator');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { reviewLimiter } = require('../middleware/rateLimiter');
const { runFraudEngine } = require('../services/fraudEngine');
const { recordConnectionSignals } = require('../services/connectionAnalyzer');
const { updateCustomerRiskScore } = require('../services/customerAnalyzer');
const { updateSellerRiskScore } = require('../services/sellerAnalyzer');
const { toVectorLiteral } = require('../services/embeddingService');
const { THRESHOLDS } = require('../config/weights');

const router = express.Router();

// One DB transaction covers the entire submit-review workflow (spec
// section 49): verify -> duplicate check -> fraud analysis -> insert
// review + signals -> flag if high risk -> commit. Any failure rolls back
// so no partial fraud-analysis data is ever left behind.
router.post(
    '/reviews',
    authenticate,
    reviewLimiter,
    [
        body('productId').isInt(),
        body('rating').isInt({ min: 1, max: 5 }),
        body('reviewText').trim().isLength({ min: 1, max: 5000 }),
        // Honeypot field: a real browser user never fills this in. Never
        // trust any client-supplied verifiedPurchase or riskScore field --
        // those simply don't exist in this request schema.
        body('website').optional({ nullable: true }),
    ],
    validate,
    async (req, res, next) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const customerResult = await client.query('SELECT * FROM customers WHERE customer_id = $1', [
                req.user.customerId,
            ]);
            const customer = customerResult.rows[0];
            if (!customer) {
                throw Object.assign(new Error('Customer not found'), { status: 404 });
            }

            const productResult = await client.query(
                `SELECT p.*, s.seller_id, s.name AS seller_name, s.created_at AS seller_created_at
                 FROM products p JOIN sellers s ON s.seller_id = p.seller_id
                 WHERE p.product_id = $1`,
                [req.body.productId]
            );
            const product = productResult.rows[0];
            if (!product) {
                throw Object.assign(new Error('Product not found'), { status: 404 });
            }
            const seller = { seller_id: product.seller_id, name: product.seller_name };

            const engineResult = await runFraudEngine(client, {
                customer,
                product,
                seller,
                rating: req.body.rating,
                reviewText: req.body.reviewText,
                req,
                honeypotValue: req.body.website,
            });

            const visible = engineResult.level !== 'HIGH';

            let reviewResult;
            try {
                reviewResult = await client.query(
                    `INSERT INTO reviews
                        (customer_id, product_id, rating, review_text, verified_purchase, visible, risk_score, embedding)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector)
                     RETURNING *`,
                    [
                        customer.customer_id,
                        product.product_id,
                        req.body.rating,
                        req.body.reviewText,
                        engineResult.verifiedPurchase,
                        visible,
                        engineResult.score,
                        toVectorLiteral(engineResult.embedding),
                    ]
                );
            } catch (err) {
                if (err.code === '23505') {
                    throw Object.assign(new Error('You have already reviewed this product'), { status: 409 });
                }
                throw err;
            }
            const review = reviewResult.rows[0];

            for (const signal of engineResult.signals) {
                await client.query(
                    `INSERT INTO review_signals (review_id, category, signal_type, score, details)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [review.review_id, signal.category, signal.type, signal.score, signal.details]
                );
            }

            await recordConnectionSignals(client, {
                customerId: customer.customer_id,
                reviewId: review.review_id,
                evidence: engineResult.connectionEvidence,
                totalScore: engineResult.connectionEvidence
                    ? engineResult.signals.filter((s) => s.category === 'CONNECTION').reduce((sum, s) => sum + s.score, 0)
                    : 0,
            });

            if (engineResult.level === 'HIGH') {
                await client.query(
                    `INSERT INTO flagged_reviews (review_id, risk_score, flag_reason)
                     VALUES ($1, $2, $3)`,
                    [
                        review.review_id,
                        engineResult.score,
                        engineResult.signals
                            .filter((s) => s.score > 0)
                            .map((s) => s.type)
                            .join(', '),
                    ]
                );
            }

            await updateCustomerRiskScore(client, customer.customer_id);
            await updateSellerRiskScore(client, seller.seller_id);

            await client.query('COMMIT');

            const { embedding, ...reviewWithoutEmbedding } = review;
            res.status(201).json({
                review: reviewWithoutEmbedding,
                riskScore: engineResult.score,
                riskLevel: engineResult.level,
            });
        } catch (err) {
            await client.query('ROLLBACK');
            if (err.status) {
                return res.status(err.status).json({ error: err.message });
            }
            next(err);
        } finally {
            client.release();
        }
    }
);

// Public: only visible (non-flagged) reviews are ever returned.
router.get('/products/:id/reviews', [param('id').isInt()], validate, async (req, res, next) => {
    try {
        const result = await pool.query(
            `SELECT r.review_id, r.rating, r.review_text, r.verified_purchase, r.created_at,
                    c.name AS customer_name
             FROM reviews r
             JOIN customers c ON c.customer_id = r.customer_id
             WHERE r.product_id = $1 AND r.visible = TRUE
             ORDER BY r.created_at DESC`,
            [req.params.id]
        );
        res.json({ reviews: result.rows });
    } catch (err) {
        next(err);
    }
});

router.get('/reviews/my', authenticate, async (req, res, next) => {
    try {
        const result = await pool.query(
            `SELECT r.review_id, r.product_id, p.name AS product_name, r.rating, r.review_text,
                    r.verified_purchase, r.visible, r.risk_score, r.created_at
             FROM reviews r
             JOIN products p ON p.product_id = r.product_id
             WHERE r.customer_id = $1
             ORDER BY r.created_at DESC`,
            [req.user.customerId]
        );
        res.json({ reviews: result.rows });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
