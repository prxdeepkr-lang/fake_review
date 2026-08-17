const { CATEGORY_CAPS, THRESHOLDS } = require('../config/weights');

function clamp(score) {
    return Math.max(0, Math.min(Math.round(score), 100));
}

function riskLevel(score) {
    if (score >= THRESHOLDS.HIGH) return 'HIGH';
    if (score >= THRESHOLDS.MEDIUM) return 'MEDIUM';
    return 'LOW';
}

// Combines signals from every analyzer into one explainable score.
// Signals carry a `category` so we can cap each category's contribution
// before summing -- this stops e.g. VPN+Proxy+HostingISP from stacking
// past the connection category's ceiling, per spec section 48.
function combineSignals(signalGroups) {
    const allSignals = signalGroups.flat();

    // HONEYPOT_TRIGGERED is decisive automation evidence and always applies
    // at full weight, bypassing the CONNECTION category cap (spec section 42).
    const uncapped = allSignals.filter((s) => s.type === 'HONEYPOT_TRIGGERED');
    const cappable = allSignals.filter((s) => s.type !== 'HONEYPOT_TRIGGERED');

    const byCategory = {};
    for (const signal of cappable) {
        byCategory[signal.category] = byCategory[signal.category] || [];
        byCategory[signal.category].push(signal);
    }

    let total = uncapped.reduce((sum, s) => sum + s.score, 0);
    for (const [category, signals] of Object.entries(byCategory)) {
        const rawSum = signals.reduce((sum, s) => sum + s.score, 0);
        const cap = CATEGORY_CAPS[category];
        let capped = rawSum;
        if (cap !== undefined) {
            capped = cap < 0
                ? Math.max(rawSum, cap) // floor for PURCHASE (negative cap)
                : Math.min(rawSum, cap); // ceiling for everything else
        }
        total += capped;
    }

    const score = clamp(total);

    // A filled honeypot field is near-decisive bot evidence on its own --
    // force HIGH/hidden regardless of where the raw sum lands, while still
    // reporting the real numeric score for transparency (spec section 42).
    const honeypotTriggered = uncapped.length > 0;
    const level = honeypotTriggered ? 'HIGH' : riskLevel(score);

    return { score, level, signals: allSignals };
}

module.exports = { clamp, riskLevel, combineSignals };
