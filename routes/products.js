const express = require('express');
const { body, param } = require('express-validator');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const { validate } = require('../middleware/validation');

const router = express.Router();

// Public: list active products with seller name and average rating.
router.get('/', async (req, res, next) => {
    try {
        const result = await pool.query(
            `SELECT p.product_id, p.name, p.description, p.price, p.status, p.created_at,
                    s.seller_id, s.name AS seller_name,
                    ROUND(AVG(r.rating) FILTER (WHERE r.visible)::NUMERIC, 2) AS avg_rating,
                    COUNT(r.review_id) FILTER (WHERE r.visible) AS review_count
             FROM products p
             JOIN sellers s ON s.seller_id = p.seller_id
             LEFT JOIN reviews r ON r.product_id = p.product_id
             WHERE p.status = 'ACTIVE'
             GROUP BY p.product_id, s.seller_id, s.name
             ORDER BY p.created_at DESC`
        );
        res.json({ products: result.rows });
    } catch (err) {
        next(err);
    }
});

router.get('/:id', [param('id').isInt()], validate, async (req, res, next) => {
    try {
        const result = await pool.query(
            `SELECT p.product_id, p.name, p.description, p.price, p.status, p.created_at,
                    s.seller_id, s.name AS seller_name,
                    ROUND(AVG(r.rating) FILTER (WHERE r.visible)::NUMERIC, 2) AS avg_rating,
                    COUNT(r.review_id) FILTER (WHERE r.visible) AS review_count
             FROM products p
             JOIN sellers s ON s.seller_id = p.seller_id
             LEFT JOIN reviews r ON r.product_id = p.product_id
             WHERE p.product_id = $1
             GROUP BY p.product_id, s.seller_id, s.name`,
            [req.params.id]
        );
        if (!result.rows[0]) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json({ product: result.rows[0] });
    } catch (err) {
        next(err);
    }
});

router.post(
    '/',
    authenticate,
    requireAdmin,
    [
        body('sellerId').isInt(),
        body('name').trim().isLength({ min: 1, max: 200 }),
        body('description').optional({ nullable: true }).isString(),
        body('price').isFloat({ gt: 0 }),
    ],
    validate,
    async (req, res, next) => {
        try {
            const { sellerId, name, description, price } = req.body;
            const result = await pool.query(
                `INSERT INTO products (seller_id, name, description, price)
                 VALUES ($1, $2, $3, $4) RETURNING *`,
                [sellerId, name, description || null, price]
            );
            res.status(201).json({ product: result.rows[0] });
        } catch (err) {
            if (err.code === '23503') {
                return res.status(400).json({ error: 'Seller does not exist' });
            }
            next(err);
        }
    }
);

router.put(
    '/:id',
    authenticate,
    requireAdmin,
    [
        param('id').isInt(),
        body('name').optional().trim().isLength({ min: 1, max: 200 }),
        body('description').optional({ nullable: true }).isString(),
        body('price').optional().isFloat({ gt: 0 }),
        body('status').optional().isIn(['ACTIVE', 'INACTIVE']),
    ],
    validate,
    async (req, res, next) => {
        try {
            const { name, description, price, status } = req.body;
            const result = await pool.query(
                `UPDATE products
                 SET name = COALESCE($1, name),
                     description = COALESCE($2, description),
                     price = COALESCE($3, price),
                     status = COALESCE($4, status)
                 WHERE product_id = $5
                 RETURNING *`,
                [name, description, price, status, req.params.id]
            );
            if (!result.rows[0]) {
                return res.status(404).json({ error: 'Product not found' });
            }
            res.json({ product: result.rows[0] });
        } catch (err) {
            next(err);
        }
    }
);

// "Delete" deactivates rather than hard-deletes, per spec section 6.
router.delete('/:id', authenticate, requireAdmin, [param('id').isInt()], validate, async (req, res, next) => {
    try {
        const result = await pool.query(
            `UPDATE products SET status = 'INACTIVE' WHERE product_id = $1 RETURNING *`,
            [req.params.id]
        );
        if (!result.rows[0]) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json({ product: result.rows[0] });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
