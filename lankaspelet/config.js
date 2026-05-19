// ==========================================
// CONFIGURATION & CONSTANTS
// ==========================================
export const CONFIG = {
    GAME: {
        MINIMUM_SCORE: 42.0,
        NODE_SPAWN_OFFSET_X: 120,
    },
    AI: {
        MODEL: 'Xenova/all-MiniLM-L6-v2',
        POOLING_STRATEGY: 'mean',
    },
    DICTIONARY: {
        FULL_URL: 'https://cdn.jsdelivr.net/gh/dwyl/english-words@master/words_alpha.txt',
        COMMON_URL: 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt',
        MIN_WORD_LENGTH: 4,
        MAX_WORD_LENGTH: 8
    },
    ZOOM: {
        MAX_SCALE: 3.5,
        MIN_SCALE: 0.15,
        BASE_STEP: 0.05,
        SMOOTHING_FACTOR: 0.15,
        TRACKPAD_SENSITIVITY: 0.15,
        MOUSE_WHEEL_MULTIPLIER: 0.6
    },
    UI: {
        SIDEBAR_WIDTH: 320,
        CORE_NODE_PADDING: { x: 120 },
        WIN_ANIMATION_DELAY: 1000
    }
};