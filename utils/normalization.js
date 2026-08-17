const crypto = require('crypto');

// Lowercase, trim, and collapse whitespace so trivially reformatted text
// ("Great product!!!" vs "great product!!!") is recognized as identical.
function normalizeText(text) {
    return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

function hashText(text) {
    return crypto.createHash('sha256').update(normalizeText(text)).digest('hex');
}

// Never store raw IPs -- only a hash, per spec section 15.
function hashIp(ip) {
    return crypto.createHash('sha256').update(ip || 'unknown').digest('hex');
}

module.exports = { normalizeText, hashText, hashIp };
