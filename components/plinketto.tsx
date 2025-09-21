'use client'

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

/**
 * Plinketto — single file React + Canvas
 *
 * What you get
 * - Hex‑staggered peg grid with configurable rows and spacing
 * - Physics: gravity, collisions with pegs and walls, light friction, bounciness
 * - Slots at the bottom; falling balls score into a slot
 * - Click or press Space to drop from the pointer or the top center
 * - Simple UI to tweak settings, labels, and reset
 * - Responsive canvas with crisp DPR scaling
 */

// ----------------------------- Types ------------------------------

type Peg = { x: number; y: number; r: number };

type Ball = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alive: boolean;
  color: string;
};

type Settings = {
  rows: number; // peg rows
  pegRadius: number;
  pegGapX: number; // horizontal gap between pegs in a row
  pegGapY: number; // vertical gap between rows
  gravity: number; // px/s^2
  bounce: number; // restitution 0..1
  friction: number; // linear damping per second 0..1
  ballRadius: number;
  wallPadding: number; // side padding of the board
  slotCount: number; // number of bins at the bottom
  slotHeight: number; // height of the slot area
};

// ------------------------ Helper functions ------------------------

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rand = (a: number, b: number) => a + Math.random() * (b - a);

const niceColors = [
  "#ff6b6b",
  "#ffd93d",
  "#6bcB77",
  "#4d96ff",
  "#b06bff",
  "#ff8fab",
  "#00c2ff",
  "#ffaa00",
];

// -------------------------- Main Component ------------------------

