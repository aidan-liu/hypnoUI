import { memo, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const COLOR_THEMES = [
  { id: "ice", name: "Ice", rgb: "150, 210, 255" },
  { id: "ember", name: "Ember", rgb: "255, 190, 140" },
  { id: "rose", name: "Rose", rgb: "255, 140, 170" },
  { id: "mint", name: "Mint", rgb: "140, 255, 210" },
  { id: "violet", name: "Violet", rgb: "200, 175, 255" },
  { id: "gold", name: "Gold", rgb: "255, 235, 160" },
];

const CATEGORY_LABELS = {
  ring: "Rings",
  corners: "Corners",
  edges: "Edges",
  rows: "Rows",
  cols: "Columns",
  diag: "Diagonals",
  ripple: "Ripples",
  pulse: "Pulses",
  checker: "Checkers",
  bar: "Bars",
  box: "Boxes",
  snake: "Snakes",
  quadrant: "Quadrants",
  arc: "Arcs",
  diamond: "Diamonds",
  scan: "Scans",
  rain: "Rain",
  stair: "Stairs",
  misc: "Misc",
};

const GALLERY_FPS = 12;
const CELL_INDICES = Array.from({ length: 9 }, (_, i) => i);
const VIDEO_FORMATS = [
  { id: "webm-vp9", label: "WebM (VP9)", mime: "video/webm;codecs=vp9", ext: "webm" },
  { id: "webm-vp8", label: "WebM (VP8)", mime: "video/webm;codecs=vp8", ext: "webm" },
  { id: "webm", label: "WebM", mime: "video/webm", ext: "webm" },
  { id: "mp4-avc", label: "MP4 (H.264)", mime: "video/mp4;codecs=\"avc1.42E01E\"", ext: "mp4" },
  { id: "mp4-baseline", label: "MP4 (Baseline)", mime: "video/mp4;codecs=\"avc1.42E01E,mp4a.40.2\"", ext: "mp4" },
  { id: "mp4", label: "MP4", mime: "video/mp4", ext: "mp4" },
];

const normalizeHex = (value) => {
  const trimmed = value.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
    return trimmed
      .split("")
      .map((char) => `${char}${char}`)
      .join("")
      .toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return null;
};

const hexToRgb = (hex) => {
  if (!hex) return null;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
};

const breathPulse = (dt, durationMs, amp = 1) => {
  if (dt < 0 || dt > durationMs) return 0;
  const x = dt / durationMs;
  const s = Math.sin(Math.PI * x);
  const breathy = Math.pow(s, 1.45);
  return amp * breathy;
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));

const computeIntensities = (tAbs, pattern) => {
  const { frames, beatMs, loopMs, pulseMs = 900 } = pattern;
  const tLoop = ((tAbs % loopMs) + loopMs) % loopMs;
  const output = Array(9).fill(0);

  for (let step = 0; step < frames.length; step++) {
    const cells = frames[step];
    const eventTime = step * beatMs;
    let dt = tLoop - eventTime;
    if (dt < 0) dt += loopMs;

    const v = breathPulse(dt, pulseMs, 1);
    if (v <= 0) continue;

    for (const idx of cells) {
      if (v > output[idx]) output[idx] = v;
    }
  }

  return output.map(clamp01);
};

const useInView = (rootMargin = "140px", threshold = 0.12) => {
  const ref = useRef(null);
  const [isInView, setIsInView] = useState(
    () => typeof IntersectionObserver === "undefined"
  );

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { rootMargin, threshold }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin, threshold]);

  return [ref, isInView];
};

const galleryClock = (() => {
  let listeners = new Set();
  let raf = 0;
  let start = 0;
  let last = 0;
  const frameMs = 1000 / GALLERY_FPS;

  const tick = (now) => {
    if (!listeners.size) {
      raf = 0;
      return;
    }
    if (now - last >= frameMs) {
      const elapsed = now - start;
      const quantized = Math.floor(elapsed / frameMs) * frameMs;
      for (const listener of listeners) listener(quantized);
      last = now;
    }
    raf = requestAnimationFrame(tick);
  };

  const startClock = () => {
    if (raf) return;
    start = performance.now();
    last = start;
    raf = requestAnimationFrame(tick);
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) startClock();
      return () => {
        listeners.delete(listener);
        if (!listeners.size && raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      };
    },
  };
})();

