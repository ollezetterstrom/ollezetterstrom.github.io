// ==========================================
// GAME STATE
// ==========================================
import { CONFIG } from './config.js';

export const gameState = {
    validWordsSet: new Set(),
    targetWordsArray: [],
    gameWon: false,
    isHinting: false,
    panzoomInstance: null
};

export function setExtractor(ext) {
    gameState.extractor = ext;
}

export function getGameState() {
    return gameState;
}