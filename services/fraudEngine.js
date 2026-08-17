const { THRESHOLDS } = require('../config/weights');
const { combineSignals } = require('../utils/scoring');
const { analyzeAccount } = require('./accountAnalyzer');
const { isVerifiedPurchase, analyzePurchase } = require('./purchaseAnalyzer');
const { analyzeReturn } = require('./returnAnalyzer');
const { analyzeCustomerVelocity, analyzeRatingBias } = require('./customerAnalyzer');
const { analyzeSellerFraudIndex, analyzeSellerVelocity } = require('./sellerAnalyzer');
const { analyzeText } = require('./textAnalyzer');
const { analyzeSimilarity } = require('./similarityAnalyzer');
const { analyzeConnection } = require('./connectionAnalyzer');

// Orchestrates every fraud signal into one explainable 0-100 risk score.
// Combines: account age, purchase/return history, customer behavior,
// connection signals, text analysis, semantic similarity, seller context,
// and review velocity -- never a single signal in isolation (spec section 17).
async function runFraudEngine(client, { customer, product, seller, rating, reviewText, req, honeypotValue }) {
    const verifiedPurchase = await isVerifiedPurchase(client, customer.customer_id, product.product_id);
    const accountAgeMs = Date.now() - new Date(customer.created_at).getTime();
    const isEstablished = accountAgeMs >= THRESHOLDS.ESTABLISHED_ACCOUNT_MS;

    // Run sequentially -- every analyzer shares the single transactional
    // `client`, and a pg Client/PoolClient cannot safely run concurrent
    // queries on the same connection.
    const accountSignals = analyzeAccount(customer);
    const purchaseSignals = await analyzePurchase(client, customer.customer_id, product.product_id, verifiedPurchase);
    const returnSignals = await analyzeReturn(client, customer.customer_id, product.product_id);
    const velocitySignals = await analyzeCustomerVelocity(client, customer.customer_id);
    const ratingBiasSignals = await analyzeRatingBias(client, customer.customer_id);
    const sellerFraudSignals = await analyzeSellerFraudIndex(client, seller.seller_id);
    const sellerVelocitySignals = await analyzeSellerVelocity(client, seller.seller_id);
    const textSignals = await analyzeText(client, { reviewText, rating });
    const similarityResult = await analyzeSimilarity(client, {
        reviewText,
        productId: product.product_id,
        verifiedPurchase,
        isEstablished,
    });
    const connectionResult = await analyzeConnection({ req, honeypotValue });

    const { score, level, signals } = combineSignals([
        accountSignals,
        purchaseSignals,
        returnSignals,
        velocitySignals,
        ratingBiasSignals,
        sellerFraudSignals,
        sellerVelocitySignals,
        textSignals,
        similarityResult.signals,
        connectionResult.signals,
    ]);

    return {
        score,
        level,
        signals,
        verifiedPurchase,
        embedding: similarityResult.embedding,
        connectionEvidence: connectionResult.evidence,
    };
}

module.exports = { runFraudEngine };
