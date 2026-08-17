const { validationResult } = require('express-validator');

// Runs after an array of express-validator checks; short-circuits with a
// 400 listing every failed field instead of letting bad data reach a
// service/query.
function validate(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
}

module.exports = { validate };
