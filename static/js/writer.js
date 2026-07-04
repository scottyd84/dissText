/* dissText — client-side idle-timer state machine.
 *
 * The draft lives only here in the browser. When the grace timer runs out we
 * clear the textarea and there is nothing to recover — that's the whole point.
 */
(function () {
  "use strict";

  var cfg = window.DISS_CONFIG || { graceSeconds: 5, fadeSeconds: 2 };
  var GRACE_MS = cfg.graceSeconds * 1000;
  var FADE_MS = cfg.fadeSeconds * 1000;

  // ---- session config chosen on the setup screen ----
  var mode = "time";          // "time" | "words"
  var target = cfg && cfg.defaultTime; // set on start
  var state = "setup";        // "setup" | "writing" | "passed" | "failed"

  // ---- runtime timing ----
  var startTime = 0;
  var lastKeystroke = 0;
  var rafId = null;

  // ---- element handles ----
  var el = {
    setup: document.getElementById("setup"),
    writing: document.getElementById("writing"),
    modeTime: document.getElementById("mode-time"),
    modeWords: document.getElementById("mode-words"),
    presetsTime: document.getElementById("presets-time"),
    presetsWords: document.getElementById("presets-words"),
    customValue: document.getElementById("custom-value"),
    customUnit: document.getElementById("custom-unit"),
    startBtn: document.getElementById("start-btn"),
    setupHint: document.getElementById("setup-hint"),
    editor: document.getElementById("editor"),
    goalProgress: document.getElementById("goal-progress"),
    graceMeter: document.getElementById("grace-meter"),
    overlayPass: document.getElementById("overlay-pass"),
    overlayFail: document.getElementById("overlay-fail"),
    passSummary: document.getElementById("pass-summary"),
    copyBtn: document.getElementById("copy-btn"),
    downloadBtn: document.getElementById("download-btn"),
    passRestart: document.getElementById("pass-restart"),
    failRestart: document.getElementById("fail-restart"),
  };

  var selectedPreset = null; // currently highlighted preset button

  // ---------- helpers ----------
  function countWords(text) {
    var trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }

  function setMode(next) {
    mode = next;
    var isTime = mode === "time";
    el.modeTime.classList.toggle("active", isTime);
    el.modeWords.classList.toggle("active", !isTime);
    el.presetsTime.classList.toggle("hidden", !isTime);
    el.presetsWords.classList.toggle("hidden", isTime);
    el.customUnit.textContent = isTime ? "minutes" : "words";
    clearPresetSelection();
    el.customValue.value = "";
    el.setupHint.textContent = "";
  }

  function clearPresetSelection() {
    var btns = document.querySelectorAll(".preset-btn");
    for (var i = 0; i < btns.length; i++) btns[i].classList.remove("active");
    selectedPreset = null;
  }

  // Resolve the chosen target (preset or custom). Returns a positive number or null.
  function resolveTarget() {
    var custom = parseInt(el.customValue.value, 10);
    if (!isNaN(custom) && custom > 0) return custom;
    if (selectedPreset != null) return selectedPreset;
    return null;
  }

  // ---------- start / stop ----------
  function start() {
    var chosen = resolveTarget();
    if (chosen == null) {
      el.setupHint.textContent = "Pick a preset or enter a custom amount.";
      return;
    }
    // In time mode the custom/preset value is minutes -> store as ms target below.
    target = chosen;
    state = "writing";

    el.setup.classList.remove("active");
    el.writing.classList.add("active");
    el.editor.value = "";
    el.editor.style.opacity = "1";
    el.editor.focus();

    var now = performance.now();
    startTime = now;
    lastKeystroke = now;
    updateGoal();
    loop();
  }

  function loop() {
    rafId = requestAnimationFrame(tick);
  }

  function tick() {
    if (state !== "writing") return;

    var now = performance.now();
    var idle = now - lastKeystroke;

    // --- grace meter + fade ---
    var remaining = Math.max(0, 1 - idle / GRACE_MS);
    el.graceMeter.style.width = remaining * 100 + "%";
    el.graceMeter.style.background = remaining > 0.4 ? "var(--good)"
      : remaining > 0.15 ? "var(--accent)" : "var(--danger)";

    // Fade the editor during the final FADE_MS of the grace window.
    var fadeStart = GRACE_MS - FADE_MS;
    if (idle > fadeStart) {
      var t = (idle - fadeStart) / FADE_MS;      // 0 -> 1 across the fade window
      el.editor.style.opacity = String(Math.max(0, 1 - t));
    } else {
      el.editor.style.opacity = "1";
    }

    // --- wipe ---
    if (idle >= GRACE_MS) {
      fail();
      return;
    }

    // --- time-goal success ---
    if (mode === "time") {
      var elapsedMs = now - startTime;
      if (elapsedMs >= target * 60 * 1000) {
        pass();
        return;
      }
    }

    updateGoal();
    loop();
  }

  function updateGoal() {
    if (mode === "time") {
      var elapsed = Math.floor((performance.now() - startTime) / 1000);
      var totalSec = target * 60;
      var left = Math.max(0, totalSec - elapsed);
      var mm = Math.floor(left / 60);
      var ss = String(left % 60).padStart(2, "0");
      el.goalProgress.textContent = mm + ":" + ss + " left";
    } else {
      var words = countWords(el.editor.value);
      el.goalProgress.textContent = words + " / " + target + " words";
    }
  }

  // ---------- input handling ----------
  function onInput() {
    if (state !== "writing") return;
    lastKeystroke = performance.now();
    el.editor.style.opacity = "1"; // snap back on recovery

    if (mode === "words") {
      updateGoal();
      if (countWords(el.editor.value) >= target) pass();
    }
  }

  // ---------- outcomes ----------
  function stopLoop() {
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function pass() {
    if (state !== "writing") return;
    state = "passed";
    stopLoop();
    var words = countWords(el.editor.value);
    el.passSummary.textContent = words + " words. They're yours to keep.";
    el.overlayPass.classList.add("active");
  }

  function fail() {
    if (state !== "writing") return;
    state = "failed";
    stopLoop();
    el.editor.value = "";              // the wipe — no recovery
    el.editor.style.opacity = "1";
    el.graceMeter.style.width = "0%";
    el.overlayFail.classList.add("active");
  }

  function restart() {
    stopLoop();
    state = "setup";
    el.overlayPass.classList.remove("active");
    el.overlayFail.classList.remove("active");
    el.writing.classList.remove("active");
    el.setup.classList.add("active");
  }

  // ---------- save actions ----------
  function copyText() {
    navigator.clipboard.writeText(el.editor.value).then(function () {
      el.copyBtn.textContent = "Copied!";
      setTimeout(function () { el.copyBtn.textContent = "Copy text"; }, 1500);
    });
  }

  function downloadText() {
    var blob = new Blob([el.editor.value], { type: "text/plain" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "disstext.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------- wiring ----------
  el.modeTime.addEventListener("click", function () { setMode("time"); });
  el.modeWords.addEventListener("click", function () { setMode("words"); });

  document.querySelectorAll(".preset-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      clearPresetSelection();
      btn.classList.add("active");
      selectedPreset = parseInt(btn.dataset.value, 10);
      el.customValue.value = "";
      el.setupHint.textContent = "";
    });
  });

  el.customValue.addEventListener("input", function () {
    clearPresetSelection();
  });

  el.startBtn.addEventListener("click", start);
  el.editor.addEventListener("input", onInput);
  el.copyBtn.addEventListener("click", copyText);
  el.downloadBtn.addEventListener("click", downloadText);
  el.passRestart.addEventListener("click", restart);
  el.failRestart.addEventListener("click", restart);
})();
