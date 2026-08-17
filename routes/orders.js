const express = require('express');
const { body, param } = require('express-validator');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const { validate } = require('../middleware/validation');

const router = express.Router();

// Create an order with one or more line items in a single transaction --
// either the whole order + all items are written, or nothing is.
router.post(
    '/',
    authenticate,
    [
        body('items').isArray({ min: 1 }),
        body('items.*.productId').isInt(),
        body('items.*.quantity').isInt({ gt: 0 }),
    ],
    validate,
    async (req, res, next) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const orderResult = await client.query(
                `INSERT INTO orders (customer_id, status) VALUES ($1, 'PLACED') RETURNING *`,
                [req.user.customerId]
            );
            const order = orderResult.rows[0];

            const items = [];
            for (const item of req.body.items) {
                const productResult = await client.query(
                    `SELECT product_id, price FROM products WHERE product_id = $1 AND status = 'ACTIVE'`,
                    [item.productId]
                );
                const product = productResult.rows[0];
                if (!product) {
                    throw Object.assign(new Error('Product not found or inactive'), { status: 400 });
                }

                const itemResult = await client.query(
                    `INSERT INTO order_items (order_id, product_id, quantity, price)
                     VALUES ($1, $2, $3, $4) RETURNING *`,
                    [order.order_id, product.product_id, item.quantity, product.price]
                );
                items.push(itemResult.rows[0]);
            }

            await client.query('COMMIT');
            res.status(201).json({ order: { ...order, items } });
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

router.get('/', authenticate, async (req, res, next) => {
    try {
        const result = await pool.query(
            `SELECT o.order_id, o.order_date, o.status,
                    COALESCE(json_agg(json_build_object(
                        'orderItemId', oi.order_item_id,
                        'productId', oi.product_id,
                        'productName', p.name,
                        'quantity', oi.quantity,
                        'price', oi.price
                    )) FILTER (WHERE oi.order_item_id IS NOT NULL), '[]') AS items
             FROM orders o
             LEFT JOIN order_items oi ON oi.order_id = o.order_id
             LEFT JOIN products p ON p.product_id = oi.product_id
             WHERE o.customer_id = $1
             GROUP BY o.order_id
             ORDER BY o.order_date DESC`,
            [req.user.customerId]
        );
        res.json({ orders: result.rows });
    } catch (err) {
        next(err);
    }
});

router.get('/:id', authenticate, [param('id').isInt()], validate, async (req, res, next) => {
    try {
        const result = await pool.query(
            `SELECT o.order_id, o.order_date, o.status, o.customer_id,
                    COALESCE(json_agg(json_build_object(
                        'orderItemId', oi.order_item_id,
                        'productId', oi.product_id,
                        'productName', p.name,
                        'quantity', oi.quantity,
                        'price', oi.price
                    )) FILTER (WHERE oi.order_item_id IS NOT NULL), '[]') AS items
             FROM orders o
             LEFT JOIN order_items oi ON oi.order_id = o.order_id
             LEFT JOIN products p ON p.product_id = oi.product_id
             WHERE o.order_id = $1
             GROUP BY o.order_id`,
            [req.params.id]
        );
        const order = result.rows[0];
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        if (order.customer_id !== req.user.customerId && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Not authorized to view this order' });
        }
        res.json({ order });
    } catch (err) {
        next(err);
    }
});

// Admin-only: advance order status (used to simulate delivery for the demo).
router.put(
    '/:id/status',
    authenticate,
    requireAdmin,
    [param('id').isInt(), body('status').isIn(['PLACED', 'DELIVERED', 'CANCELLED'])],
    validate,
    async (req, res, next) => {
        try {
            const result = await pool.query(
                `UPDATE orders SET status = $1 WHERE order_id = $2 RETURNING *`,
                [req.body.status, req.params.id]
            );
            if (!result.rows[0]) {
                return res.status(404).json({ error: 'Order not found' });
            }
            res.json({ order: result.rows[0] });
        } catch (err) {
            next(err);
        }
    }
);

// Customer requests a return on one of their own order items. Needed to
// demonstrate the "purchase -> review -> return" fraud pattern (section 12).
router.post(
    '/items/:orderItemId/return',
    authenticate,
    [param('orderItemId').isInt(), body('reason').optional().isString()],
    validate,
    async (req, res, next) => {
        try {
            const ownerCheck = await pool.query(
                `SELECT oi.order_item_id
                 FROM order_items oi
                 JOIN orders o ON o.order_id = oi.order_id
                 WHERE oi.order_item_id = $1 AND o.customer_id = $2`,
                [req.params.orderItemId, req.user.customerId]
            );
            if (!ownerCheck.rows[0]) {
                return res.status(404).json({ error: 'Order item not found' });
            }

            const result = await pool.query(
                `INSERT INTO returns (order_item_id, reason, status)
                 VALUES ($1, $2, 'APPROVED') RETURNING *`,
                [req.params.orderItemId, req.body.reason || null]
            );
            res.status(201).json({ return: result.rows[0] });
        } catch (err) {
            next(err);
        }
    }
);

module.exports = router;
