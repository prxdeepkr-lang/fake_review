const jwt = require('jsonwebtoken');

// Verifies the JWT (from httpOnly cookie or Authorization header) and
// attaches the decoded payload to req.user. Never trusts a client-supplied
// role/customerId outside of this token.
function authenticate(req, res, next) {
    const bearer = req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : null;
    const token = req.cookies?.token || bearer;

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired session' });
    }
}

module.exports = { authenticate };
