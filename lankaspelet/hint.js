import { Logger } from './logger.js';

/**
 * --- HINT ENGINE 4.0 (Island Bridge Pathfinder) ---
 * 
 * Philosophy:
 * Instead of looking at "clusters" based on target similarity, we look at the 
 * actual DISCONNECTED ISLANDS on the graph. We find a word that has the 
 * highest potential to link Island A (Start) and Island B (Target).
 */

const embeddingCache = new Map();

async function getEmbedding(extractor, word) {
    if (embeddingCache.has(word)) return embeddingCache.get(word);
    const promise = extractor(word, { pooling: 'mean', normalize: true });
    embeddingCache.set(word, promise);
    return promise;
}

async function batchEmbeddings(extractor, words) {
    const unique = [...new Set(words)];
    const embeds = await Promise.all(unique.map(w => getEmbedding(extractor, w)));
    return new Map(unique.map((w, i) => [w, embeds[i]]));
}

/**
 * @param {Function} extractor     - Transformer pipeline
 * @param {Function} cos_sim       - Similarity utility
 * @param {Array}    islandA       - Words connected to Core 1
 * @param {Array}    islandB       - Words connected to Core 2
 * @param {Array}    dictionary    - Candidate hint words
 * @param {Function} onProgress    - UI progress callback
 */
export async function generateSmartHint(
    extractor,
    cos_sim,
    islandA,
    islandB,
    dictionary,
    onProgress
) {
    Logger.info(`🧠 Bridge Engine 4.0: Analyzing gap between Island A (${islandA.length} words) and Island B (${islandB.length} words)...`);

    // 1. Resolve embeddings for everything currently on the board
    const allIslandWords = [...islandA, ...islandB];
    const islandEmbeds = await batchEmbeddings(extractor, allIslandWords);
    
    const sim = (e1, e2) => cos_sim(e1.data, e2.data) * 100;

    let bestHint = null;
    let highestScore = -Infinity;
    let lastYield = performance.now();
    
    const minLinkThreshold = 42; // The game's default link threshold
    const chunkSize = 250;
    const yieldMs = 16;

    // Filter dictionary: don't suggest what's already there
    const boardWordsSet = new Set(allIslandWords);
    const validDict = dictionary.filter(w => !boardWordsSet.has(w));

    // 2. Scan dictionary for the ultimate bridge
    for (let i = 0; i < validDict.length; i += chunkSize) {
        const chunk = validDict.slice(i, i + chunkSize);
        const chunkEmbeds = await batchEmbeddings(extractor, chunk);

        for (const candidate of chunk) {
            const ce = chunkEmbeds.get(candidate);
            if (!ce) continue;

            // A. Find best connection to Island A
            let maxSimA = 0;
            for (const wordA of islandA) {
                const s = sim(ce, islandEmbeds.get(wordA));
                if (s > maxSimA) maxSimA = s;
            }

            // B. Find best connection to Island B
            let maxSimB = 0;
            for (const wordB of islandB) {
                const s = sim(ce, islandEmbeds.get(wordB));
                if (s > maxSimB) maxSimB = s;
            }

            // --- SCORING (The "Bridge" Logic) ---
            
            // Geometric mean favors words that are close to BOTH (balanced)
            // A word that is 50% to A and 50% to B is better than 90% to A and 10% to B.
            const bridgeStrength = Math.sqrt(maxSimA * maxSimB);
            
            // HUGE bonus if this word would actually create a valid link on both sides right now
            const isDirectBridge = (maxSimA >= minLinkThreshold && maxSimB >= minLinkThreshold);
            const directBonus = isDirectBridge ? 100 : 0;
            
            // Penalty for being too similar to an existing word (prevents synonyms/noise)
            const maxSimAny = Math.max(maxSimA, maxSimB);
            const similarityPenalty = maxSimAny > 82 ? (maxSimAny - 82) * 5 : 0;

            const finalScore = bridgeStrength + directBonus - similarityPenalty;

            if (finalScore > highestScore) {
                highestScore = finalScore;
                bestHint = candidate;
                
                if (isDirectBridge) {
                    Logger.debug(`  ✨ Direct bridge found: "${candidate}" (A:${maxSimA.toFixed(1)}% B:${maxSimB.toFixed(1)}%)`);
                }
            }
        }

        const progress = Math.min((i + chunkSize) / validDict.length, 1.0);
        if (onProgress) onProgress(progress);

        const now = performance.now();
        if (now - lastYield >= yieldMs) {
            await new Promise(resolve => setTimeout(resolve, 0));
            lastYield = performance.now();
        }
    }

    if (bestHint) {
        Logger.success(`🧠 Bridge Hint: "${bestHint}" (Strength: ${highestScore.toFixed(2)})`);
    }
    return bestHint;
}