const useGalleryTime = (active) => {
  const [tAbs, setTAbs] = useState(0);

  useEffect(() => {
    if (!active) return;
    return galleryClock.subscribe(setTAbs);
  }, [active]);

  return tAbs;
};

const buildPatterns = () => {
  const patterns = [];
  const add = (id, label, frames, beatMs = 140, category = "misc") => {
    patterns.push({
      id,
      label,
      frames,
      beatMs,
      loopMs: frames.length * beatMs,
      category,
    });
  };

  const ring = [0, 1, 2, 5, 8, 7, 6, 3];
  const corners = [0, 2, 8, 6];
  const edges = [1, 5, 7, 3];
  const rows = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
  ];
  const cols = [
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
  ];
  const diagWaveTL = [[0], [1, 3], [2, 4, 6], [5, 7], [8]];
  const diagWaveTR = [[2], [1, 5], [0, 4, 8], [3, 7], [6]];

  const chase = (order, windowSize) =>
    order.map((_, i) => {
      const group = [];
      for (let w = 0; w < windowSize; w++) {
        group.push(order[(i + w) % order.length]);
      }
      return group;
    });

  const pingPong = (frames) => frames.concat(frames.slice(1, -1).reverse());

  const skip = (order, step) => {
    const frames = [];
    let idx = 0;
    for (let i = 0; i < order.length; i++) {
      frames.push([order[idx]]);
      idx = (idx + step) % order.length;
    }
    return frames;
  };

  const addSequence = (id, label, order, beatMs = 120, category = "misc") => {
    add(
      id,
      label,
      order.map((idx) => [idx]),
      beatMs,
      category
    );
  };

  [1, 2, 3, 4].forEach((size) => {
    add(`ring-${size}-cw`, `ring-${size}-cw`, chase(ring, size), 120, "ring");
    add(
      `ring-${size}-ccw`,
      `ring-${size}-ccw`,
      chase([...ring].reverse(), size),
      120,
      "ring"
    );
  });

  add("ring-skip-3-cw", "ring-skip-3-cw", skip(ring, 3), 130, "ring");
  add(
    "ring-skip-3-ccw",
    "ring-skip-3-ccw",
    skip([...ring].reverse(), 3),
    130,
    "ring"
  );

  add(
    "ring-opposite",
    "ring-opposite",
    ring.map((_, i) => [ring[i], ring[(i + 4) % ring.length]]),
    140,
    "ring"
  );
  add(
    "ring-gap-2",
    "ring-gap-2",
    ring.map((_, i) => [ring[i], ring[(i + 2) % ring.length]]),
    140,
    "ring"
  );
  add(
    "ring-gap-3",
    "ring-gap-3",
    ring.map((_, i) => [ring[i], ring[(i + 3) % ring.length]]),
    140,
    "ring"
  );

  add("corners-cw", "corners-cw", chase(corners, 1), 160, "corners");
  add("corners-ccw", "corners-ccw", chase([...corners].reverse(), 1), 160, "corners");
  add("edges-cw", "edges-cw", chase(edges, 1), 160, "edges");
  add("edges-ccw", "edges-ccw", chase([...edges].reverse(), 1), 160, "edges");

  add("rows-down", "rows-down", rows, 200, "rows");
  add("rows-up", "rows-up", [...rows].reverse(), 200, "rows");
  add("cols-right", "cols-right", cols, 200, "cols");
  add("cols-left", "cols-left", [...cols].reverse(), 200, "cols");

  add("rows-bounce", "rows-bounce", pingPong(rows), 180, "rows");
  add("cols-bounce", "cols-bounce", pingPong(cols), 180, "cols");

  add(
    "rows-split",
    "rows-split",
    [[0, 1, 2, 6, 7, 8], [3, 4, 5], [0, 1, 2, 6, 7, 8]],
    190,
    "rows"
  );
  add(
    "cols-split",
    "cols-split",
    [[0, 3, 6, 2, 5, 8], [1, 4, 7], [0, 3, 6, 2, 5, 8]],
    190,
    "cols"
  );

  add("diag-wave-tl", "diag-wave-tl", diagWaveTL, 150, "diag");
  add("diag-wave-tr", "diag-wave-tr", diagWaveTR, 150, "diag");
  add("diag-bounce-tl", "diag-bounce-tl", pingPong(diagWaveTL), 150, "diag");
  add("diag-bounce-tr", "diag-bounce-tr", pingPong(diagWaveTR), 150, "diag");

  add("ripple-out", "ripple-out", [[4], [1, 3, 5, 7], [0, 2, 6, 8]], 200, "ripple");
  add("ripple-in", "ripple-in", [[0, 2, 6, 8], [1, 3, 5, 7], [4]], 200, "ripple");
  add("edge-ripple", "edge-ripple", [[1, 3, 5, 7], [0, 2, 6, 8], [1, 3, 5, 7]], 190, "ripple");
  add(
    "corner-ripple",
    "corner-ripple",
    [[0, 2, 6, 8], [1, 3, 5, 7], [4], [1, 3, 5, 7], [0, 2, 6, 8]],
    190,
    "ripple"
  );

  add("center-echo", "center-echo", [[4], [1, 3, 5, 7], [4]], 190, "pulse");
  add("cross-echo", "cross-echo", [[4], [1, 3, 4, 5, 7], [4]], 190, "pulse");
  add("x-echo", "x-echo", [[4], [0, 2, 4, 6, 8], [4]], 190, "pulse");

  add("checkerboard", "checkerboard", [[0, 2, 4, 6, 8], [1, 3, 5, 7]], 210, "checker");
  add("checkerboard-flip", "checkerboard-flip", [[0, 2, 6, 8], [1, 3, 4, 5, 7]], 210, "checker");

  const barRotate = [[0, 1, 2], [2, 5, 8], [6, 7, 8], [0, 3, 6]];
  add("bar-rotate-cw", "bar-rotate-cw", barRotate, 170, "bar");
  add("bar-rotate-ccw", "bar-rotate-ccw", [...barRotate].reverse(), 170, "bar");

  const ringGroup = [0, 1, 2, 5, 8, 7, 6, 3];
  add("box-in", "box-in", [ringGroup, [1, 3, 5, 7], [4]], 210, "box");
  add("box-out", "box-out", [[4], [1, 3, 5, 7], ringGroup], 210, "box");

  const snakeRowLR = [0, 1, 2, 5, 4, 3, 6, 7, 8];
  const snakeRowRL = [2, 1, 0, 3, 4, 5, 8, 7, 6];
  const snakeColTB = [0, 3, 6, 7, 4, 1, 2, 5, 8];
  const snakeColBT = [6, 3, 0, 1, 4, 7, 8, 5, 2];
  addSequence("snake-row-lr", "snake-row-lr", snakeRowLR, 120, "snake");
  addSequence("snake-row-rl", "snake-row-rl", snakeRowRL, 120, "snake");
  addSequence("snake-col-tb", "snake-col-tb", snakeColTB, 120, "snake");
  addSequence("snake-col-bt", "snake-col-bt", snakeColBT, 120, "snake");

  const quadrants = [
    [0, 1, 3, 4],
    [1, 2, 4, 5],
    [4, 5, 7, 8],
    [3, 4, 6, 7],
  ];
  add("quadrant-cw", "quadrant-cw", quadrants, 180, "quadrant");
  add("quadrant-ccw", "quadrant-ccw", [...quadrants].reverse(), 180, "quadrant");

  const arcs = [
    [0, 1, 3],
    [1, 2, 5],
    [5, 8, 7],
    [3, 6, 7],
  ];
  add("arc-cw", "arc-cw", arcs, 170, "arc");
  add("arc-ccw", "arc-ccw", [...arcs].reverse(), 170, "arc");

  const diamond = [
    [1, 4],
    [5, 4],
    [7, 4],
    [3, 4],
  ];
  add("diamond-cw", "diamond-cw", diamond, 170, "diamond");
  add("diamond-ccw", "diamond-ccw", [...diamond].reverse(), 170, "diamond");

  addSequence("scan-row", "scan-row", [0, 1, 2, 3, 4, 5, 6, 7, 8], 110, "scan");
  addSequence("scan-row-rev", "scan-row-rev", [8, 7, 6, 5, 4, 3, 2, 1, 0], 110, "scan");

  addSequence("rain-left", "rain-left", [0, 3, 6, 1, 4, 7, 2, 5, 8], 110, "rain");
  addSequence("rain-right", "rain-right", [2, 5, 8, 1, 4, 7, 0, 3, 6], 110, "rain");

  add(
    "stair-tl",
    "stair-tl",
    [[0], [0, 1], [0, 1, 2], [1, 2, 5], [2, 5, 8], [5, 8], [8]],
    160,
    "stair"
  );
  add(
    "stair-br",
    "stair-br",
    [[8], [8, 7], [8, 7, 6], [7, 6, 3], [6, 3, 0], [3, 0], [0]],
    160,
    "stair"
  );

  return patterns;
};

