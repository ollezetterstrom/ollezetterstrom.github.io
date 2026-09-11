// Loaded synchronously in <head>, BEFORE the game bundle.
// Defines the window.__csNP stub so the (patched) game code can reference it
// even when netplay is inactive. Solo vs-bot mode never touches the network.
window.__csNP = {
  enabled: false,
  isHost: false,
  // Which car index this client drives locally. Host drives car 0 (as in
  // solo mode); guest drives car 1 and receives the host's car-0 input.
  localIdx: 0,
  remoteIdx: 1,
  // Latest input received from the remote peer (plain object with the
  // canonical 8 fields). null until the first message arrives.
  remote: null,
  // Bound by the game (patched hook): physics wrapper, match clock, renderer.
  _t: null,
  _s: null,
  _r: null,
  _bind(t, s, r) {
    this._t = t;
    this._s = s;
    this._r = r;
  },
  // Called by the game (patched hook) once per render frame with the fused
  // local input. The netplay module overrides this when hosting/joining.
  capture() {},
};
