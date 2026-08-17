const pool = require('../db/pool');

async function truncateAll() {
    await pool.query(`
        TRUNCATE customer_risk_history, seller_risk_history, connection_signals,
                 review_signals, flagged_reviews, reviews, returns, order_items,
                 orders, products, sellers, customers, suspicious_phrases
        RESTART IDENTITY CASCADE
    `);
}

beforeEach(truncateAll);
afterAll(async () => pool.end());

describe('database constraints', () => {
    test('rejects duplicate customer email', async () => {
        await pool.query(
            `INSERT INTO customers (name, email, password_hash) VALUES ('A', 'dup@test.com', 'hash')`
        );
        await expect(
            pool.query(`INSERT INTO customers (name, email, password_hash) VALUES ('B', 'dup@test.com', 'hash')`)
        ).rejects.toMatchObject({ code: '23505' });
    });

    test('rejects a second review by the same customer for the same product', async () => {
        const customer = await pool.query(
            `INSERT INTO customers (name, email, password_hash) VALUES ('C', 'c@test.com', 'hash') RETURNING customer_id`
        );
        const seller = await pool.query(`INSERT INTO sellers (name) VALUES ('S') RETURNING seller_id`);
        const product = await pool.query(
            `INSERT INTO products (seller_id, name, price) VALUES ($1, 'P', 10) RETURNING product_id`,
            [seller.rows[0].seller_id]
        );
        const customerId = customer.rows[0].customer_id;
        const productId = product.rows[0].product_id;

        await pool.query(
            `INSERT INTO reviews (customer_id, product_id, rating, review_text) VALUES ($1, $2, 5, 'Great')`,
            [customerId, productId]
        );
        await expect(
            pool.query(
                `INSERT INTO reviews (customer_id, product_id, rating, review_text) VALUES ($1, $2, 4, 'Again')`,
                [customerId, productId]
            )
        ).rejects.toMatchObject({ code: '23505' });
    });

    test('rejects a rating outside 1-5', async () => {
        const customer = await pool.query(
            `INSERT INTO customers (name, email, password_hash) VALUES ('D', 'd@test.com', 'hash') RETURNING customer_id`
        );
        const seller = await pool.query(`INSERT INTO sellers (name) VALUES ('S2') RETURNING seller_id`);
        const product = await pool.query(
            `INSERT INTO products (seller_id, name, price) VALUES ($1, 'P2', 10) RETURNING product_id`,
            [seller.rows[0].seller_id]
        );
        await expect(
            pool.query(
                `INSERT INTO reviews (customer_id, product_id, rating, review_text) VALUES ($1, $2, 6, 'Bad rating')`,
                [customer.rows[0].customer_id, product.rows[0].product_id]
            )
        ).rejects.toMatchObject({ code: '23514' });
    });

    test('rejects an order_item referencing a nonexistent product', async () => {
        const customer = await pool.query(
            `INSERT INTO customers (name, email, password_hash) VALUES ('E', 'e@test.com', 'hash') RETURNING customer_id`
        );
        const order = await pool.query(`INSERT INTO orders (customer_id) VALUES ($1) RETURNING order_id`, [
            customer.rows[0].customer_id,
        ]);
        await expect(
            pool.query(
                `INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, 999999, 1, 10)`,
                [order.rows[0].order_id]
            )
        ).rejects.toMatchObject({ code: '23503' });
    });

    test('rejects a non-positive order item quantity', async () => {
        const customer = await pool.query(
            `INSERT INTO customers (name, email, password_hash) VALUES ('F', 'f@test.com', 'hash') RETURNING customer_id`
        );
        const seller = await pool.query(`INSERT INTO sellers (name) VALUES ('S3') RETURNING seller_id`);
        const product = await pool.query(
            `INSERT INTO products (seller_id, name, price) VALUES ($1, 'P3', 10) RETURNING product_id`,
            [seller.rows[0].seller_id]
        );
        const order = await pool.query(`INSERT INTO orders (customer_id) VALUES ($1) RETURNING order_id`, [
            customer.rows[0].customer_id,
        ]);
        await expect(
            pool.query(
                `INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, 0, 10)`,
                [order.rows[0].order_id, product.rows[0].product_id]
            )
        ).rejects.toMatchObject({ code: '23514' });
    });

    test('rejects a non-positive product price', async () => {
        const seller = await pool.query(`INSERT INTO sellers (name) VALUES ('S4') RETURNING seller_id`);
        await expect(
            pool.query(`INSERT INTO products (seller_id, name, price) VALUES ($1, 'Free', 0)`, [
                seller.rows[0].seller_id,
            ])
        ).rejects.toMatchObject({ code: '23514' });
    });
});
