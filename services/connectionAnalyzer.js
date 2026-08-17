const { WEIGHTS } = require('../config/weights');
const { hashIp } = require('../utils/normalization');
const { lookupIp } = require('./ipIntelligence');

// Basic, non-exhaustive header sanity checks. Deliberately conservative --
// headers are supporting evidence, never proof on their own (spec section 41).
function analyzeHeaders(headers, userAgent) {
    let anomalyScore = 0;
    const reasons = [];

    if (!userAgent) {
        anomalyScore += 5;
        reasons.push('missing User-Agent');
    } else if (/curl|python-requests|axios|bot|scrapy/i.test(userAgent)) {
        anomalyScore += 5;
        reasons.push('automated-client User-Agent string');
    }

    if (!headers['accept-language']) {
        anomalyScore += 3;
        reasons.push('missing Accept-Language');
    }

    if (!headers.accept) {
        anomalyScore += 2;
        reasons.push('missing Accept header');
    }

    return { anomalyScore: Math.min(anomalyScore, 10), reasons };
}

// req: an Express request. honeypotValue: the hidden form field's value,
// which a legitimate browser user never fills in (spec section 42).
// Returns both the fraud signals AND the raw evidence needed to persist a
// connection_signals row once a review_id exists (see recordConnectionSignals).
async function analyzeConnection({ req, honeypotValue }) {
    const signals = [];
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || '';

    const honeypotTriggered = !!honeypotValue;
    if (honeypotTriggered) {
        // Always applied at full weight regardless of category caps --
        // a filled honeypot field is decisive automation evidence.
        signals.push({
            category: 'CONNECTION',
            type: 'HONEYPOT_TRIGGERED',
            score: WEIGHTS.HONEYPOT_TRIGGERED,
            details: 'Hidden anti-bot field was submitted with a value',
        });
    }

    const ipInfo = await lookupIp(ip);
    const { anomalyScore: headerAnomalyScore, reasons: headerReasons } = analyzeHeaders(req.headers, userAgent);

    if (ipInfo.isTor) {
        signals.push({
            category: 'CONNECTION',
            type: 'TOR',
            score: WEIGHTS.TOR,
            details: 'Connection originates from a known Tor exit range',
        });
    } else if (ipInfo.isProxy) {
        signals.push({
            category: 'CONNECTION',
            type: 'PROXY',
            score: WEIGHTS.PROXY,
            details: `Connection appears to route through a proxy/datacenter (${ipInfo.isp})`,
        });
    } else if (ipInfo.isVpn) {
        signals.push({
            category: 'CONNECTION',
            type: 'VPN',
            score: WEIGHTS.VPN,
            details: `Connection appears to originate from a VPN provider (${ipInfo.isp})`,
        });
    }

    if (headerAnomalyScore > 0) {
        signals.push({
            category: 'CONNECTION',
            type: 'HEADER_ANOMALY',
            score: Math.min(WEIGHTS.HEADER_ANOMALY, headerAnomalyScore),
            details: `Unusual request headers: ${headerReasons.join(', ')}`,
        });
    }

    return {
        signals,
        evidence: { ipHash: hashIp(ip), ipInfo, userAgent, headerAnomalyScore, honeypotTriggered },
    };
}

// Persists the connection evidence once a review_id is known (a review must
// exist before connection_signals.review_id can reference it).
async function recordConnectionSignals(client, { customerId, reviewId, evidence, totalScore }) {
    const { ipHash, ipInfo, userAgent, headerAnomalyScore, honeypotTriggered } = evidence;
    await client.query(
        `INSERT INTO connection_signals
            (customer_id, review_id, ip_hash, isp, country, is_proxy, is_vpn, is_tor,
             risk_score, user_agent, header_anomaly_score, honeypot_triggered)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
            customerId,
            reviewId,
            ipHash,
            ipInfo.isp,
            ipInfo.country,
            ipInfo.isProxy,
            ipInfo.isVpn,
            ipInfo.isTor,
            totalScore,
            userAgent,
            headerAnomalyScore,
            honeypotTriggered,
        ]
    );
}

module.exports = { analyzeConnection, recordConnectionSignals, analyzeHeaders };
