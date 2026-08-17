const { WEIGHTS, THRESHOLDS } = require('../config/weights');
const { normalizeText } = require('../utils/normalization');
const { embed, toVectorLiteral } = require('./embeddingService');

// Exact duplicate: normalized text (lowercase, trimmed, whitespace
// collapsed) matches an existing review's text exactly (spec section 25).
async function checkExactDuplicate(client, reviewText) {
    const normalized = normalizeText(reviewText);
    const result = await client.query(
        `SELECT review_id FROM reviews WHERE LOWER(TRIM(REGEXP_REPLACE(review_text, '\\s+', ' ', 'g'))) = $1 LIMIT 1`,
        [normalized]
    );
    return result.rows.length > 0;
}

// Semantic similarity via pgvector cosine distance. Same-product high
// similarity is treated as a weak signal (genuine customers often describe
// the same defect the same way -- spec section 27); cross-product high
// similarity across UNRELATED products is a much stronger signal of
// templated/coordinated reviews (spec section 28).
async function findSimilarReviews(client, embedding, productId) {
    const vectorLiteral = toVectorLiteral(embedding);
    const result = await client.query(
        `SELECT review_id, product_id, customer_id,
                1 - (embedding <=> $1::vector) AS similarity
         FROM reviews
         WHERE embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector
         LIMIT 10`,
        [vectorLiteral]
    );

    const sameProduct = result.rows.filter(
        (r) => r.product_id === productId && r.similarity >= THRESHOLDS.SEMANTIC_SIMILARITY_THRESHOLD
    );
    const crossProduct = result.rows.filter(
        (r) => r.product_id !== productId && r.similarity >= THRESHOLDS.CROSS_PRODUCT_SIMILARITY_THRESHOLD
    );

    return { sameProduct, crossProduct };
}

async function analyzeSimilarity(client, { reviewText, productId, verifiedPurchase, isEstablished }) {
    const signals = [];

    const isExactDuplicate = await checkExactDuplicate(client, reviewText);
    if (isExactDuplicate) {
        signals.push({
            category: 'TEXT',
            type: 'EXACT_DUPLICATE',
            score: WEIGHTS.EXACT_DUPLICATE,
            details: 'Review text is an exact (normalized) duplicate of an existing review',
        });
    }

    const embedding = await embed(reviewText);
    const { sameProduct, crossProduct } = await findSimilarReviews(client, embedding, productId);

    if (crossProduct.length > 0) {
        signals.push({
            category: 'TEXT',
            type: 'CROSS_PRODUCT_SEMANTIC_MATCH',
            score: WEIGHTS.CROSS_PRODUCT_SEMANTIC_MATCH,
            details: `Highly similar review text found on ${crossProduct.length} unrelated product(s) -- possible templated/coordinated review`,
        });
    } else if (sameProduct.length > 0 && !isExactDuplicate) {
        signals.push({
            category: 'TEXT',
            type: 'SEMANTIC_DUPLICATE',
            score: WEIGHTS.SEMANTIC_DUPLICATE,
            details: `Semantically very similar to ${sameProduct.length} other review(s) of the same product`,
        });
    }

    // Verified-purchaser exception: reduces (never zeroes) the text-risk
    // contribution, because a fraudulent actor can purchase too (section 29).
    if ((crossProduct.length > 0 || sameProduct.length > 0) && verifiedPurchase) {
        signals.push({
            category: 'TEXT',
            type: 'VERIFIED_PURCHASER_TEXT_EXCEPTION',
            score: WEIGHTS.VERIFIED_PURCHASER_TEXT_EXCEPTION,
            details: 'Similarity risk reduced -- customer is a verified purchaser',
        });
        if (isEstablished) {
            signals.push({
                category: 'TEXT',
                type: 'ESTABLISHED_CUSTOMER_TEXT_EXCEPTION',
                score: WEIGHTS.ESTABLISHED_CUSTOMER_TEXT_EXCEPTION,
                details: 'Similarity risk further reduced -- customer has an established, legitimate account',
            });
        }
    }

    return { signals, embedding };
}

module.exports = { analyzeSimilarity, checkExactDuplicate, findSimilarReviews };
