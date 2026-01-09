import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

export default function App() {
  /**
   * URL PARAMS
   * - p: pattern name (spiralOuter | waveDiagonal | pulse | random)
   * - export=1: deterministic export mode (time controlled externally)
   * - seed: seed for random pattern (e.g. seed=123)
   */
  const params = new URLSearchParams(window.location.search);
  const patternName = params.get("p") ?? "spiralOuter";
  const exportMode = params.get("export") === "1";
  const randomSeedStr = params.get("seed") ?? "123";

  /**
   * IMPORTANT FOR PERFECT 60FPS LOOP EXPORT:
   * For frames to be an integer at 60fps: frames = loopMs * 60 / 1000 = loopMs * 3/50
   * Since loopMs is integer ms, we want loopMs to be a multiple of 50.
   */

  // Breathiness (overlap comes from pulseMs > beatMs)
  const pulseMs = 900;

  // Patterns speeds (chosen so loopMs is multiple of 50)
  // spiralOuter: 8 steps * 200 = 1600ms (multiple of 50 ✅)
  const spiralBeatMs = 200;
  const centerPulseMs = 2200; // center breath ONLY for spiralOuter (2200 multiple of 50 ✅)

  // waveDiagonal: 5 steps * 130 = 650ms (multiple of 50 ✅)
  const waveBeatMs = 130;

  // pulse: 3 steps * 200 = 600ms (multiple of 50 ✅)
  const pulseBeatMs = 200;

  // random: deterministic loop length
  const randomLoopMs = 2000; // multiple of 50 ✅
  const randomBeatMs = 100;  // spawn rate inside the loop (multiple of 50 ✅)
  const randomMinCells = 1;
  const randomMaxCells = 4;
  const randomMinAmp = 0.35;
  const randomMaxAmp = 1.0;

  // 0..8 indexing:
  // 0 1 2
  // 3 4 5
  // 6 7 8
  const PATTERNS = useMemo(
    () => ({
      // Outer spiral (center excluded)
      spiralOuter: [[0], [1], [2], [5], [8], [7], [6], [3]],

      // Diagonal wave: top-left -> bottom-right
      // [0] -> [1,3] -> [2,4,6] -> [5,7] -> [8]
      waveDiagonal: [[0], [1, 3], [2, 4, 6], [5, 7], [8]],

      // Center ripple outwards
      pulse: [[4], [1, 3, 5, 7], [0, 2, 6, 8]],
    }),
    []
  );

  // Beat + loop by pattern
  const { frames, beatMs, loopMs } = useMemo(() => {
    if (patternName === "spiralOuter") {
      const frames = PATTERNS.spiralOuter;
      return { frames, beatMs: spiralBeatMs, loopMs: frames.length * spiralBeatMs };
    }
    if (patternName === "waveDiagonal") {
      const frames = PATTERNS.waveDiagonal;
      return { frames, beatMs: waveBeatMs, loopMs: frames.length * waveBeatMs };
    }
    if (patternName === "pulse") {
      const frames = PATTERNS.pulse;
      return { frames, beatMs: pulseBeatMs, loopMs: frames.length * pulseBeatMs };
    }
    if (patternName === "random") {
      return { frames: null, beatMs: randomBeatMs, loopMs: randomLoopMs };
    }

    // fallback
    const frames = PATTERNS.spiralOuter;
    return { frames, beatMs: spiralBeatMs, loopMs: frames.length * spiralBeatMs };
  }, [patternName, PATTERNS, spiralBeatMs, waveBeatMs, pulseBeatMs, randomBeatMs, randomLoopMs]);

  // Time in ms (absolute)
  const [tAbs, setTAbs] = useState(0);

  /**
   * EXPORT MODE: allow external scripts to set time exactly
   */
  useEffect(() => {
    if (!exportMode) return;

    window.__setExportTime = (ms) => setTAbs(ms);
    window.__getLoopMs = () => loopMs;

    return () => {
      delete window.__setExportTime;
      delete window.__getLoopMs;
    };
  }, [exportMode, loopMs]);

  /**
   * NORMAL MODE: real-time animation clock
   */
  useEffect(() => {
    if (exportMode) return;

    let raf = 0;
    const start = performance.now();
    const tick = () => {
      setTAbs(performance.now() - start);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [exportMode]);

  /**
   * Breathy envelope: 0 -> 1 -> 0
   */
  const breathPulse = (dt, durationMs, amp = 1) => {
    if (dt < 0 || dt > durationMs) return 0;
    const x = dt / durationMs;        // 0..1
    const s = Math.sin(Math.PI * x);  // 0..1..0
    const breathy = Math.pow(s, 1.45);
    return amp * breathy;
  };

  /**
   * Deterministic RNG for loopable "random" pattern (seeded)
   */
  const seedToUint32 = (s) => {
    // simple hash -> uint32
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  const mulberry32 = (seed) => {
    let t = seed >>> 0;
    return () => {
      t += 0x6d2b79f5;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  };

  // Precompute ONE LOOP worth of random events so it loops perfectly
  const randomEvents = useMemo(() => {
    if (patternName !== "random") return [];
    const seed = seedToUint32(randomSeedStr);
    const rnd = mulberry32(seed);

    const randInt = (a, b) => Math.floor(a + rnd() * (b - a + 1));
    const randFloat = (a, b) => a + rnd() * (b - a);

    const events = []; // { t: ms, idx: 0..8, amp: 0..1 }

    for (let t = 0; t < randomLoopMs; t += randomBeatMs) {
      const count = randInt(randomMinCells, randomMaxCells);
      const chosen = new Set();
      while (chosen.size < count) chosen.add(randInt(0, 8));

      for (const idx of chosen) {
        events.push({
          t,
          idx,
          amp: randFloat(randomMinAmp, randomMaxAmp),
        });
      }
    }

    return events;
  }, [
    patternName,
    randomSeedStr,
    randomLoopMs,
    randomBeatMs,
    randomMinCells,
    randomMaxCells,
    randomMinAmp,
    randomMaxAmp,
  ]);

  /**
   * Intensities (0..1) for each cell, with overlap.
   */
  const intensities = useMemo(() => {
    const a = Array(9).fill(0);

    // Loop time for all patterns (even random)
    const tLoop = ((tAbs % loopMs) + loopMs) % loopMs;

    if (patternName === "random") {
      // Each event contributes to its cell; wrap gives loop continuity.
      for (const e of randomEvents) {
        let dt = tLoop - e.t;
        if (dt < 0) dt += loopMs;
        const v = breathPulse(dt, pulseMs, e.amp);
        if (v > a[e.idx]) a[e.idx] = v;
      }
      return a.map((v) => Math.max(0, Math.min(1, v)));
    }

    // Non-random patterns: looped timeline across frames
    for (let step = 0; step < frames.length; step++) {
      const eventTime = step * beatMs;

      let dt = tLoop - eventTime;
      if (dt < 0) dt += loopMs;

      for (const idx of frames[step]) {
        a[idx] = Math.max(a[idx], breathPulse(dt, pulseMs, 1.0));
      }
    }

    // Center pulse ONLY for spiralOuter
    if (patternName === "spiralOuter") {
      const centerDt = tAbs % centerPulseMs;
      a[4] = Math.max(a[4], breathPulse(centerDt, centerPulseMs, 0.9));
    }

    return a.map((v) => Math.max(0, Math.min(1, v)));
  }, [
    tAbs,
    loopMs,
    patternName,
    frames,
    beatMs,
    pulseMs,
    centerPulseMs,
    randomEvents,
  ]);

  return (
    <div className="page">
      <div className="grid">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="cell" style={{ "--a": intensities[i] }} />
        ))}
      </div>
    </div>
  );
}