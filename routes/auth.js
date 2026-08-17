const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const pool = require('../db/pool');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimiter');

const router = express.Router();
const BCRYPT_ROUNDS = 12;
const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 };

function signToken(customer) {
    return jwt.sign(
        { customerId: customer.customer_id, role: customer.role, name: customer.name },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
}

function publicCustomer(customer) {
    const { password_hash, ...rest } = customer;
    return rest;
}

router.post(
    '/register',
    registerLimiter,
    [
        body('name').trim().isLength({ min: 1, max: 150 }),
        body('email').isEmail().normalizeEmail(),
        body('password').isLength({ min: 8 }),
    ],
    validate,
    async (req, res, next) => {
        try {
            const { name, email, password } = req.body;
            const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

            // role is NEVER taken from the request body -- always CUSTOMER
            // on self-registration. Admins are provisioned separately (seed
            // data / direct DB update), never via this public endpoint.
            const result = await pool.query(
                `INSERT INTO customers (name, email, password_hash, role)
                 VALUES ($1, $2, $3, 'CUSTOMER')
                 RETURNING customer_id, name, email, role, created_at, risk_score, account_status`,
                [name, email, passwordHash]
            );

            const customer = result.rows[0];
            const token = signToken(customer);
            res.cookie('token', token, COOKIE_OPTS);
            res.status(201).json({ customer, token });
        } catch (err) {
            if (err.code === '23505') {
                return res.status(409).json({ error: 'Email already registered' });
            }
            next(err);
        }
    }
);

router.post(
    '/login',
    loginLimiter,
    [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
    validate,
    async (req, res, next) => {
        try {
            const { email, password } = req.body;
            const result = await pool.query('SELECT * FROM customers WHERE email = $1', [email]);
            const customer = result.rows[0];

            if (!customer) {
                return res.status(401).json({ error: 'Invalid email or password' });
            }
            if (customer.account_status !== 'ACTIVE') {
                return res.status(403).json({ error: 'Account is not active' });
            }

            const match = await bcrypt.compare(password, customer.password_hash);
            if (!match) {
                return res.status(401).json({ error: 'Invalid email or password' });
            }

            const token = signToken(customer);
            res.cookie('token', token, COOKIE_OPTS);
            res.json({ customer: publicCustomer(customer), token });
        } catch (err) {
            next(err);
        }
    }
);

router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out' });
});

router.get('/me', authenticate, async (req, res, next) => {
    try {
        const result = await pool.query(
            'SELECT customer_id, name, email, role, created_at, risk_score, account_status FROM customers WHERE customer_id = $1',
            [req.user.customerId]
        );
        if (!result.rows[0]) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        res.json({ customer: result.rows[0] });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
