const crypto = require('crypto');

// Provider abstraction: if IP_INFO_API_KEY is set, call the real IPInfo API;
// otherwise fall back to a deterministic local classifier so the system is
// fully demoable with zero external keys/network calls (spec section 38).
// Never hardcode a specific provider's shape outside of this file.

const PRIVATE_RANGES = [/^10\./, /^127\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[0-1])\./, /^::1$/, /^fc/, /^fe80/];

// A small illustrative set of known-public ranges commonly associated with
// Tor exits / cloud-hosting providers, used only for the local mock
// classifier's demo realism -- not an exhaustive or authoritative list.
const TOR_LIKE_PREFIXES = ['185.220.', '199.87.', '51.15.'];
const DATACENTER_PREFIXES = ['34.', '35.', '52.', '54.', '104.196.', '146.148.', '138.68.', '159.65.'];

function isPrivateIp(ip) {
    return PRIVATE_RANGES.some((re) => re.test(ip));
}

function hashToUnitInterval(value) {
    const hash = crypto.createHash('sha256').update(value).digest();
    return hash.readUInt32BE(0) / 0xffffffff;
}

function mockClassify(ip) {
    if (isPrivateIp(ip)) {
        return { isProxy: false, isVpn: false, isTor: false, isp: 'Private Network', country: 'N/A' };
    }

    if (TOR_LIKE_PREFIXES.some((prefix) => ip.startsWith(prefix))) {
        return { isProxy: true, isVpn: false, isTor: true, isp: 'Known Tor Exit Range', country: 'UNKNOWN' };
    }

    if (DATACENTER_PREFIXES.some((prefix) => ip.startsWith(prefix))) {
        return { isProxy: true, isVpn: true, isTor: false, isp: 'Cloud/Datacenter Hosting', country: 'US' };
    }

    // Deterministic pseudo-classification for otherwise-unknown IPs so
    // repeated lookups of the same address are stable.
    const r = hashToUnitInterval(ip);
    const countries = ['US', 'IN', 'GB', 'DE', 'BR'];
    return {
        isProxy: false,
        isVpn: r > 0.92,
        isTor: false,
        isp: r > 0.92 ? 'Consumer VPN Provider' : 'Residential ISP',
        country: countries[Math.floor(r * countries.length)],
    };
}

async function lookupRealProvider(ip) {
    const token = process.env.IP_INFO_API_KEY;
    const response = await fetch(`https://ipinfo.io/${ip}?token=${token}`);
    if (!response.ok) throw new Error(`IPInfo lookup failed: ${response.status}`);
    const data = await response.json();
    const isHosting = /hosting|cloud|data center|datacenter/i.test(data.company?.name || data.org || '');
    return {
        isProxy: !!data.privacy?.proxy || isHosting,
        isVpn: !!data.privacy?.vpn,
        isTor: !!data.privacy?.tor,
        isp: data.org || data.company?.name || 'Unknown',
        country: data.country || 'UNKNOWN',
    };
}

async function lookupIp(ip) {
    if (process.env.IP_INFO_API_KEY) {
        try {
            return await lookupRealProvider(ip);
        } catch (err) {
            console.error('IPInfo lookup failed, falling back to local classifier:', err.message);
        }
    }
    return mockClassify(ip);
}

module.exports = { lookupIp, isPrivateIp };
