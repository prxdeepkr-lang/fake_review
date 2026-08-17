const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../server');
const pool = require('../db/pool');

async function truncateAll() {
    await pool.query(`
        TRUNCATE customer_risk_history, seller_risk_history, connection_signals,
                 review_signals, flagged_reviews, reviews, returns, order_items,
                 orders, products, sellers, customers, suspicious_phrases
        RESTART IDENTITY CASCADE
    `);
}

async function registerAndLogin(email, name = 'Test User', ageMs = 0) {
    const res = await request(app).post('/api/auth/register').send({ name, email, password: 'password123' });
    if (ageMs > 0) {
        await pool.query('UPDATE customers SET created_at = NOW() - ($1 || \' milliseconds\')::INTERVAL WHERE customer_id = $2', [
            ageMs,
            res.body.customer.customer_id,
        ]);
    }
    return res.headers['set-cookie'];
}

async function seedSellerAndProduct() {
    const seller = await pool.query(`INSERT INTO sellers (name) VALUES ('Seller') RETURNING seller_id`);
    const product = await pool.query(
        `INSERT INTO products (seller_id, name, price) VALUES ($1, 'Product', 20) RETURNING product_id`,
        [seller.rows[0].seller_id]
    );
    return { sellerId: seller.rows[0].seller_id, productId: product.rows[0].product_id };
}

beforeEach(truncateAll);
afterAll(async () => pool.end());

describe('fraud engine scenarios', () => {
    test('a brand-new account submitting a review picks up a NEW_ACCOUNT signal', async () => {
        const cookie = await registerAndLogin('newacct@test.com');
        const { productId } = await seedSellerAndProduct();

        const res = await request(app)
            .post('/api/reviews')
            .set('Cookie', cookie)
            .send({ productId, rating: 4, reviewText: 'This product works fine for everyday use, no complaints so far.' });

        expect(res.status).toBe(201);
        const signals = await pool.query(
            `SELECT signal_type FROM review_signals WHERE review_id = $1`,
            [res.body.review.review_id]
        );
        expect(signals.rows.map((r) => r.signal_type)).toContain('NEW_ACCOUNT');
    });

    test('an exact duplicate from a new account is caught as an explainable EXACT_DUPLICATE signal', async () => {
        // Duplicate text + new account alone lands at MEDIUM ("publish but
        // monitor"), not an automatic HIGH/hidden flag -- category caps and
        // the multi-signal design intentionally avoid overreacting to a
        // single strong-ish signal in isolation (spec sections 46, 69).
        const { productId } = await seedSellerAndProduct();
        const cookieA = await registerAndLogin('origauthor@test.com');
        await request(app)
            .post('/api/reviews')
            .set('Cookie', cookieA)
            .send({ productId, rating: 5, reviewText: 'This is a fantastic product that exceeded my expectations entirely.' });

        const cookieB = await registerAndLogin('copycat@test.com');
        const res = await request(app)
            .post('/api/reviews')
            .set('Cookie', cookieB)
            .send({ productId, rating: 5, reviewText: 'This is a fantastic product that exceeded my expectations entirely.' });

        expect(res.status).toBe(201);
        expect(res.body.riskLevel).toBe('MEDIUM');

        const signals = await pool.query('SELECT signal_type FROM review_signals WHERE review_id = $1', [
            res.body.review.review_id,
        ]);
        expect(signals.rows.map((r) => r.signal_type)).toContain('EXACT_DUPLICATE');
    });

    test('a verified purchase reduces risk score and sets verified_purchase = true', async () => {
        const cookie = await registerAndLogin('verified@test.com', 'Verified Buyer', 60 * 24 * 60 * 60 * 1000);
        const { productId } = await seedSellerAndProduct();

        const customerRes = await request(app).get('/api/auth/me').set('Cookie', cookie);
        const customerId = customerRes.body.customer.customer_id;

        const order = await pool.query(
            `INSERT INTO orders (customer_id, status) VALUES ($1, 'DELIVERED') RETURNING order_id`,
            [customerId]
        );
        await pool.query(`INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, 1, 20)`, [
            order.rows[0].order_id,
            productId,
        ]);

        const res = await request(app)
            .post('/api/reviews')
            .set('Cookie', cookie)
            .send({ productId, rating: 5, reviewText: 'Solid purchase, works exactly as advertised and arrived on time.' });

        expect(res.status).toBe(201);
        expect(res.body.review.verified_purchase).toBe(true);
        expect(res.body.riskLevel).toBe('LOW');
    });

    test('returning a purchased product after reviewing it adds a RETURN_AFTER_REVIEW-eligible signal', async () => {
        const cookie = await registerAndLogin('returner@test.com');
        const { productId } = await seedSellerAndProduct();

        const customerRes = await request(app).get('/api/auth/me').set('Cookie', cookie);
        const customerId = customerRes.body.customer.customer_id;

        const order = await pool.query(
            `INSERT INTO orders (customer_id, status) VALUES ($1, 'DELIVERED') RETURNING order_id`,
            [customerId]
        );
        const item = await pool.query(
            `INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, 1, 20) RETURNING order_item_id`,
            [order.rows[0].order_id, productId]
        );
        await pool.query(`INSERT INTO returns (order_item_id, status) VALUES ($1, 'APPROVED')`, [
            item.rows[0].order_item_id,
        ]);

        const res = await request(app)
            .post('/api/reviews')
            .set('Cookie', cookie)
            .send({ productId, rating: 3, reviewText: 'It was okay but I ended up returning it for a different reason.' });

        const signals = await pool.query('SELECT signal_type FROM review_signals WHERE review_id = $1', [
            res.body.review.review_id,
        ]);
        expect(signals.rows.map((r) => r.signal_type)).toContain('RETURN_AFTER_REVIEW');
        // A returned unit means the purchase is no longer "eligible" -- not verified.
        expect(res.body.review.verified_purchase).toBe(false);
    });

    test('a triggered honeypot field forces a HIGH risk, hidden review', async () => {
        const cookie = await registerAndLogin('bot@test.com');
        const { productId } = await seedSellerAndProduct();

        const res = await request(app)
            .post('/api/reviews')
            .set('Cookie', cookie)
            .send({
                productId,
                rating: 5,
                reviewText: 'A perfectly normal-looking review with nothing unusual about the text itself.',
                website: 'http://spam.example.com',
            });

        expect(res.status).toBe(201);
        expect(res.body.riskLevel).toBe('HIGH');
        const stored = await pool.query('SELECT visible FROM reviews WHERE review_id = $1', [res.body.review.review_id]);
        expect(stored.rows[0].visible).toBe(false);
    });
});
