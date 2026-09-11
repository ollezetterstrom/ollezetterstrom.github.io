# Netplay internals (for the curious / future you)

## Architecture

Both players run the full simulation locally (same 120Hz WASM physics).
The overlay hijacks the built-in bot slot:

- Guest/host input is exchanged @30Hz and fed into the opponent's controls
  exactly like the ONNX bot action was (same ~66ms persistence windows).
- The host additionally broadcasts authoritative snapshots (full physics
  state ~510 floats + match clock) @10Hz; the guest applies them and
  resynchronizes its renderer. Drift between snapshots is bounded and
  invisible on LAN.
- Solo vs-bot mode: `window.__csNP.enabled === false` makes every patched
  branch behave byte-for-byte like the original game.

## Files

- `pre.js` — synchronous stub defining `window.__csNP` before the bundle loads.
- `netplay.js` — lobby UI (room code in URL hash), Trystero room management,
  input capture/send, snapshot send/apply. No build step, plain ESM.
- `lobby.css` — overlay styling, namespaced with `#np-`/`np-` prefixes.
- `config.js` — app ID, send rates, Supabase placeholders.
- `vendor/trystero.bundle.mjs` — Trystero (Nostr strategy) bundled to one file.

## Bundle patches (`assets/index-QiTFIQNQ.js`)

Applied by hand once (see git history); if you ever re-mirror upstream,
re-apply these anchored replacements:

1. `t.setControls(n,$e)` → route local input to `__csNP.localIdx` + capture.
2. `else if(l===0)return Xe(),!1;` → consume `__csNP.remote` instead of bot.
3. `t.setControls(iA,A)` → `__csNP.remoteIdx` when enabled.
4. `Xf(t.state,u)` kickoff script → skipped when enabled.
5. Pause expression → ignore hidden/unfocused tabs when enabled.
6. `return!0};sh.remove();` + `Re=...resetKickoff...` → `_bind(t,s,r,n,iA)`.
7. `St.CARS+n*pn` (5x) + `un===n?E:A` → `__csNP.localIdx` (camera/HUD/audio/trails).
8. Absolute `/assets/...`, worker URL, ONNX WASM URL, webmanifest → relative.

## Rebuilding the vendor bundle

```
npm install trystero@0.25.4   # pulls @trystero-p2p/nostr
# entry.js: export {joinRoom, selfId} from 'trystero'
npx esbuild entry.js --bundle --format=esm --minify \
  --outfile=netplay/vendor/trystero.bundle.mjs
```

## Switching to Supabase signaling (if school WiFi blocks Nostr relays)

1. Create a free Supabase project (URL + anon key into `config.js`).
2. `npm install @trystero-p2p/supabase @supabase/supabase-js`,
   bundle `export {joinRoom, selfId} from '@trystero-p2p/supabase'`,
   replace the vendor file, change the import in `netplay.js`.
   The room/action API is identical; nothing else changes.
