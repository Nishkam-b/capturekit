import { CLICK_MS, type CursorState } from "./path";

export interface CursorStyle {
  /** Draw a cursor arrow (tab recordings don't include the cursor in the video). */
  show: boolean;
  /** Arrow size multiplier (1 = normal). */
  size: number;
  /** 0..1 smoothing (used when building the path). */
  smoothing: number;
  highlight: { enabled: boolean; color: string; size: number; opacity: number };
  click: { style: "ripple" | "none"; color: string };
  hideIdle: boolean;
  /** Shifts cursor timing relative to the video (ms). */
  offsetMs: number;
  /** Arrow look: dark arrow with white edge, light arrow with dark edge, or a presenter dot. */
  theme: CursorTheme;
  /** Cursor briefly shrinks and springs back on each click. */
  clickBounce: boolean;
  /** 0..1: faint trail behind a fast-moving cursor. */
  motionBlur: number;
  /** Cursor tilts slightly in the direction it moves. */
  sway: boolean;
}

export type CursorTheme = "dark" | "light" | "dot";
export const CURSOR_THEMES: [CursorTheme, string][] = [
  ["dark", "Dark"],
  ["light", "Light"],
  ["dot", "Dot"],
];

export const DEFAULT_CURSOR_STYLE: CursorStyle = {
  show: true,
  size: 1.4,
  smoothing: 0.5,
  highlight: { enabled: false, color: "#facc15", size: 2.2, opacity: 0.35 },
  click: { style: "ripple", color: "#10b981" },
  hideIdle: false,
  offsetMs: 0,
  theme: "dark",
  clickBounce: true,
  motionBlur: 0.4,
  sway: false,
};

/** Bounce scale for a click `age` ms ago: dips to 0.78 and springs back with a small overshoot. */
export function bounceScale(age: number): number {
  if (age < 0 || age > 360) return 1;
  const k = age / 360;
  return 1 - 0.22 * Math.sin(Math.PI * Math.min(1, k * 1.6)) * (1 - k) + 0.05 * Math.sin(Math.PI * k) * k;
}

/** Arrow outline in units of the arrow's height (tip at 0,0). */
const ARROW: Array<[number, number]> = [
  [0, 0],
  [0, 0.78],
  [0.19, 0.61],
  [0.32, 0.9],
  [0.45, 0.84],
  [0.32, 0.56],
  [0.56, 0.56],
];

export interface PointMapper {
  /** Maps normalised source coords to output pixels, or null if cropped out. */
  (nx: number, ny: number): { x: number; y: number } | null;
}

/** Draws cursor effects for one frame. `unit` = base size in output px. */
export function drawCursor(ctx: CanvasRenderingContext2D, state: CursorState, style: CursorStyle, map: PointMapper, unit: number): void {
  // Click ripples (drawn even if the cursor itself is hidden).
  if (style.click.style === "ripple") {
    for (const c of state.clicks) {
      const p = map(c.x, c.y);
      if (!p) continue;
      const k = c.age / CLICK_MS;
      const r = unit * (0.4 + 1.8 * easeOut(k));
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = style.click.color;
      ctx.lineWidth = Math.max(1.5, unit * 0.18 * (1 - k * 0.6));
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = (1 - k) * 0.25;
      ctx.fillStyle = style.click.color;
      ctx.fill();
      ctx.restore();
    }
  }

  if (!state.visible) return;
  let alpha = 1;
  if (style.hideIdle && state.idleMs > 1500) alpha = Math.max(0, 1 - (state.idleMs - 1500) / 300);
  if (alpha <= 0) return;
  const p = map(state.x, state.y);
  if (!p) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  if (style.highlight.enabled) {
    ctx.save();
    ctx.globalAlpha = alpha * style.highlight.opacity;
    ctx.fillStyle = style.highlight.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, unit * style.highlight.size * 0.5 * style.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (style.show) {
    let scale = state.pressed ? 0.9 : 1;
    if (style.clickBounce && state.clicks.length) scale *= bounceScale(Math.min(...state.clicks.map((c) => c.age)));
    const h = unit * style.size * scale;
    const speed = Math.hypot(state.vx, state.vy);
    // Motion blur: ghost copies along the recent path, only when moving fast.
    const blur = (style.motionBlur ?? 0) * Math.min(1, Math.max(0, (speed - 0.4) / 2));
    if (blur > 0.02) {
      const steps = 5;
      for (let k = steps; k >= 1; k--) {
        const back = (k / steps) * 0.035 * blur;
        const q = map(state.x - state.vx * back, state.y - state.vy * back);
        if (!q) continue;
        ctx.save();
        ctx.globalAlpha = alpha * 0.18 * (1 - k / (steps + 1));
        ctx.translate(q.x, q.y);
        drawShape(ctx, style.theme, h, false);
        ctx.restore();
      }
    }
    ctx.translate(p.x, p.y);
    if (style.sway && style.theme !== "dot") ctx.rotate(Math.max(-0.35, Math.min(0.35, state.vx * 0.12)));
    drawShape(ctx, style.theme, h, true);
  }
  ctx.restore();
}

function drawShape(ctx: CanvasRenderingContext2D, theme: CursorTheme | undefined, h: number, shadow: boolean) {
  if (shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = h * 0.12;
    ctx.shadowOffsetY = h * 0.04;
  }
  ctx.beginPath();
  if (theme === "dot") {
    ctx.arc(0, 0, h * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(17,24,39,0.85)";
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = Math.max(1.5, h * 0.06);
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    return;
  }
  ARROW.forEach(([ax, ay], i) => (i === 0 ? ctx.moveTo(ax * h, ay * h) : ctx.lineTo(ax * h, ay * h)));
  ctx.closePath();
  ctx.fillStyle = theme === "light" ? "#ffffff" : "#111827";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1, h * 0.07);
  ctx.strokeStyle = theme === "light" ? "#111827" : "#ffffff";
  ctx.stroke();
}

function easeOut(k: number) {
  return 1 - (1 - k) * (1 - k);
}
