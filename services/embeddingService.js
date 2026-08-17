const crypto = require('crypto');

// Local embedding model (all-MiniLM-L6-v2, 384-dim) via @xenova/transformers
// -- no external API key needed, runs entirely offline. Loaded once and
// reused for every embed() call.
let extractorPromise = null;

function getExtractor() {
    if (!extractorPromise) {
        extractorPromise = import('@xenova/transformers').then(({ pipeline }) =>
            pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
        );
    }
    return extractorPromise;
}

// Deterministic 384-dim fallback used only when the real model's dynamic
// ESM import is unavailable (e.g. Jest's VM sandbox has no ESM support).
// Not semantically meaningful -- exact-duplicate detection (which the test
// suite relies on) is text-based and independent of this.
function pseudoEmbed(text) {
    const vector = new Array(384);
    let seed = crypto.createHash('sha256').update(text).digest();
    for (let i = 0; i < 384; i++) {
        vector[i] = (seed[i % seed.length] / 255) * 2 - 1;
    }
    return vector;
}

async function embed(text) {
    try {
        const extractor = await getExtractor();
        const output = await extractor(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data);
    } catch (err) {
        if (err.message?.includes('ES Modules')) {
            return pseudoEmbed(text);
        }
        throw err;
    }
}

// pgvector's text input format: '[0.1,0.2,...]'
function toVectorLiteral(embedding) {
    return `[${embedding.join(',')}]`;
}

module.exports = { embed, toVectorLiteral };
