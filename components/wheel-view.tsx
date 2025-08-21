"use client";

import React from 'react';
import Pointer from './pointer';
import { Button } from './ui/button';
import { useWheel } from './wheel-context';

export default function WheelView() {
  const { canvasRef, canvasShown, radius, spin, isSpinning, slices, shuffleColors, clearAll, winner } = useWheel();

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="relative" style={{
        height: `${radius * 2 + 20}px`,
      }}>
        <Pointer className="absolute left-1/2 -translate-x-1/2 -top-3 z-10 scale-200" />
        <canvas
          ref={canvasRef}
          className="rounded-full shadow-sm border bg-card"
          style={{ visibility: canvasShown ? 'visible' : 'hidden' }}
        />
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
  );
}