const PATTERNS = buildPatterns().map((pattern, index) => {
  const phaseMs = pattern.loopMs ? (index * 97) % pattern.loopMs : 0;
  const theme = COLOR_THEMES[index % COLOR_THEMES.length];
  const previewIntensities = computeIntensities(phaseMs, pattern);
  return {
    ...pattern,
    phaseMs,
    defaultColor: theme.rgb,
    defaultColorId: theme.id,
    previewIntensities,
  };
});

const PATTERN_MAP = Object.fromEntries(PATTERNS.map((pattern) => [pattern.id, pattern]));
const COLOR_MAP = Object.fromEntries(
  COLOR_THEMES.map((theme) => [theme.id, theme])
);
const getMatrixTemplate = (count) =>
  `minmax(140px, 220px) repeat(${count}, minmax(120px, 1fr))`;

const MatrixTile = memo(function MatrixTile({
  pattern,
  color,
  intensities,
  colorIndex,
  isActive,
}) {
  const delay = `${Math.min(colorIndex * 0.04, 0.2)}s`;

  return (
    <a
      className={`pattern-tile${isActive ? " active" : ""}`}
      href={`?p=${encodeURIComponent(pattern.id)}&c=${encodeURIComponent(color.param ?? color.id)}`}
      style={{ "--glow": color.rgb, "--delay": delay }}
      title={`${pattern.label} - ${color.name}`}
      aria-label={`${pattern.label} in ${color.name}`}
    >
      <div className="pattern-preview">
        <div className="grid">
          {CELL_INDICES.map((i) => (
            <div key={i} className="cell" style={{ "--a": intensities[i] }} />
          ))}
        </div>
      </div>
    </a>
  );
});

