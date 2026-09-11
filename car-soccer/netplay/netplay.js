/* Car Soccer netplay overlay (P2P 1v1).
 *
 * How it works: both players start a normal vs-bot match. The overlay then
 * hijacks the "bot" input slot: instead of the ONNX bot driving car 1, the
 * remote human's input does. Both simulations run locally (same 120Hz WASM
 * physics); the host additionally broadcasts authoritative snapshots @10Hz
 * so the two sims can't drift apart.
 *
 * Solo mode is untouched: everything below only runs after Host/Join.
 */
import { joinRoom, selfId } from "./vendor/trystero.bundle.mjs";
import { APP_ID, INPUT_MS, SNAP_MS } from "./config.js";

const NP = window.__csNP;
const NEUTRAL = {
  throttle: 0,
  steer: 0,
  pitch: 0,
  yaw: 0,
  roll: 0,
  jump: false,
  boost: false,
  handbrake: false,
};

let room = null;
let sendInput = null;
let sendGo = null;
let sendSnap = null;
let myCode = null;
let inputTimer = 0;
let snapTimer = 0;
let seq = 0;
let latestLocal = null;
let statusEl = null;
let codeEl = null;
let hostBtn = null;
let joinBtn = null;
let goBtn = null;
let leaveBtn = null;

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

function copyInput(a) {
  return {
    throttle: +a.throttle || 0,
    steer: +a.steer || 0,
    pitch: +a.pitch || 0,
    yaw: +a.yaw || 0,
    roll: +a.roll || 0,
    jump: !!a.jump,
    boost: !!a.boost,
    handbrake: !!a.handbrake,
  };
}

// Called by the game once per render frame (patched hook).
NP.capture = (input) => {
  latestLocal = copyInput(input);
};

function pickClock(s) {
  return {
    state: { ...s.state },
    remaining: s.remaining,
    phaseTicks: s.phaseTicks,
    overtimeTicks: s.overtimeTicks,
    clockStarted: s.clockStarted,
  };
}

function applyClock(s, snap) {
  Object.assign(s.state, snap.state);
  s.remaining = snap.remaining;
  s.phaseTicks = snap.phaseTicks;
  s.overtimeTicks = snap.overtimeTicks;
  s.clockStarted = snap.clockStarted;
}

function applySnapshot(stateArr, clock) {
  const t = NP._t;
  const s = NP._s;
  const r = NP._r;
  if (!t || !s || !r) return false;
  try {
    t.state.set(stateArr);
    applyClock(s, clock);
    r.sync();
    return true;
  } catch (err) {
    console.warn("[netplay] snapshot apply failed", err);
    return false;
  }
}

function startLoops() {
  stopLoops();
  inputTimer = setInterval(() => {
    if (!room || !sendInput) return;
    try {
      window.__csNPDbg.inputsSent++;
      sendInput({ a: latestLocal ? { ...latestLocal } : { ...NEUTRAL }, seq: ++seq });
    } catch (err) {
      console.warn("[netplay] input send failed", err);
    }
  }, INPUT_MS);
  if (NP.isHost) {
    snapTimer = setInterval(() => {
      if (!room || !sendSnap || !NP._t || !NP._s) return;
      try {
        window.__csNPDbg.snapsSent++;
        // Plain Array: survives JSON-style action serialization intact
        // (a Float32Array would arrive as a keyed object without .length).
        sendSnap({
          state: Array.from(NP._t.state),
          clock: pickClock(NP._s),
        });
      } catch (err) {
        console.warn("[netplay] snapshot send failed", err);
      }
    }, SNAP_MS);
  }
}

function stopLoops() {
  clearInterval(inputTimer);
  clearInterval(snapTimer);
  inputTimer = 0;
  snapTimer = 0;
}

function enableNetplay() {
  NP.remote = { ...NEUTRAL };
  NP.enabled = true;
  startLoops();
}

function disableNetplay() {
  stopLoops();
  NP.enabled = false;
  NP.remote = null;
  NP.isHost = false;
  NP.localIdx = 0;
  NP.remoteIdx = 1;
}

function wireRoom(code, asHost) {
  room = joinRoom({ appId: APP_ID }, code);
  // Trystero >=0.20: makeAction returns {send, onMessage}; send is async.
  const inAct = room.makeAction("in");
  const goAct = room.makeAction("go");
  const snapAct = room.makeAction("snap");
  sendInput = (data) => inAct.send(data).catch(() => {});
  sendGo = (data) => goAct.send(data).catch(() => {});
  sendSnap = (data) => snapAct.send(data).catch(() => {});

  inAct.onMessage = (msg) => {
    window.__csNPDbg.inputsRecv++;
    if (msg && msg.a) NP.remote = copyInput(msg.a);
  };
  snapAct.onMessage = (msg) => {
    if (NP.isHost || !msg) return;
    window.__csNPDbg.snapsRecv++;
    window.__csNPDbg.lastSnapLen = msg.state ? msg.state.length : -1;
    applySnapshot(msg.state, msg.clock);
  };
  goAct.onMessage = (msg) => {
    if (NP.isHost || !msg) return;
    if (applySnapshot(msg.state, msg.clock)) {
      enableNetplay();
      setStatus("Connected — playing!");
    } else {
      setStatus("Connected, but game not ready — click START MATCH.");
      // Retry on next go; also enable so input flows once match starts.
      enableNetplay();
    }
  };
  // Trystero >=0.20: peer events are assignable properties.
  room.onPeerJoin = (peerId) => {
    setStatus(
      asHost
        ? `Friend joined (${String(peerId).slice(0, 6)}…). Press "Start netplay".`
        : "Joined room. Waiting for host to start…"
    );
    if (goBtn) goBtn.disabled = !asHost;
  };
  room.onPeerLeave = () => {
    setStatus("Friend left — back to bot mode. Host/Join to play again.");
    disableNetplay();
    refreshButtons(false);
  };
}

function randomCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  const buf = new Uint32Array(4);
  crypto.getRandomValues(buf);
  for (const n of buf) out += chars[n % chars.length];
  return out;
}

function refreshButtons(inRoom) {
  hostBtn.disabled = inRoom;
  joinBtn.disabled = inRoom;
  codeEl.disabled = inRoom;
  leaveBtn.disabled = !inRoom;
  goBtn.disabled = !inRoom || !NP.isHost;
}

function onHost() {
  if (room) return;
  myCode = randomCode();
  codeEl.value = myCode;
  location.hash = "room=" + myCode;
  NP.isHost = true;
  NP.localIdx = 0;
  NP.remoteIdx = 1;
  wireRoom(myCode, true);
  refreshButtons(true);
  setStatus(`Hosting room ${myCode} — send your friend this page's link.`);
}

function onJoin() {
  if (room) return;
  const code = (codeEl.value || "").trim().toUpperCase();
  if (!code) {
    setStatus("Enter the host's room code first.");
    return;
  }
  myCode = code;
  location.hash = "room=" + code;
  NP.isHost = false;
  NP.localIdx = 1;
  NP.remoteIdx = 0;
  wireRoom(code, false);
  refreshButtons(true);
  setStatus(`Joining room ${code}… make sure you've clicked START MATCH.`);
}

function onGo() {
  if (!room || !NP.isHost || !NP._t || !NP._s) {
    setStatus("Start a vs-bot match first, then press Start netplay.");
    return;
  }
  try {
    sendGo({ state: Array.from(NP._t.state), clock: pickClock(NP._s) });
  } catch (err) {
    setStatus("Failed to send start signal — still trying.");
    console.warn("[netplay] go send failed", err);
    return;
  }
  enableNetplay();
  setStatus("Playing! (host)");
}

function onLeave() {
  try {
    room && room.leave();
  } catch {}
  room = null;
  disableNetplay();
  refreshButtons(false);
  setStatus("Left. Solo bot mode.");
}

function buildLobby() {
  const panel = document.createElement("div");
  panel.id = "netplay-panel";
  panel.innerHTML = `
    <button id="np-toggle" type="button" title="Online play">🌐 Play online</button>
    <div id="np-body" hidden>
      <div class="np-row np-title">Online 1v1 (P2P)</div>
      <div class="np-row np-hint">Both players: click START MATCH first, then connect here.</div>
      <div class="np-row">
        <input id="np-code" placeholder="ROOM CODE" maxlength="8" autocomplete="off" spellcheck="false" />
      </div>
      <div class="np-row">
        <button id="np-host" type="button">Host</button>
        <button id="np-join" type="button">Join</button>
      </div>
      <div class="np-row">
        <button id="np-go" type="button" disabled>Start netplay (host)</button>
      </div>
      <div class="np-row">
        <button id="np-leave" type="button" disabled>Leave</button>
      </div>
      <div class="np-row np-status" id="np-status">Solo bot mode.</div>
    </div>`;
  document.body.appendChild(panel);

  statusEl = panel.querySelector("#np-status");
  codeEl = panel.querySelector("#np-code");
  hostBtn = panel.querySelector("#np-host");
  joinBtn = panel.querySelector("#np-join");
  goBtn = panel.querySelector("#np-go");
  leaveBtn = panel.querySelector("#np-leave");
  panel.querySelector("#np-toggle").addEventListener("click", () => {
    const body = panel.querySelector("#np-body");
    body.hidden = !body.hidden;
  });
  hostBtn.addEventListener("click", onHost);
  joinBtn.addEventListener("click", onJoin);
  goBtn.addEventListener("click", onGo);
  leaveBtn.addEventListener("click", onLeave);

  const m = location.hash.match(/room=([A-Za-z0-9]{4,8})/);
  if (m) codeEl.value = m[1].toUpperCase();

  console.info("[netplay] ready, peer", selfId);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", buildLobby);
} else {
  buildLobby();
}

// Debug counters (used in local verification; harmless in production).
window.__csNPDbg = {
  inputsSent: 0,
  inputsRecv: 0,
  snapsSent: 0,
  snapsRecv: 0,
  lastSnapLen: -1,
};
