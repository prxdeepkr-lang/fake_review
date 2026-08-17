const request = require('supertest');
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

beforeEach(truncateAll);
afterAll(async () => pool.end());

describe('authentication and authorization', () => {
    test('rejects login for a nonexistent user', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'nobody@test.com', password: 'whatever123' });
        expect(res.status).toBe(401);
    });

    test('rejects login with the wrong password', async () => {
        await request(app)
            .post('/api/auth/register')
            .send({ name: 'Real User', email: 'real@test.com', password: 'correctpass1' });

        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'real@test.com', password: 'wrongpass1' });
        expect(res.status).toBe(401);
    });

    test('rejects a customer calling an admin-only endpoint', async () => {
        const registerRes = await request(app)
            .post('/api/auth/register')
            .send({ name: 'Plain Customer', email: 'plain@test.com', password: 'password123' });
        const cookie = registerRes.headers['set-cookie'];

        const res = await request(app).post('/api/admin/sellers').set('Cookie', cookie).send({ name: 'New Seller' });
        expect(res.status).toBe(403);
    });

    test('allows an admin to call an admin-only endpoint', async () => {
        const hash = await require('bcrypt').hash('adminpass123', 10);
        await pool.query(
            `INSERT INTO customers (name, email, password_hash, role) VALUES ('Admin', 'admin@test.com', $1, 'ADMIN')`,
            [hash]
        );
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin@test.com', password: 'adminpass123' });
        const cookie = loginRes.headers['set-cookie'];

        const res = await request(app).post('/api/admin/sellers').set('Cookie', cookie).send({ name: 'New Seller' });
        expect(res.status).toBe(201);
    });

    test('rejects an unauthenticated request to a protected endpoint', async () => {
        const res = await request(app).get('/api/auth/me');
        expect(res.status).toBe(401);
    });
});
