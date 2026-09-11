// Graphics performance mode. Classic script, runs in <head> BEFORE the game
// bundle so renderer creation can read it. Mode persists in localStorage:
//   auto (default) -> fast on Macs and touch devices, full everywhere else
//   fast           -> no MSAA, render scale 1x, shadows off (big MacBook win)
//   full           -> original visuals (MSAA, up to 2x scale, shadows)
// Changing modes requires a reload (the renderer is created once).
(function () {
  var KEY = "car-soccer.perf-mode";
  var stored = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch (e) {}
  var mode = stored || "auto";
  var ua = navigator.userAgent || "";
  var isMac = /Macintosh|Mac OS X/.test(ua);
  var coarse =
    window.matchMedia && window.matchMedia("(pointer:coarse)").matches;
  var effective = mode === "auto" ? (isMac || coarse ? "fast" : "full") : mode;
  window.__csPerf = {
    mode: mode,
    effective: effective,
    fast: effective === "fast",
    setMode: function (m) {
      try {
        localStorage.setItem(KEY, m);
      } catch (e) {}
    },
  };
})();
