# Car Soccer — local netplay fork (attribution)

Base game: https://car-soccer.com/ (mirrored client-side build, all rights reserved
by its author — this copy is for private, non-commercial play between friends only).

- Rendering/physics bundle: Three.js (MIT, (c) 2010-2026 Three.js Authors).
- Bot policy `assets/bot/policy.onnx`: "Nexto" by the Necto team / Rolv-Arild and
  contributors (https://github.com/Rolv-Arild/Necto), converted TorchScript -> ONNX.
  License: CC BY-NC-SA 4.0 (see `assets/bot/NOTICE.txt`). Non-commercial use only.
- ONNX Runtime Web: MIT (c) Microsoft Corporation.
- Engine recordings/samples: as shipped upstream.

Netplay changes in this fork (MIT, yours to keep):
- Subfolder-relative asset paths (`./assets/...`) so the game runs from `/car-soccer/`.
- P2P multiplayer overlay (see `netplay/`): host-authoritative state sync over
  WebRTC DataChannel. Solo vs-bot mode untouched.
- `netplay/vendor/trystero.bundle.mjs`: Trystero (MIT, Dan Motzenbecker,
  https://github.com/dmotz/trystero), bundled from npm (`trystero@0.25.4` +
  `@trystero-p2p/nostr`). License: `netplay/vendor/TRYSTERO-LICENSE`.