function PatternRow({ pattern, activeColorId, colors, matrixTemplate }) {
  const [ref, isVisible] = useInView();
  const tAbs = useGalleryTime(isVisible);
  const liveIntensities = useMemo(() => {
    if (!isVisible) return pattern.previewIntensities;
    return computeIntensities(tAbs + pattern.phaseMs, pattern);
  }, [isVisible, tAbs, pattern]);

  return (
    <div ref={ref} className="matrix-row" style={{ gridTemplateColumns: matrixTemplate }}>
      <div className="matrix-label">
        <span>{pattern.label}</span>
        <em>{CATEGORY_LABELS[pattern.category] ?? pattern.category}</em>
      </div>
      {colors.map((color, colorIndex) => (
        <MatrixTile
          key={`${pattern.id}-${color.id}`}
          pattern={pattern}
          color={color}
          intensities={
            color.id === activeColorId
              ? liveIntensities
              : pattern.previewIntensities
          }
          colorIndex={colorIndex}
          isActive={color.id === activeColorId}
        />
      ))}
    </div>
  );
}

function PatternPlayer({ pattern, exportMode, color }) {
  const [tAbs, setTAbs] = useState(0);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderError, setRenderError] = useState("");
  const [formatId, setFormatId] = useState("");
  const supportedFormats = useMemo(() => {
    if (typeof MediaRecorder === "undefined") return [];
    return VIDEO_FORMATS.filter((format) => MediaRecorder.isTypeSupported(format.mime));
  }, []);

  useEffect(() => {
    if (!formatId && supportedFormats.length) {
      setFormatId(supportedFormats[0].id);
    }
  }, [formatId, supportedFormats]);

  useEffect(() => {
    if (!exportMode) return;

    window.__setExportTime = (ms) => setTAbs(ms);
    window.__getLoopMs = () => pattern.loopMs;

    return () => {
      delete window.__setExportTime;
      delete window.__getLoopMs;
    };
  }, [exportMode, pattern.loopMs]);

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

  const intensities = useMemo(
    () => computeIntensities(tAbs, pattern),
    [tAbs, pattern]
  );
  const glow = color ?? pattern.defaultColor;
  const activeFormat =
    supportedFormats.find((format) => format.id === formatId) ?? supportedFormats[0];
  const canRender = !exportMode && activeFormat && !isRendering;

  const handleRender = async () => {
    if (!activeFormat || isRendering) return;
    setRenderError("");
    setRenderProgress(0);
    setIsRendering(true);

    let cleanup = () => {};
    try {
      const parsed = glow.split(",").map((value) => Number.parseInt(value.trim(), 10));
      const rgb = parsed.map((value) => (Number.isFinite(value) ? value : 255));
      const baseName = `${pattern.id}-${rgb.join("-")}`;
      const fps = 60;
      const frameMs = 1000 / fps;
      const totalFrames = Math.round((pattern.loopMs * fps) / 1000);
      const progressStep = Math.max(1, Math.floor(fps / 6));

      const size = 512;
      const padding = Math.round(size * 0.16);
      const cell = Math.floor((size - padding * 2) / 3);
      const gridSize = cell * 3;
      const offset = Math.round((size - gridSize) / 2);

      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      canvas.style.position = "fixed";
      canvas.style.left = "-10000px";
      canvas.style.top = "0";
      canvas.style.opacity = "0";
      document.body.appendChild(canvas);
      cleanup = () => canvas.remove();
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setRenderError("Canvas unavailable.");
        return;
      }

      const draw = (frameIndex) => {
        const t = (frameIndex * frameMs) % pattern.loopMs;
        const frameIntensities = computeIntensities(t, pattern);

        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, size, size);

        frameIntensities.forEach((value, index) => {
          const x = offset + (index % 3) * cell;
          const y = offset + Math.floor(index / 3) * cell;
          const alpha = 0.08 + 0.85 * value;
          ctx.save();
          ctx.shadowColor = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${0.45 * value})`;
          ctx.shadowBlur = 18 + 24 * value;
          ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
          ctx.fillRect(x, y, cell, cell);
          ctx.restore();
        });
      };

      draw(0);

      const stream = canvas.captureStream(fps);
      const track = stream.getVideoTracks()[0];
      if (!track) {
        setRenderError("Video capture unavailable.");
        return;
      }
      if (track?.requestFrame) track.requestFrame();
      let recorder;
      try {
        recorder = new MediaRecorder(stream, {
          mimeType: activeFormat.mime,
          videoBitsPerSecond: 4_000_000,
        });
      } catch (error) {
        recorder = new MediaRecorder(stream);
      }
      const outputMime = recorder.mimeType || activeFormat.mime;
      const outputExt = outputMime.includes("mp4") ? "mp4" : "webm";
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        setRenderError("Video export failed.");
      };
      const stopped = new Promise((resolve) => {
        recorder.onstop = resolve;
      });

      recorder.start(100);

      for (let frame = 0; frame < totalFrames; frame += 1) {
        draw(frame);
        if (track?.requestFrame) track.requestFrame();
        if (frame % progressStep === 0) {
          setRenderProgress(frame / totalFrames);
        }
        await new Promise((resolve) => setTimeout(resolve, frameMs));
      }

      recorder.requestData();
      await new Promise((resolve) => setTimeout(resolve, 120));
      recorder.stop();
      await stopped;
      track?.stop();

      if (!chunks.length) {
        setRenderError("No data captured.");
        return;
      }

      const blob = new Blob(chunks, { type: outputMime });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${baseName}.${outputExt}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setRenderError("Video export failed.");
    } finally {
      cleanup();
      setIsRendering(false);
      setRenderProgress(0);
    }
  };

  return (
    <div className="player" style={{ "--glow": glow }}>
      {!exportMode ? (
        <a className="back-link" href="/">
          Back to grid
        </a>
      ) : null}
      {!exportMode ? (
        <div className="player-controls">
          <label>
            <span>Format</span>
            <select
              value={formatId}
              onChange={(event) => setFormatId(event.target.value)}
              disabled={!supportedFormats.length || isRendering}
            >
              {supportedFormats.map((format) => (
                <option key={format.id} value={format.id}>
                  {format.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={handleRender} disabled={!canRender}>
            {isRendering
              ? `Rendering ${Math.round(renderProgress * 100)}%`
              : "Render video"}
          </button>
          {!supportedFormats.length ? (
            <span className="render-error">Video export not supported.</span>
          ) : renderError ? (
            <span className="render-error">{renderError}</span>
          ) : null}
        </div>
      ) : null}
      <div className="player-label">{pattern.label}</div>
      <div className="grid">
        {CELL_INDICES.map((i) => (
          <div key={i} className="cell" style={{ "--a": intensities[i] }} />
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const patternParam = params.get("p");
  const exportMode = params.get("export") === "1";
  const colorParam = params.get("c");
  let color = null;
  if (colorParam) {
    const mapped = COLOR_MAP[colorParam];
    if (mapped) {
      color = mapped.rgb;
    } else {
      const normalized = normalizeHex(colorParam);
      color = normalized ? hexToRgb(normalized) : null;
    }
  }

  const pattern = patternParam ? PATTERN_MAP[patternParam] : null;
  if (pattern) {
    return <PatternPlayer pattern={pattern} exportMode={exportMode} color={color} />;
  }

  const [activeColorId, setActiveColorId] = useState(COLOR_THEMES[0].id);
  const [customHex, setCustomHex] = useState("#8CFAFF");
  const customHexNormalized = useMemo(() => normalizeHex(customHex), [customHex]);
  const customRgb = useMemo(
    () => hexToRgb(customHexNormalized) ?? "255, 255, 255",
    [customHexNormalized]
  );
  const colors = useMemo(
    () => [
      ...COLOR_THEMES,
      {
        id: "custom",
        name: customHexNormalized ? `Custom ${`#${customHexNormalized}`}` : "Custom",
        rgb: customRgb,
        param: customHexNormalized ?? "FFFFFF",
      },
    ],
    [customRgb, customHexNormalized]
  );
  const matrixTemplate = useMemo(
    () => getMatrixTemplate(colors.length),
    [colors.length]
  );

  return (
    <div className="app">
      <header className="hero">
        <h1>Hypno UI</h1>
      </header>

      <section className="matrix">
        <div className="matrix-row matrix-header" style={{ gridTemplateColumns: matrixTemplate }}>
          <div className="matrix-corner">Animation</div>
          {colors.map((theme) => {
            if (theme.id === "custom") {
              return (
                <div key={theme.id} className="matrix-swatch custom" style={{ "--glow": theme.rgb }}>
                  <button
                    type="button"
                    className={activeColorId === theme.id ? "active" : ""}
                    onClick={() => setActiveColorId(theme.id)}
                  >
                    <span className="swatch-dot" />
                    <span>Custom</span>
                  </button>
                  <input
                    className="hex-input"
                    value={customHex}
                    onChange={(event) => {
                      setCustomHex(event.target.value);
                      setActiveColorId("custom");
                    }}
                    placeholder="#RRGGBB"
                    aria-label="Custom color hex"
                  />
                </div>
              );
            }

            return (
              <button
                key={theme.id}
                type="button"
                className={`matrix-swatch${activeColorId === theme.id ? " active" : ""}`}
                style={{ "--glow": theme.rgb }}
                onClick={() => setActiveColorId(theme.id)}
              >
                <span className="swatch-dot" />
                <span>{theme.name}</span>
              </button>
            );
          })}
        </div>
        {PATTERNS.map((pattern) => (
          <PatternRow
            key={pattern.id}
            pattern={pattern}
            activeColorId={activeColorId}
            colors={colors}
            matrixTemplate={matrixTemplate}
          />
        ))}
      </section>
    </div>
  );
}
