'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useTheme } from "next-themes";
import Pointer from './pointer';
import Controls from './controls';
import { Button } from './ui/button';

interface WindowWithWebkitAudio {
  webkitAudioContext?: typeof AudioContext;
}

type Slice = { id: string; label: string; color: string; };

const DEFAULT_COLORS = [
  "#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6",
  "#eab308", "#f97316", "#06b6d4", "#84cc16", "#ec4899", "#8b5cf6"
];

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function pickColor(i: number) {
  return DEFAULT_COLORS[i % DEFAULT_COLORS.length];
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

export default function Wheel() {
  const [slices, setSlices] = useState<Slice[]>([
    { id: uid(), label: "Inception", color: pickColor(0) },
    { id: uid(), label: "The Matrix", color: pickColor(1) },
    { id: uid(), label: "Spirited Away", color: pickColor(2) }
  ]);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(pickColor(3));
  const [radius, setRadius] = useState(320);
  const [spinSecs, setSpinSecs] = useState(5);
  const [removalMode, setRemovalMode] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const rotationRef = useRef(0);
  // Audio plumbing
  const audioRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const lastIndexRef = useRef<number | null>(null);

  const [muted, setMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.6);

  const { resolvedTheme } = useTheme();

  const angle = useMemo(() => (slices.length ? (2 * Math.PI) / slices.length : 0), [slices.length]);

  // Persist/load sound prefs
  useEffect(() => {
    try {
      const m = localStorage.getItem('movieWheel.sound.muted');
      const v = localStorage.getItem('movieWheel.sound.volume');
      if (m !== null) setMuted(m === 'true');
      if (v !== null) setVolume(Number(v));
    } catch (e) {
      console.error("Error loading sound preferences:", e);
    }
  }, []);

  useEffect(() => {
    try { localStorage.setItem('movieWheel.sound.muted', String(muted)); } catch (e) { console.error("Error saving sound preferences:", e); }
    if (masterGainRef.current && audioRef.current) {
      const ctx = audioRef.current;
      const g = masterGainRef.current;
      const now = ctx.currentTime;
      g.gain.setValueAtTime(muted ? 0 : volume, now);
    }
  }, [muted, volume]);

  function addSlice() {
    const label = newLabel.trim();
    if (!label) return;
    setSlices(prev => [...prev, { id: uid(), label, color: newColor }]);
    setNewLabel("");
    setNewColor(pickColor(slices.length));
  }

  function removeSlice(id: string) {
    setSlices(prev => prev.filter(s => s.id !== id));
  }

  function clearAll() {
    setSlices([]);
    setWinner(null);
  }

  function shuffleColors() {
    setSlices(prev => prev.map((s, i) => ({ ...s, color: pickColor(i + Math.floor(Math.random() * DEFAULT_COLORS.length)) })));
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(slices, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "movie-wheel.json"; a.click();
    URL.revokeObjectURL(url);
  }

  function importJSON(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as Slice[];
        if (Array.isArray(data) && data.every(d => typeof d.label === "string" && typeof d.color === "string")) {
          const normalized = data.map((d, i) => ({ id: uid(), label: d.label, color: d.color || pickColor(i) }));
          setSlices(normalized);
        }
      } catch { }
    };
    reader.readAsText(file);
  }

  const wrapRightAlignedText = useCallback((ctx: CanvasRenderingContext2D, text: string, maxWidth: number, padding: number) => {
    const words = text.split(" ");
    let line = "";
    const lines: string[] = [];
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxWidth) {
        if (line) lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    let y = 4;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      ctx.fillText(l, radius - padding, y);
      y += 16;
    }
  }, [radius]);

  const draw = useCallback((rotation: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = radius * 2 + 20;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    // Read CSS variables from the document element (where the theme class
    // is applied by next-themes) so changes to the theme immediately update
    // the values we read. If that fails, fall back to the canvas element.
    let styleSource: CSSStyleDeclaration;
    try {
      styleSource = getComputedStyle(document.documentElement);
      // If the document doesn't expose the custom prop we want, fall back
      if (!styleSource.getPropertyValue("--card") && canvas) {
        styleSource = getComputedStyle(canvas);
      }
    } catch (e) {
      console.error("Error playing win sound:", e);
      styleSource = canvas ? getComputedStyle(canvas) : getComputedStyle(document.documentElement);
    }

    ctx.clearRect(0, 0, size, size);
    ctx.translate(size / 2, size / 2);

    ctx.save();
    ctx.rotate(rotation);

    if (slices.length === 0) {
      // use token-based background for empty wheel via CSS variable
      ctx.fillStyle = styleSource.getPropertyValue('--card') || 'black';
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = styleSource.getPropertyValue('--muted-foreground') || 'gray';
      ctx.font = "16px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      ctx.fillText("Add movies to start", 0, 6);
      ctx.restore();
      return;
    }

    for (let i = 0; i < slices.length; i++) {
      const start = i * angle;
      const end = start + angle;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = slices[i].color;
      ctx.fill();

      ctx.strokeStyle = styleSource.getPropertyValue('--border') || 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, radius, end, end);
      ctx.stroke();

      const mid = start + angle / 2;
      ctx.save();
      ctx.rotate(mid);
      ctx.textAlign = "right";
      ctx.fillStyle = styleSource.getPropertyValue('--foreground') || 'black';
      ctx.font = "bold 14px ui-sans-serif, system-ui";
      const text = slices[i].label;
      const maxWidth = radius - 24;
      wrapRightAlignedText(ctx, text, maxWidth, 8);
      ctx.restore();
    }

    // hub and inner ring use tokenized colors
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, 2 * Math.PI);
    ctx.fillStyle = styleSource.getPropertyValue('--card') || 'black';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, 2 * Math.PI);
    ctx.fillStyle = styleSource.getPropertyValue('--muted') || 'gray';
    ctx.fill();

    ctx.restore();
  }, [slices, radius, angle, wrapRightAlignedText]);

  // Redraw when slices, radius, or theme changes so CSS variables
  // (defined under :root/.dark) are re-read and applied to the canvas.
  // Use a double requestAnimationFrame to ensure the browser has applied
  // the theme class on the document before we read computed styles.
  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        draw(rotationRef.current);
      });
    });
    return () => {
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [draw, resolvedTheme]);

  // Also observe documentElement.class changes directly as a robust fallback
  // for theme toggles (next-themes toggles a class on the root). This
  // ensures we redraw even if the theme change happens outside React's
  // lifecycle timing.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && m.attributeName === "class") {
          // schedule redraw after paint
          requestAnimationFrame(() => requestAnimationFrame(() => draw(rotationRef.current)));
          break;
        }
      }
    });
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, [draw]);

  // --- Audio helpers -------------------------------------------------
  const ensureAudio = useCallback(async (): Promise<void> => {
    if (audioRef.current) return;

    const ctor = (typeof AudioContext !== 'undefined'
      ? AudioContext
      : (window as WindowWithWebkitAudio).webkitAudioContext);

    if (!ctor) throw new Error('AudioContext is not available in this environment');

    const ctx = new ctor();
    // resume to satisfy autoplay policies
    try { await ctx.resume(); } catch (e) { console.error("Error resuming audio context:", e); }
    const master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
    audioRef.current = ctx;
    masterGainRef.current = master;
  }, [muted, volume]);

  function playTick(): void {
    const ctx = audioRef.current;
    const master = masterGainRef.current;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 2200; // ~2.2 kHz
    // envelope ~50ms
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(1, now + 0.005);
    g.gain.linearRampToValueAtTime(0, now + 0.05);
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  function playWin(): void {
    const ctx = audioRef.current;
    const master = masterGainRef.current;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const freqs = [880, 1244, 1661];
    const dur = 0.125;
    for (let i = 0; i < freqs.length; i++) {
      const start = now + i * dur;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freqs[i];
      // quick attack & decay
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(1, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, start + dur - 0.02);
      osc.connect(g);
      g.connect(master);
      osc.start(start);
      osc.stop(start + dur);
    }
  }

  function spin() {
    if (isSpinning || slices.length === 0) return;
    setIsSpinning(true);
    setWinner(null);

    const turns = 4 + Math.floor(Math.random() * 3);
    const targetRotation = rotationRef.current + turns * 2 * Math.PI + Math.random() * 2 * Math.PI;

    const start = performance.now();
    const duration = Math.max(2, Math.min(12, spinSecs)) * 1000;

    // ensure audio on the user gesture that started the spin
    ensureAudio().then(() => {
      // initialize lastIndex so the very first frame doesn't tick
      try {
        const TAU = 2 * Math.PI;
        const rotNorm = ((rotationRef.current % TAU) + TAU) % TAU;
        const pointer = -Math.PI / 2;
        const relative = ((pointer - rotNorm) + TAU) % TAU;
        const eps = 1e-6;
        const idx = Math.floor(((relative - eps + TAU) % TAU) / angle) % slices.length;
        lastIndexRef.current = idx;
      } catch (e) { lastIndexRef.current = null; console.error("Error playing win sound:", e); }
    }).catch(() => { /* ignore */ });

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(t);
      const value = rotationRef.current + (targetRotation - rotationRef.current) * eased;
      // compute which slice is under the fixed pointer BEFORE drawing
      try {
        const TAU = 2 * Math.PI;
        const rotNorm = ((value % TAU) + TAU) % TAU;
        const pointer = -Math.PI / 2; // 12 o'clock
        const relative = ((pointer - rotNorm) + TAU) % TAU;
        const eps = 1e-6;
        const idx = Math.floor(((relative - eps + TAU) % TAU) / angle) % slices.length;
        if (idx !== lastIndexRef.current) {
          lastIndexRef.current = idx;
          // play tick when advancing into a new slice
          try { playTick(); } catch (e) { console.error("Error playing win sound:", e); }
        }
      } catch (e) { console.error("Error playing win sound:", e); }

      draw(value);
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        rotationRef.current = targetRotation;
        const TAU = 2 * Math.PI;
        const finalAngle = ((rotationRef.current % TAU) + TAU) % TAU;
        const pointer = -Math.PI / 2; // 12 o'clock
        const relative = ((pointer - finalAngle) + TAU) % TAU; // measure from 0-right to pointer
        const eps = 1e-6; // nudge off the boundary to prevent ties picking the right-hand slice
        const landedIdx = Math.floor(((relative - eps + TAU) % TAU) / angle) % slices.length;
        const landed = slices[landedIdx];
        setWinner(landed.label);
        if (removalMode) {
          setSlices(prev => prev.filter((_, i) => i !== landedIdx));
        }
        // celebratory sound and reset lastIndex so future spins re-init
        try { playWin(); } catch (e) {
          console.error("Error playing win sound:", e);
        }
        lastIndexRef.current = null;
        setIsSpinning(false);
      }
    };

    requestAnimationFrame(step);
  }

  return (
    <div className="w-full min-h-screen p-6">
      <div className="mx-auto max-w-6xl grid gap-6 md:grid-cols-[1fr_360px]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Pointer className="absolute left-1/2 -translate-x-1/2 -top-3 z-10 scale-200" />
            <canvas ref={canvasRef} className="rounded-full shadow-sm border bg-card" />
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={spin} disabled={isSpinning || slices.length === 0} aria-live="polite">{isSpinning ? 'Spinning' : 'Spin'}</Button>
            <Button variant="outline" onClick={shuffleColors} disabled={isSpinning}>Shuffle colors</Button>
            <Button variant="destructive" onClick={clearAll} disabled={isSpinning}>Clear</Button>
          </div>

          {winner && (
            <div className="text-center text-base mt-1 text-muted-foreground" role="status" aria-live="polite">
              Winner: <span className="font-semibold text-primary">{winner}</span>
            </div>
          )}
        </div>

        <Controls
          slices={slices}
          radius={radius}
          spinSecs={spinSecs}
          removalMode={removalMode}
          isSpinning={isSpinning}
          winner={winner}
          setRadius={setRadius}
          setSpinSecs={setSpinSecs}
          setRemovalMode={setRemovalMode}
          addSlice={addSlice}
          newLabel={newLabel}
          setNewLabel={setNewLabel}
          newColor={newColor}
          setNewColor={setNewColor}
          removeSlice={removeSlice}
          shuffleColors={shuffleColors}
          clearAll={clearAll}
          exportJSON={exportJSON}
          importJSON={importJSON}
          muted={muted}
          volume={volume}
          setMuted={setMuted}
          setVolume={setVolume}
        />
      </div>
    </div>
  );
}
