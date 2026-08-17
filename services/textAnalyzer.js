const vader = require('vader-sentiment');
const { WEIGHTS, THRESHOLDS } = require('../config/weights');

const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
const TEMPLATE_LEAK_PATTERNS = [
    /\[\s*(PRODUCT_NAME|SELLER|CATEGORY|BRAND)\s*\]/i,
    /\{\{?\s*(product_name|seller_id|product|customer_name)\s*\}?\}/i,
    /as an ai language model/i,
    /i cannot provide (a )?personal experience/i,
    /i do not have personal experiences/i,
    /i am an ai and (cannot|don't|do not)/i,
];

// Maps a 1-5 star rating to the sentiment range we'd expect from a genuine
// review of that rating, so we can flag a mismatch (spec section 31).
function expectedSentimentRange(rating) {
    if (rating >= 4) return { min: -0.2, max: 1 }; // positive ratings: mismatch only if strongly negative text
    if (rating <= 2) return { min: -1, max: 0.2 }; // negative ratings: mismatch only if strongly positive text
    return { min: -1, max: 1 }; // 3-star: no mismatch signal, text can go either way
}

async function analyzeText(client, { reviewText, rating }) {
    const signals = [];

    // Sentiment vs rating mismatch
    const sentiment = vader.SentimentIntensityAnalyzer.polarity_scores(reviewText);
    const range = expectedSentimentRange(rating);
    if (sentiment.compound < range.min || sentiment.compound > range.max) {
        signals.push({
            category: 'TEXT',
            type: 'RATING_SENTIMENT_MISMATCH',
            score: WEIGHTS.RATING_SENTIMENT_MISMATCH,
            details: `Rating of ${rating} does not match text sentiment (compound score ${sentiment.compound.toFixed(2)})`,
        });
    }

    // Excessive capitalization
    const letters = reviewText.replace(/[^a-zA-Z]/g, '');
    if (letters.length >= 10) {
        const upperRatio = (letters.match(/[A-Z]/g) || []).length / letters.length;
        if (upperRatio > THRESHOLDS.EXCESSIVE_CAPS_RATIO) {
            signals.push({
                category: 'TEXT',
                type: 'EXCESSIVE_CAPITALIZATION',
                score: WEIGHTS.EXCESSIVE_CAPITALIZATION,
                details: `${Math.round(upperRatio * 100)}% of letters are uppercase`,
            });
        }
    }

    // Excessive punctuation
    const exclamationRuns = reviewText.match(/[!?]{2,}/g) || [];
    const totalExcessivePunct = exclamationRuns.reduce((sum, run) => sum + run.length, 0);
    if (totalExcessivePunct >= THRESHOLDS.EXCESSIVE_PUNCTUATION_COUNT) {
        signals.push({
            category: 'TEXT',
            type: 'EXCESSIVE_PUNCTUATION',
            score: WEIGHTS.EXCESSIVE_PUNCTUATION,
            details: 'Review text contains repeated exclamation/question marks',
        });
    }

    // Excessive emoji
    const emojiCount = (reviewText.match(EMOJI_REGEX) || []).length;
    if (emojiCount >= THRESHOLDS.EXCESSIVE_EMOJI_COUNT) {
        signals.push({
            category: 'TEXT',
            type: 'EXCESSIVE_EMOJI',
            score: WEIGHTS.EXCESSIVE_EMOJI,
            details: `Review contains ${emojiCount} emoji characters`,
        });
    }

    // Lexical diversity (type-token ratio) -- only meaningful for longer text
    const words = reviewText.toLowerCase().match(/[a-z0-9']+/g) || [];
    if (words.length >= THRESHOLDS.LOW_TTR_MIN_WORDS) {
        const uniqueWords = new Set(words).size;
        const ttr = uniqueWords / words.length;
        if (ttr < THRESHOLDS.LOW_TTR_THRESHOLD) {
            signals.push({
                category: 'TEXT',
                type: 'LOW_TTR',
                score: WEIGHTS.LOW_TTR,
                details: `Low lexical diversity (TTR ${ttr.toFixed(2)}) for a ${words.length}-word review`,
            });
        }
    }

    // Promotional / spam phrases, admin-managed rather than hardcoded
    const phrasesResult = await client.query('SELECT phrase, weight FROM suspicious_phrases');
    const lowerText = reviewText.toLowerCase();
    const matchedPhrases = phrasesResult.rows.filter((p) => lowerText.includes(p.phrase.toLowerCase()));
    if (matchedPhrases.length > 0) {
        const promoScore = Math.min(
            WEIGHTS.PROMOTIONAL_LANGUAGE,
            matchedPhrases.reduce((sum, p) => sum + p.weight, 0)
        );
        signals.push({
            category: 'TEXT',
            type: 'PROMOTIONAL_LANGUAGE',
            score: promoScore,
            details: `Contains promotional phrase(s): ${matchedPhrases.map((p) => p.phrase).join(', ')}`,
        });
    }

    // Template / AI-boilerplate leakage
    if (TEMPLATE_LEAK_PATTERNS.some((pattern) => pattern.test(reviewText))) {
        signals.push({
            category: 'TEXT',
            type: 'LLM_TEMPLATE_LEAK',
            score: WEIGHTS.LLM_TEMPLATE_LEAK,
            details: 'Review text contains template placeholders or AI-boilerplate phrasing',
        });
    }

    return signals;
}

module.exports = { analyzeText };
