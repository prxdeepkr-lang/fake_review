const rateLimit = require('express-rate-limit');
const { THRESHOLDS } = require('../config/weights');

// All limits are enforced server-side and keyed by IP -- client-side
// throttling is never trusted (spec section 43). Disabled only under the
// automated test suite, which fires many requests per second from one IP
// by design; production/dev traffic always goes through these limits.
const skip = () => process.env.NODE_ENV === 'test';

const loginLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skip,
    message: { error: 'Too many login attempts, please try again later' },
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skip,
    message: { error: 'Too many registration attempts, please try again later' },
});

const reviewLimiter = rateLimit({
    windowMs: THRESHOLDS.REVIEW_RATE_LIMIT_WINDOW_MS,
    max: THRESHOLDS.REVIEW_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    skip,
    message: { error: 'Too many review submissions, please slow down' },
});

const adminLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    skip,
});

module.exports = { loginLimiter, registerLimiter, reviewLimiter, adminLimiter };