export default function Plinketto() {
  const parentRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [dropping, setDropping] = useState(false);
  // bump this when the document theme (class/vars) changes so render closure updates
  const [themeVersion, setThemeVersion] = useState(0);
  const nextId = useRef(1);

  // Read theme CSS variables (fall back to the original hard-coded colors)
  const getCss = (name: string, fallback: string) => {
    if (typeof window === "undefined") return fallback;
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v || fallback).trim();
  };

  const uiStyle = {
    background: getCss("--color-card", "#ffffff"),
    color: getCss("--color-card-foreground", "#111"),
    borderColor: getCss("--color-border", "#e8e8ec"),
  } as React.CSSProperties;

  const themeColors = {
    backdropTop: getCss("--color-popover", "#fafafb"),
    backdropBottom: getCss("--color-card", "#f2f2f7"),
    fanColors: [
      getCss("--color-chart-1", "#ffb3c1"),
      getCss("--color-chart-2", "#9ea1ff"),
      getCss("--color-chart-3", "#c1fba4"),
      getCss("--color-chart-4", "#c8b6ff"),
      getCss("--color-chart-5", "#a0e7e5"),
    ],
    wall: getCss("--color-border", "#e8e8ec"),
    peg: getCss("--color-input", "#ccccd6"),
    slotArea: getCss("--color-card", "#f9f9fb"),
    slotTrim: getCss("--color-border", "#eaeaf2"),
    label: getCss("--color-foreground", "#2b2b30"),
    count: getCss("--color-muted-foreground", "#6b7280"),
    pointer: getCss("--color-foreground", "#333"),
    ballColors: [
      getCss("--color-chart-1", "#ff6b6b"),
      getCss("--color-chart-2", "#ffd93d"),
      getCss("--color-chart-3", "#6bcB77"),
      getCss("--color-chart-4", "#4d96ff"),
      getCss("--color-chart-5", "#b06bff"),
    ],
  };

  // Settings with sensible defaults
  const [settings, setSettings] = useState<Settings>({
    rows: 13,
    pegRadius: 6,
    pegGapX: 50,
    pegGapY: 45,
    gravity: 1400,
    bounce: 0.5,
    friction: 0.0025,
    ballRadius: 9,
    wallPadding: 38,
    slotCount: 11,
    slotHeight: 90,
  });

  // Slot labels
  const [labels, setLabels] = useState<string[]>(["VORHEES", "BLADE", "RAZOR", "FATAL FIND", "CHOP", "FREE PICK", "BEAST", "BLAST", "TRASH", "WILD", "GEM"]);

  // Simulation state
  const balls = useRef<Ball[]>([]);
  const pegs = useRef<Peg[]>([]);
  const slotHits = useRef<number[]>(Array(settings.slotCount).fill(0));
  const [lastSlot, setLastSlot] = useState<number | null>(null);

  // Derived board size from parent width
  const size = useCanvasSize(parentRef, 16 / 10); // aspect ratio about the photo

  // Rebuild pegs when settings or size change
  useEffect(() => {
    pegs.current = buildPegGrid({
      w: size.w,
      h: size.h - settings.slotHeight,
      rows: settings.rows,
      pegR: settings.pegRadius,
      gapX: settings.pegGapX,
      gapY: settings.pegGapY,
      padX: settings.wallPadding,
      padY: 40,
    });
    // reset slots when slot count changes
    slotHits.current = Array(settings.slotCount).fill(0);
    setLastSlot(null);
  }, [settings.rows, settings.pegRadius, settings.pegGapX, settings.pegGapY, settings.slotCount, settings.slotHeight, settings.wallPadding, size.w, size.h]);

  // Resize canvas for DPR
  useEffect(() => {
    const c = canvasRef.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.floor(size.w * dpr);
    c.height = Math.floor(size.h * dpr);
    c.style.width = `${size.w}px`;
    c.style.height = `${size.h}px`;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [size.w, size.h]);

  // Repaint immediately when theme changes so canvas colors update (themeVersion bumps via MutationObserver)
  useEffect(() => {
    render();
  }, [themeVersion]);

  // Pointer for drop control
  useEffect(() => {
    const el = canvasRef.current!;
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      setPointer({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    el.addEventListener("pointermove", onMove);
    return () => el.removeEventListener("pointermove", onMove);
  }, []);

  // Keyboard: Space to drop center, D to toggle auto drop
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        dropBall(size.w * 0.5, 30);
      }
      if (e.key.toLowerCase() === "d") setDropping(v => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [size.w]);

  // Observe theme changes (next-themes toggles a class on <html>) so canvas colors update immediately
  useEffect(() => {
    if (typeof window === "undefined") return;
    const el = document.documentElement;
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && (m.attributeName === "class" || m.attributeName === "style")) {
          setThemeVersion(v => v + 1);
          break;
        }
      }
    });
    mo.observe(el, { attributes: true, attributeFilter: ["class", "style"] });
    return () => mo.disconnect();
  }, []);

  // Click to drop at pointer
  const onClick = useCallback(() => {
    dropBall(pointer.x, 30);
  }, [pointer.x]);

  function dropBall(x: number, y: number) {
    const id = nextId.current++;
    const b: Ball = {
      id,
      x: clamp(x, settings.wallPadding + settings.ballRadius + 2, size.w - settings.wallPadding - settings.ballRadius - 2),
      y,
      vx: rand(-40, 40),
      vy: 0,
      r: settings.ballRadius,
      alive: true,
      color: themeColors.ballColors[id % themeColors.ballColors.length],
    };
    balls.current.push(b);
  }

  function reset() {
    balls.current = [];
    slotHits.current = Array(settings.slotCount).fill(0);
    setLastSlot(null);
  }

  // Main loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const step = (t: number) => {
      const dt = Math.min(0.033, (t - last) / 1000);
      last = t;

      // Auto drop if enabled
      if (dropping && Math.random() < 0.06) dropBall(rand(settings.wallPadding, size.w - settings.wallPadding), 28);

      physics(dt);
      render();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [dropping, settings, size.w, size.h, themeVersion]);

  // Physics step
  function physics(dt: number) {
    const w = size.w;
    const h = size.h - settings.slotHeight;
    const left = settings.wallPadding;
    const right = w - settings.wallPadding;

    for (const b of balls.current) {
      if (!b.alive) continue;
      // integrate
      b.vy += settings.gravity * dt;
      b.vx *= 1 - settings.friction;
      b.vy *= 1 - settings.friction;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // walls
      if (b.x - b.r < left) {
        b.x = left + b.r;
        b.vx = -b.vx * settings.bounce;
      } else if (b.x + b.r > right) {
        b.x = right - b.r;
        b.vx = -b.vx * settings.bounce;
      }

      // pegs
      for (const p of pegs.current) {
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        const dist2 = dx * dx + dy * dy;
        const minDist = b.r + p.r;
        if (dist2 < minDist * minDist) {
          const dist = Math.sqrt(dist2) || 0.0001;
          const nx = dx / dist;
          const ny = dy / dist;
          // separate
          const overlap = minDist - dist;
          b.x += nx * overlap;
          b.y += ny * overlap;
          // reflect velocity
          const vn = b.vx * nx + b.vy * ny; // component along normal
          const tx = b.vx - vn * nx;
          const ty = b.vy - vn * ny;
          const rvn = -vn * settings.bounce;
          b.vx = tx + rvn * nx;
          b.vy = ty + rvn * ny;
        }
      }

      // floor into slots
      if (b.y - b.r > h) {
        b.alive = false;
        const slotW = (right - left) / settings.slotCount;
        const idx = clamp(Math.floor((clamp(b.x, left, right - 1) - left) / slotW), 0, settings.slotCount - 1);
        slotHits.current[idx] += 1;
        setLastSlot(idx);
      }
    }

    // trim dead balls for perf
    if (balls.current.length > 200) balls.current = balls.current.filter(b => b.alive);
  }

  // Render frame
  function render() {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    const w = size.w;
    const h = size.h;

    // clear
    ctx.clearRect(0, 0, w, h);

  // backdrop stripes for a little vibe (use theme colors)
  drawBackdrop(ctx, w, h, settings.wallPadding, themeColors);

    // board area
    const boardBottom = h - settings.slotHeight;
  // walls
  ctx.fillStyle = themeColors.wall;
    ctx.fillRect(settings.wallPadding - 6, 24, 6, boardBottom - 24);
    ctx.fillRect(w - settings.wallPadding, 24, 6, boardBottom - 24);

  // pegs
  ctx.fillStyle = themeColors.peg;
    for (const p of pegs.current) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // balls
    for (const b of balls.current) {
      if (!b.alive) continue;
      ctx.beginPath();
      ctx.fillStyle = b.color;
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.shadowColor = "rgba(0,0,0,0.15)";
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

  // slots
  drawSlots(ctx, w, h, settings, slotHits.current, labels, lastSlot, themeColors);

    // pointer marker for drops
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = themeColors.pointer;
    ctx.beginPath();
    ctx.moveTo(pointer.x, 10);
    ctx.lineTo(pointer.x, 34);
    ctx.stroke();
    ctx.restore();
  }

  return (
    <div ref={parentRef} className="w-full max-w-5xl mx-auto p-4">
      <h1 className="text-2xl font-semibold tracking-tight mb-2">Plinketto</h1>

      <Controls
        settings={settings}
        onChange={setSettings}
        labels={labels}
        setLabels={setLabels}
        lastSlot={lastSlot}
        slotHits={slotHits.current}
        onDrop={() => dropBall(pointer.x || size.w * 0.5, 30)}
        onReset={reset}
        dropping={dropping}
        setDropping={setDropping}
      />

      <div className="relative select-none rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <canvas
          ref={canvasRef}
          onClick={onClick}
          className="block w-full h-auto cursor-crosshair touch-none"
        />
      </div>
      <p className="text-sm text-zinc-500 mt-3">Tip: click to drop from the cursor. Press Space to drop from center. Press D to toggle auto drop.</p>
    </div>
  );
}

