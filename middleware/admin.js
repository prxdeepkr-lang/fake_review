// Role check only -- must run after authenticate(). The role always comes
// from the verified JWT payload, never from the request body/query.
function requireAdmin(req, res, next) {
    if (req.user?.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

module.exports = { requireAdmin };
