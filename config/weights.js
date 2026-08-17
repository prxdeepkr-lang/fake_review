// Single source of truth for every fraud-signal weight and threshold.
// Nothing in services/ should hardcode a magic number that belongs here.
// Values come from the spec's "Recommended Initial Weights" (section 47),
// kept overridable via env vars for the few that are natural knobs.

const WEIGHTS = {
    // Account signals
    NEW_ACCOUNT_24H: 15,
    NEW_ACCOUNT_72H: 8,
    ESTABLISHED_CUSTOMER: -10,

    // Purchase / trust signals
    VERIFIED_PURCHASE: -20,
    LEGITIMATE_PURCHASE_HISTORY: -10,
    RETURN_AFTER_REVIEW: 20,

    // Behavior signals
    CUSTOMER_REVIEW_BURST: 15,
    REVIEW_BURST: 15, // seller-level burst
    EXTREME_RATING_BIAS: 10,

    // Text signals
    EXACT_DUPLICATE: 25,
    SEMANTIC_DUPLICATE: 20,
    CROSS_PRODUCT_SEMANTIC_MATCH: 25,
    RATING_SENTIMENT_MISMATCH: 15,
    PROMOTIONAL_LANGUAGE: 10,
    LLM_TEMPLATE_LEAK: 15,
    EXCESSIVE_CAPITALIZATION: 5,
    EXCESSIVE_PUNCTUATION: 5,
    EXCESSIVE_EMOJI: 5,
    LOW_TTR: 5,
    VERIFIED_PURCHASER_TEXT_EXCEPTION: -20,
    ESTABLISHED_CUSTOMER_TEXT_EXCEPTION: -10,

    // Connection signals
    HONEYPOT_TRIGGERED: 30,
    PROXY: 15,
    VPN: 10,
    TOR: 20,
    HEADER_ANOMALY: 10,

    // Seller signals
    SELLER_HIGH_FRAUD_INDEX: 15,
};

// Category caps prevent one dimension from dominating the score (section 46).
const CATEGORY_CAPS = {
    ACCOUNT: 25,
    CONNECTION: 25,
    TEXT: 30,
    BEHAVIOR: 30,
    SELLER: 15,
    PURCHASE: -30, // floor, not ceiling -- purchase/trust signals only reduce risk
};

const THRESHOLDS = {
    // Risk levels: 0-29 LOW, 30-59 MEDIUM, 60-100 HIGH
    MEDIUM: parseInt(process.env.RISK_THRESHOLD_MEDIUM, 10) || 30,
    HIGH: parseInt(process.env.RISK_THRESHOLD_HIGH, 10) || 60,

    // Account age
    NEW_ACCOUNT_24H_MS: 24 * 60 * 60 * 1000,
    NEW_ACCOUNT_72H_MS: 72 * 60 * 60 * 1000,
    ESTABLISHED_ACCOUNT_MS: 30 * 24 * 60 * 60 * 1000, // 30 days

    // Review velocity
    CUSTOMER_BURST_COUNT: 5,
    CUSTOMER_BURST_WINDOW_MS: 60 * 60 * 1000, // 1 hour
    SELLER_BURST_COUNT: 10,
    SELLER_BURST_WINDOW_MS: 10 * 60 * 1000, // 10 minutes

    // Rating bias
    EXTREME_RATING_MIN_REVIEWS: 5,
    EXTREME_RATING_RATIO: 0.95,

    // Seller fraud index
    SELLER_FRAUD_INDEX_PCT: 30,

    // Semantic similarity (cosine similarity, 1 = identical)
    SEMANTIC_SIMILARITY_THRESHOLD: 0.88,
    CROSS_PRODUCT_SIMILARITY_THRESHOLD: 0.92,

    // Text
    LOW_TTR_THRESHOLD: 0.35,
    LOW_TTR_MIN_WORDS: 30,
    EXCESSIVE_CAPS_RATIO: 0.4,
    EXCESSIVE_PUNCTUATION_COUNT: 4,
    EXCESSIVE_EMOJI_COUNT: 4,
    SENTIMENT_MISMATCH_DELTA: 0.6,

    // Rate limiting
    REVIEW_RATE_LIMIT_MAX: 5,
    REVIEW_RATE_LIMIT_WINDOW_MS: 10 * 60 * 1000,
};

module.exports = { WEIGHTS, CATEGORY_CAPS, THRESHOLDS };
