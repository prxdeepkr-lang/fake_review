const { WEIGHTS, THRESHOLDS } = require('../config/weights');

// Account age alone never proves fraud -- it's one weak-to-moderate signal
// combined with everything else in the fraud engine (spec section 19).
function analyzeAccount(customer) {
    const signals = [];
    const ageMs = Date.now() - new Date(customer.created_at).getTime();

    if (ageMs < THRESHOLDS.NEW_ACCOUNT_24H_MS) {
        signals.push({
            category: 'ACCOUNT',
            type: 'NEW_ACCOUNT',
            score: WEIGHTS.NEW_ACCOUNT_24H,
            details: 'Account is less than 24 hours old',
        });
    } else if (ageMs < THRESHOLDS.NEW_ACCOUNT_72H_MS) {
        signals.push({
            category: 'ACCOUNT',
            type: 'NEW_ACCOUNT',
            score: WEIGHTS.NEW_ACCOUNT_72H,
            details: 'Account is less than 72 hours old',
        });
    } else if (ageMs >= THRESHOLDS.ESTABLISHED_ACCOUNT_MS) {
        signals.push({
            category: 'ACCOUNT',
            type: 'ESTABLISHED_CUSTOMER',
            score: WEIGHTS.ESTABLISHED_CUSTOMER,
            details: 'Account is more than 30 days old',
        });
    }

    return signals;
}

module.exports = { analyzeAccount };