// -------------------------- UI Subtree ----------------------------

function Controls({
  settings,
  onChange,
  labels,
  setLabels,
  lastSlot,
  slotHits,
  onDrop,
  onReset,
  dropping,
  setDropping,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  labels: string[];
  setLabels: (v: string[]) => void;
  lastSlot: number | null;
  slotHits: number[];
  onDrop: () => void;
  onReset: () => void;
  dropping: boolean;
  setDropping: (v: boolean) => void;
}) {
  const small = "px-3 py-2";

  return (
    <div className="mb-3 grid gap-2 md:grid-cols-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onDrop}>Drop</Button>
        <Button variant={dropping ? "default" : "outline"} size="sm" onClick={() => setDropping(!dropping)}>
          {dropping ? "Auto: on" : "Auto: off"}
        </Button>
        <Button variant="outline" size="sm" onClick={onReset}>Reset</Button>
        {lastSlot != null && (
          <span className="ml-2 text-sm text-zinc-600">Last slot: <b>{labels[lastSlot] ?? `#${lastSlot + 1}`}</b></span>
        )}
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-sm">
        <NumberField label="Rows" value={settings.rows} min={6} max={18} step={1}
          onChange={v => onChange({ ...settings, rows: v })} />
        <NumberField label="Slots" value={settings.slotCount} min={5} max={17} step={1}
          onChange={v => onChange({ ...settings, slotCount: v })} />
        <NumberField label="Ball r" value={settings.ballRadius} min={6} max={14} step={1}
          onChange={v => onChange({ ...settings, ballRadius: v })} />
        <NumberField label="Peg r" value={settings.pegRadius} min={4} max={10} step={1}
          onChange={v => onChange({ ...settings, pegRadius: v })} />
        <NumberField label="Gap X" value={settings.pegGapX} min={36} max={64} step={2}
          onChange={v => onChange({ ...settings, pegGapX: v })} />
        <NumberField label="Gap Y" value={settings.pegGapY} min={36} max={60} step={1}
          onChange={v => onChange({ ...settings, pegGapY: v })} />
        <NumberField label="Bounce" value={settings.bounce} min={0.2} max={0.8} step={0.05}
          onChange={v => onChange({ ...settings, bounce: v })} />
      </div>

      <div className="md:col-span-2">
        <label className="text-sm font-medium text-zinc-700">Slot labels</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-1">
          {Array.from({ length: settings.slotCount }).map((_, i) => (
            <Input
              key={i}
              value={labels[i] ?? ""}
              onChange={e => {
                const copy = labels.slice();
                copy[i] = e.target.value;
                setLabels(copy);
              }}
              placeholder={`Slot ${i + 1}`}
            />
          ))}
        </div>
      </div>

      <div className="md:col-span-2 text-xs text-zinc-500">
        Physics note: this is arcade style, not a perfect solver. It is stable and fun for hundreds of balls.
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange, step = 1, min, max }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  return (
    <Label className="flex flex-col gap-1">
      <span className="text-zinc-600">{label}</span>
      <Input
        type="number"
        value={Number(value.toFixed(3))}
        step={step}
        min={min}
        max={max}
        onChange={e => onChange(Number(e.target.value))}
      />
    </Label>
  );
}

