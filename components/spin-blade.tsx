'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Label } from './ui/label';

// Movie Beyblade Battle — single-file React + Canvas, no dependencies
// What you get
// - Add movies via form; each becomes a spinning top on a circular arena
// - Simple 2D physics: collisions, wall bounces, friction, angular spin
// - HP and knock-outs; last remaining movie wins
// - Deterministic fixed-timestep simulation; pause/resume; reset; seedable RNG
// - Settings for arena size, friction, damage, and top size

// Types
type Top = {
  id: string;
  label: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ang: number; // radians
  vang: number; // angular velocity
  r: number; // radius
  hp: number; // 0..100
  alive: boolean;
};

type Settings = {
  arenaR: number;
  friction: number; // linear damping per second
  spinFriction: number; // angular damping per second
  damage: number; // damage multiplier
  topR: number;
  seed: number;
};

const DEFAULT_COLORS = [
  "#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6",
  "#eab308", "#f97316", "#06b6d4", "#84cc16", "#ec4899", "#8b5cf6"
];

function uid() { return Math.random().toString(36).slice(2, 9); }

// Seeded RNG so replays are repeatable
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export default function SpinBlade() {
  const [movies, setMovies] = useState<{ id: string; label: string; color: string; }[]>([
    { id: uid(), label: "Inception", color: DEFAULT_COLORS[0] },
    { id: uid(), label: "The Matrix", color: DEFAULT_COLORS[1] },
    { id: uid(), label: "Spirited Away", color: DEFAULT_COLORS[2] },
  ]);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_COLORS[3]);

  const [settings, setSettings] = useState<Settings>({
    arenaR: 250,
    friction: 0.15,
    spinFriction: 0.2,
    damage: 1,
    topR: 26,
    seed: 1337,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef({ running: false, tops: [] as Top[], winner: null as string | null });
  const rafRef = useRef<number | null>(null);
  const rngRef = useRef<() => number>(() => Math.random());

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  // Build initial state
  const spawnTops = useCallback(() => {
    const { arenaR, topR, seed } = settings;
    rngRef.current = mulberry32(seed);
    const n = movies.length;
    const rr = arenaR - topR - 6;
    const angleStep = (2 * Math.PI) / Math.max(1, n);
    const arr: Top[] = movies.map((m, i) => {
      const a = i * angleStep + rngRef.current() * 0.2; // small jitter
      const r = rr * 0.85 + rr * 0.15 * rngRef.current();
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      const speed = 120 + 80 * rngRef.current();
      const dir = a + Math.PI + (rngRef.current() - 0.5) * 0.6;
      const vx = Math.cos(dir) * speed;
      const vy = Math.sin(dir) * speed;
      const vang = (rngRef.current() - 0.5) * 14;
      return {
        id: m.id, label: m.label, color: m.color,
        x, y, vx, vy, ang: a, vang, r: topR,
        hp: 100, alive: true,
      };
    });
    simRef.current.tops = arr;
    simRef.current.winner = null;
  }, [movies, settings]);

  // Controls
  function start() {
    if (movies.length < 2) return;
    spawnTops();
    simRef.current.running = true;
    tick();
  }
  function pause() { simRef.current.running = false; if (rafRef.current) cancelAnimationFrame(rafRef.current); }
  function reset() { pause(); spawnTops(); draw(); }

  // Physics
  const FIXED_DT = 1 / 120; // 120 Hz sim
  const WALL_RESTITUTION = 0.85;
  const COLL_RESTITUTION = 0.8;

  function physicsStep(dt: number) {
    const s = settings; const tops = simRef.current.tops;
    // Integrate, apply damping
    for (const t of tops) if (t.alive) {
      t.x += t.vx * dt; t.y += t.vy * dt; t.ang += t.vang * dt;
      t.vx *= Math.max(0, 1 - s.friction * dt); t.vy *= Math.max(0, 1 - s.friction * dt);
      t.vang *= Math.max(0, 1 - s.spinFriction * dt);
    }
    // Wall collisions and ring out
    for (const t of tops) if (t.alive) {
      const dist = Math.hypot(t.x, t.y);
      const limit = s.arenaR - t.r - 4;
      if (dist > limit) {
        // Normal from center
        const nx = t.x / dist; const ny = t.y / dist;
        // Push back to boundary
        const pen = dist - limit;
        t.x -= nx * pen; t.y -= ny * pen;
        // Reflect velocity
        const vn = t.vx * nx + t.vy * ny; // normal component
        const vtX = t.vx - vn * nx; const vtY = t.vy - vn * ny; // tangential
        const rvx = vtX - vn * nx * WALL_RESTITUTION;
        const rvy = vtY - vn * ny * WALL_RESTITUTION;
        t.vx = rvx; t.vy = rvy;
        // Damage on wall hit
        const impact = Math.abs(vn);
        t.hp -= (impact * 0.03) * s.damage;
      }
      // Ring out
      if (dist > s.arenaR + 40 || t.hp <= 0 || (Math.hypot(t.vx, t.vy) < 5 && Math.abs(t.vang) < 0.2)) {
        t.alive = false;
      }
    }
    // Pair collisions
    for (let i = 0; i < tops.length; i++) {
      const a = tops[i]; if (!a.alive) continue;
      for (let j = i + 1; j < tops.length; j++) {
        const b = tops[j]; if (!b.alive) continue;
        const dx = b.x - a.x; const dy = b.y - a.y; const d2 = dx * dx + dy * dy; const rsum = a.r + b.r;
        if (d2 < rsum * rsum) {
          const d = Math.sqrt(Math.max(1e-6, d2));
          const nx = dx / d; const ny = dy / d;
          // Separate
          const pen = rsum - d; const half = pen / 2;
          a.x -= nx * half; a.y -= ny * half; b.x += nx * half; b.y += ny * half;
          // Relative velocity
          const rvx = b.vx - a.vx; const rvy = b.vy - a.vy; const relN = rvx * nx + rvy * ny;
          // Impulse (equal mass)
          const jimp = -(1 + COLL_RESTITUTION) * relN / 2;
          const ix = jimp * nx; const iy = jimp * ny;
          a.vx -= ix; a.vy -= iy; b.vx += ix; b.vy += iy;
          // Spin kick
          a.vang += (rvx * -ny + rvy * nx) * 0.01; b.vang -= (rvx * -ny + rvy * nx) * 0.01;
          // Damage from impact
          const impact = Math.abs(relN);
          const dmg = (impact * 0.04) * settings.damage;
          a.hp -= dmg; b.hp -= dmg;
        }
      }
    }
    // Check winner
    const alive = tops.filter(t => t.alive);
    if (alive.length <= 1) {
      simRef.current.running = false;
      simRef.current.winner = alive[0]?.label || null;
    }
  }

  // Rendering
  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const pad = 24; const size = settings.arenaR * 2 + pad * 2;
    canvas.width = size * dpr; canvas.height = size * dpr; canvas.style.width = `${size}px`; canvas.style.height = `${size}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Read tokens from the canvas element so `.dark` overrides on body are respected
    const styleSource = canvas ? getComputedStyle(canvas) : getComputedStyle(document.documentElement);

    ctx.fillStyle = styleSource.getPropertyValue('--background')?.trim() || '#0b1020';
    ctx.fillRect(0, 0, size, size);

    ctx.translate(size / 2, size / 2);

    // Arena ring
    ctx.beginPath();
    ctx.arc(0, 0, settings.arenaR + 8, 0, Math.PI * 2);
    ctx.fillStyle = styleSource.getPropertyValue('--muted')?.trim() || '#0f172a'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, settings.arenaR, 0, Math.PI * 2);
    ctx.fillStyle = styleSource.getPropertyValue('--card')?.trim() || '#111827'; ctx.fill();

    // Pointer at 12 o'clock
    ctx.save();
    ctx.translate(0, -settings.arenaR - 6);
    ctx.fillStyle = styleSource.getPropertyValue('--destructive')?.trim() || '#ef4444';
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
    ctx.restore();

    // Tops
    const tops = simRef.current.tops;
    for (const t of tops) {
      const alpha = t.alive ? 1 : 0.22;
      // Body
      ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.ang);
      ctx.globalAlpha = alpha;
      // rim
      ctx.beginPath(); ctx.arc(0, 0, t.r + 3, 0, Math.PI * 2); ctx.fillStyle = styleSource.getPropertyValue('--muted')?.trim() || '#0f172a'; ctx.fill();
      // core
      ctx.beginPath(); ctx.arc(0, 0, t.r, 0, Math.PI * 2); ctx.fillStyle = t.color; ctx.fill();
      // center cap
      ctx.beginPath(); ctx.arc(0, 0, Math.max(6, t.r * 0.35), 0, Math.PI * 2); ctx.fillStyle = styleSource.getPropertyValue('--card-foreground')?.trim() || 'rgba(255,255,255,0.75)'; ctx.fill();
      ctx.restore();
      // HP bar
      const hpw = 56; const hph = 6; const pct = Math.max(0, Math.min(1, t.hp / 100));
      ctx.save(); ctx.translate(t.x, t.y - t.r - 14);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(-hpw / 2, -hph / 2, hpw, hph);
      // green / yellow / destructive tokens
      const hpGood = styleSource.getPropertyValue('--chart-1')?.trim() || '#10b981';
      const hpMid = styleSource.getPropertyValue('--chart-4')?.trim() || '#f59e0b';
      const hpBad = styleSource.getPropertyValue('--destructive')?.trim() || '#ef4444';
      ctx.fillStyle = pct > 0.5 ? hpGood : pct > 0.25 ? hpMid : hpBad;
      ctx.fillRect(-hpw / 2, -hph / 2, hpw * pct, hph);
      ctx.restore();
      // Label
      ctx.save(); ctx.translate(t.x, t.y + t.r + 18); ctx.font = '12px ui-sans-serif, system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = "white";
      ctx.fillStyle = styleSource.getPropertyValue('--foreground')?.trim() || 'white';
      ctx.fillText(t.label, 0, 0); ctx.restore();
    }

    // Winner banner
    if (simRef.current.winner) {
      ctx.save(); ctx.font = 'bold 18px ui-sans-serif, system-ui'; ctx.textAlign = 'center';
      ctx.fillStyle = styleSource.getPropertyValue('--chart-2')?.trim() || '#facc15';
      ctx.fillText(`Winner: ${simRef.current.winner}`, 0, settings.arenaR + 40);
      ctx.restore();
    }
  }, [dpr, settings.arenaR]);

  // Main loop
  function tick() {
    const step = FIXED_DT; let acc = 0; let last = performance.now();
    const loop = () => {
      if (!simRef.current.running) return;
      const now = performance.now(); acc += (now - last) / 1000; last = now;
      while (acc >= step) { physicsStep(step); acc -= step; }
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }

  useEffect(() => { spawnTops(); draw(); return pause; }, [draw, spawnTops]);

  // Re-draw when the document theme class changes (.dark toggled on <html> or <body>).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          // requestAnimationFrame twice to ensure style recalculation has settled
          requestAnimationFrame(() => requestAnimationFrame(() => {
            try { draw(); } catch (e) {
              console.error("Error drawing canvas:", e);
            }
          }));
          break;
        }
      }
    });
    obs.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [draw]);

  // UI helpers
  const canStart = useMemo(() => movies.length >= 2, [movies.length]);

  function addMovie() {
    const label = newLabel.trim(); if (!label) return;
    setMovies(prev => [...prev, { id: uid(), label, color: newColor }]);
    setNewLabel(""); setNewColor(DEFAULT_COLORS[(movies.length) % DEFAULT_COLORS.length]);
  }
  function removeMovie(id: string) { setMovies(prev => prev.filter(m => m.id !== id)); }

  // Render
  return (
    <div className="min-h-screen w-full p-6">
      <div className="mx-auto max-w-6xl grid gap-6 md:grid-cols-[1fr_360px]">
        {/* Arena */}
        <div className="flex flex-col items-center gap-4">
          <canvas ref={canvasRef} className="rounded-2xl shadow-2xl border bg-card border-border" />
          <div className="flex gap-3">
            <Button onClick={start} disabled={!canStart}>{canStart ? 'Start battle' : 'Start battle'}</Button>
            <Button variant="outline" onClick={simRef.current.running ? pause : start}>{simRef.current.running ? 'Pause' : 'Resume'}</Button>
            <Button variant="ghost" onClick={reset}>Reset</Button>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Add movie</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Input placeholder="Movie title" value={newLabel} onChange={e => setNewLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addMovie(); }} />
                <input type="color" className="h-[42px] w-[56px] rounded-lg border border-border bg-card p-1" value={newColor} onChange={e => setNewColor(e.target.value)} />
                <Button onClick={addMovie}>Add</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Arena settings</CardTitle>
            </CardHeader>
            <CardContent>
              <Label>Arena size: {settings.arenaR}px</Label>
              <input type="range" min={160} max={320} value={settings.arenaR} onChange={e => setSettings(s => ({ ...s, arenaR: parseInt(e.target.value) }))} className="w-full" />

              <Label className="mt-3">Top size: {settings.topR}px</Label>
              <input type="range" min={16} max={40} value={settings.topR} onChange={e => setSettings(s => ({ ...s, topR: parseInt(e.target.value) }))} className="w-full" />

              <Label className="mt-3">Friction: {settings.friction.toFixed(2)}</Label>
              <input type="range" min={0.05} max={0.5} step={0.01} value={settings.friction} onChange={e => setSettings(s => ({ ...s, friction: parseFloat(e.target.value) }))} className="w-full" />

              <Label className="mt-3">Spin friction: {settings.spinFriction.toFixed(2)}</Label>
              <input type="range" min={0.05} max={0.6} step={0.01} value={settings.spinFriction} onChange={e => setSettings(s => ({ ...s, spinFriction: parseFloat(e.target.value) }))} className="w-full" />

              <Label className="mt-3">Damage: {settings.damage.toFixed(2)}×</Label>
              <input type="range" min={0.5} max={2} step={0.05} value={settings.damage} onChange={e => setSettings(s => ({ ...s, damage: parseFloat(e.target.value) }))} className="w-full" />

              <Label className="mt-3">Seed: {settings.seed}</Label>
              <input type="range" min={1} max={10000} step={1} value={settings.seed} onChange={e => setSettings(s => ({ ...s, seed: parseInt(e.target.value) }))} className="w-full" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Roster</CardTitle>
            </CardHeader>
            <CardContent>
              {movies.length === 0 ? <p className="text-muted-foreground">No movies yet.</p> : (
                <ul className="space-y-2 max-h-[260px] overflow-auto pr-1">
                  {movies.map((m, i) => (
                    <li key={m.id} className="flex items-center gap-2">
                      <span className="inline-block h-4 w-4 rounded-sm" style={{ background: m.color }} />
                      <span className="flex-1 truncate">{i + 1}. {m.label}</span>
                      <Button variant="ghost" onClick={() => removeMovie(m.id)}>Remove</Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
