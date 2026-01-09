import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { execSync } from "child_process";

const pattern = process.argv[2] ?? "spiralOuter";
const fps = Number(process.argv[3] ?? 60);
const seed = process.argv[4] ?? "123"; // only matters for random

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

const dt = 1000 / fps;

const pad = (n) => String(n).padStart(5, "0");

async function main() {
  const outDir = path.join("renders", pattern);
  fs.mkdirSync(outDir, { recursive: true });

  // export=1 enables deterministic time control
  const url =
    pattern === "random"
      ? `${BASE_URL}/?p=${encodeURIComponent(pattern)}&export=1&seed=${encodeURIComponent(seed)}`
      : `${BASE_URL}/?p=${encodeURIComponent(pattern)}&export=1`;

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 512, height: 512 }, // doesn't matter much since we screenshot the grid element
    deviceScaleFactor: 2, // higher resolution screenshots
  });

  await page.goto(url, { waitUntil: "networkidle" });

  // Ask the app what the loop duration is (so we don't duplicate logic here)
  const loopMs = await page.evaluate(() => window.__getLoopMs());
  if (!Number.isFinite(loopMs) || loopMs <= 0) {
    throw new Error(`Invalid loopMs returned from app: ${loopMs}`);
  }

  // For perfect loops: render frames at t = 0, dt, 2dt, ... (frameCount-1)*dt
  // And DO NOT render t = loopMs exactly (that would duplicate frame 0)
  const frameCountFloat = (loopMs * fps) / 1000;
  const frameCount = Math.round(frameCountFloat);

  // If this isn't very close to an integer, your loopMs isn't "fps-friendly".
  // The App.jsx values above are chosen so this should be exact at 60fps.
  const err = Math.abs(frameCountFloat - frameCount);
  if (err > 1e-6) {
    console.warn(
      `Warning: loopMs=${loopMs}ms at fps=${fps} gives non-integer frames (${frameCountFloat}). ` +
        `Loop may have a tiny seam. Consider making loopMs a multiple of 50ms for 60fps.`
    );
  }

  const grid = page.locator(".grid");

  for (let i = 0; i < frameCount; i++) {
    const t = i * dt; // exact timestamps
    await page.evaluate((ms) => window.__setExportTime(ms), t);
    await grid.screenshot({ path: path.join(outDir, `${pad(i)}.png`) });
  }

  await browser.close();

  const outVideo = `${pattern}${pattern === "random" ? `_seed-${seed}` : ""}_hevc.mov`;

  // Encode frames -> HEVC (macOS hardware encoder)
  // -tag:v hvc1 improves compatibility with Apple players.
  execSync(
    `ffmpeg -y -framerate ${fps} -i ${outDir}/%05d.png ` +
      `-c:v hevc_videotoolbox -tag:v hvc1 -pix_fmt yuv420p -movflags +faststart ` +
      `${outVideo}`,
    { stdio: "inherit" }
  );

  console.log(`\n✅ Wrote ${outVideo}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});