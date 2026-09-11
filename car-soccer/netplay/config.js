// Netplay configuration. Edit once, friend never sees this.
export const APP_ID = "car-soccer-netplay-v1";

// How often we send our input (ms). The game consumes remote input in
// ~66ms windows (same as the built-in bot), so 33ms gives headroom.
export const INPUT_MS = 33;

// How often the host broadcasts an authoritative snapshot (ms).
// Keeps the two simulations from drifting apart.
export const SNAP_MS = 100;

// --- Future: Supabase signaling (more reliable on filtered networks) ---
// The vendored bundle only contains the Nostr strategy (zero-config).
// To switch strategies, bundle `@trystero-p2p/supabase` the same way
// trystero.bundle.mjs was built (see netplay/README) and set these:
export const SUPABASE_URL = null;
export const SUPABASE_KEY = null;
