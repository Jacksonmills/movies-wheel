"use client";

import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { useTheme } from "next-themes";

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

type WheelContextType = {
  slices: Slice[];
  addSlice: () => void;
  removeSlice: (id: string) => void;
  clearAll: () => void;
  shuffleColors: () => void;
  exportJSON: () => void;
  importJSON: (f: File) => void;
  radius: number;
  setRadius: (n: number) => void;
  spinSecs: number;
  setSpinSecs: (n: number) => void;
  removalMode: boolean;
  setRemovalMode: (b: boolean) => void;
  isSpinning: boolean;
  winner: string | null;
  spin: () => void;
  newLabel: string;
  setNewLabel: (s: string) => void;
  newColor: string;
  setNewColor: (s: string) => void;
  muted: boolean;
  setMuted: (b: boolean) => void;
  volume: number;
  setVolume: (n: number) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasShown: boolean;
};

const WheelContext = createContext<WheelContextType | null>(null);

export function useWheel() {
  const ctx = useContext(WheelContext);
  if (!ctx) throw new Error('useWheel must be used within a WheelProvider');
  return ctx;
}

export function WheelProvider({ children }: { children: React.ReactNode; }) {
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
  const [canvasShown, setCanvasShown] = useState(false);
  const canvasShownRef = useRef(false);

  const rotationRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const lastIndexRef = useRef<number | null>(null);

  const [muted, setMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.6);

  const { resolvedTheme } = useTheme();

  const angle = useMemo(() => (slices.length ? (2 * Math.PI) / slices.length : 0), [slices.length]);

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

    let styleSource: CSSStyleDeclaration;
    try {
      styleSource = getComputedStyle(document.documentElement);
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
      ctx.rotate(-rotation);
      ctx.fillStyle = styleSource.getPropertyValue('--card') || 'black';
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, 2 * Math.PI);
      ctx.fill();

      ctx.fillStyle = styleSource.getPropertyValue('--muted-foreground') || 'gray';
      ctx.font = "16px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Add movies to start", 0, 0);

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

    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, 2 * Math.PI);
    ctx.fillStyle = styleSource.getPropertyValue('--card') || 'black';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, 2 * Math.PI);
    ctx.fillStyle = styleSource.getPropertyValue('--muted') || 'gray';
    ctx.fill();

    ctx.restore();

    if (!canvasShownRef.current) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        canvasShownRef.current = true;
        try { setCanvasShown(true); } catch (e) { }
      }));
    }
  }, [slices, radius, angle, wrapRightAlignedText]);

  // Draw during layout changes to avoid visual lag when controls (like size) update rapidly.
  useLayoutEffect(() => {
    try {
      // Draw synchronously so the canvas matches the latest `radius` before paint.
      draw(rotationRef.current);
    } catch (e) {
      // Fallback to async draw if sync draw throws for some reason.
      requestAnimationFrame(() => draw(rotationRef.current));
    }
  }, [draw, resolvedTheme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && m.attributeName === "class") {
          requestAnimationFrame(() => requestAnimationFrame(() => draw(rotationRef.current)));
          break;
        }
      }
    });
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, [draw]);

  const ensureAudio = useCallback(async (): Promise<void> => {
    if (audioRef.current) return;

    const ctor = (typeof AudioContext !== 'undefined'
      ? AudioContext
      : (window as WindowWithWebkitAudio).webkitAudioContext);

    if (!ctor) throw new Error('AudioContext is not available in this environment');

    const ctx = new ctor();
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
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.09);

    const bodyFilter = ctx.createBiquadFilter();
    bodyFilter.type = 'bandpass';
    bodyFilter.frequency.value = 800;
    bodyFilter.Q.value = 0.9;

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.9, now + 0.005);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(bodyFilter);
    bodyFilter.connect(bodyGain);
    bodyGain.connect(master);

    const noiseDur = 0.045;
    const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * noiseDur), ctx.sampleRate);
    const bufData = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufData.length; i++) {
      bufData[i] = (Math.random() * 2 - 1) * Math.exp(-5 * (i / bufData.length));
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 1200;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.linearRampToValueAtTime(0.6, now + 0.002);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + noiseDur);

    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(master);

    osc.start(now);
    noiseSrc.start(now);
    osc.stop(now + 0.13);
    noiseSrc.stop(now + noiseDur);

    const cleanupMs = Math.ceil((0.15 + 0.05) * 1000);
    setTimeout(() => {
      try {
        osc.disconnect();
        bodyFilter.disconnect();
        bodyGain.disconnect();
        noiseSrc.disconnect();
        noiseFilter.disconnect();
        noiseGain.disconnect();
      } catch (e) { }
    }, cleanupMs);
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

    ensureAudio().then(() => {
      try {
        const TAU = 2 * Math.PI;
        const rotNorm = ((rotationRef.current % TAU) + TAU) % TAU;
        const pointer = -Math.PI / 2;
        const relative = ((pointer - rotNorm) + TAU) % TAU;
        const eps = 1e-6;
        const idx = Math.floor(((relative - eps + TAU) % TAU) / angle) % slices.length;
        lastIndexRef.current = idx;
      } catch (e) { lastIndexRef.current = null; console.error("Error playing win sound:", e); }
    }).catch(() => { });

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(t);
      const value = rotationRef.current + (targetRotation - rotationRef.current) * eased;
      try {
        const TAU = 2 * Math.PI;
        const rotNorm = ((value % TAU) + TAU) % TAU;
        const pointer = -Math.PI / 2; // 12 o'clock
        const relative = ((pointer - rotNorm) + TAU) % TAU;
        const eps = 1e-6;
        const idx = Math.floor(((relative - eps + TAU) % TAU) / angle) % slices.length;
        if (idx !== lastIndexRef.current) {
          lastIndexRef.current = idx;
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
        const relative = ((pointer - finalAngle) + TAU) % TAU;
        const eps = 1e-6;
        const landedIdx = Math.floor(((relative - eps + TAU) % TAU) / angle) % slices.length;
        const landed = slices[landedIdx];
        setWinner(landed.label);
        if (removalMode) {
          setSlices(prev => prev.filter((_, i) => i !== landedIdx));
        }
        try { playWin(); } catch (e) { console.error("Error playing win sound:", e); }
        lastIndexRef.current = null;
        setIsSpinning(false);
      }
    };

    requestAnimationFrame(step);
  }

  return (
    <WheelContext.Provider value={{
      slices, addSlice, removeSlice, clearAll, shuffleColors, exportJSON, importJSON,
      radius, setRadius, spinSecs, setSpinSecs, removalMode, setRemovalMode, isSpinning, winner,
      spin, newLabel, setNewLabel, newColor, setNewColor, muted, setMuted, volume, setVolume,
      canvasRef, canvasShown
    }}>
      {children}
    </WheelContext.Provider>
  );
}