// ------------------------- Board geometry -------------------------

function buildPegGrid(args: { w: number; h: number; rows: number; pegR: number; gapX: number; gapY: number; padX: number; padY: number }): Peg[] {
  const { w, h, rows, pegR, gapX, gapY, padX, padY } = args;
  const left = padX;
  const right = w - padX;
  const pegs: Peg[] = [];
  const usableW = right - left;

  for (let r = 0; r < rows; r++) {
    const y = padY + r * gapY;
    const cols = Math.floor(usableW / gapX) - 1; // tighter fit
    const offset = (r % 2 === 0 ? 0 : gapX * 0.5);
    for (let c = 0; c <= cols; c++) {
      const x = left + offset + c * gapX;
      if (x < left + pegR + 4 || x > right - pegR - 4) continue;
      if (y < padY || y > h - 10) continue;
      pegs.push({ x, y, r: pegR });
    }
  }
  return pegs;
}

// ------------------------------ Drawing ---------------------------

function drawBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, pad: number, theme?: { backdropTop?: string; backdropBottom?: string; fanColors?: string[] }) {
  // soft radial center
  const top = theme?.backdropTop ?? "#fafafb";
  const bottom = theme?.backdropBottom ?? "#f2f2f7";
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // fan stripes on sides (use theme fan colors when available)
  const cx = w * 0.5;
  const colors = theme?.fanColors ?? ["#ffb3c1", "#9ea1ff", "#c1fba4", "#c8b6ff", "#a0e7e5"];
  const radius = Math.max(w, h) * 1.2;

  for (let i = 0; i < 8; i++) {
    const a0 = (-Math.PI / 2) + i * 0.11 - 0.2;
    const a1 = a0 + 0.09;
    ctx.beginPath();
    ctx.moveTo(cx, h * 0.22);
    ctx.arc(cx, h * 0.22, radius, a0, a1);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.globalAlpha = 0.18;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawSlots(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  s: Settings,
  hits: number[],
  labels: string[],
  lastSlot: number | null,
  theme?: { slotArea?: string; slotTrim?: string; label?: string; count?: string }
) {
  const left = s.wallPadding;
  const right = w - s.wallPadding;
  const boardBottom = h - s.slotHeight;

  // header trim
  ctx.fillStyle = theme?.slotTrim ?? "#eaeaf2";
  ctx.fillRect(left, boardBottom - 10, right - left, 6);

  // slot area
  ctx.fillStyle = theme?.slotArea ?? "#f9f9fb";
  ctx.fillRect(left, boardBottom, right - left, s.slotHeight);

  const slotW = (right - left) / s.slotCount;
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--color-border") || "#d8d8e0";
  for (let i = 0; i <= s.slotCount; i++) {
    const x = left + i * slotW;
    ctx.beginPath();
    ctx.moveTo(x, boardBottom);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // labels + counts
  ctx.fillStyle = theme?.label ?? "#2b2b30";
  ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < s.slotCount; i++) {
    const x = left + i * slotW + slotW * 0.5;
    const y = boardBottom + s.slotHeight * 0.34;
    const label = labels[i] ?? `#${i + 1}`;
    if (i === lastSlot) {
      ctx.fillStyle = "#111";
      ctx.fillText(label, x, y);
      ctx.fillStyle = theme?.label ?? "#2b2b30";
    } else {
      ctx.fillText(label, x, y);
    }

    // count
    ctx.fillStyle = theme?.count ?? "#6b7280";
    ctx.fillText(String(hits[i] ?? 0), x, boardBottom + s.slotHeight * 0.7);
    ctx.fillStyle = theme?.label ?? "#2b2b30";
  }
}

// ---------------------------- Utilities ---------------------------

function useCanvasSize<T extends HTMLElement>(parentRef: React.RefObject<T | null> | React.MutableRefObject<T | null>, aspect = 16 / 10) {
  const [size, setSize] = useState({ w: 900, h: Math.round(900 / aspect) });
  useEffect(() => {
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.max(480, Math.floor(e.contentRect.width));
        setSize({ w, h: Math.round(w / aspect) });
      }
    });
    if (parentRef.current) ro.observe(parentRef.current);
    return () => ro.disconnect();
  }, [parentRef, aspect]);
  return size;
}
