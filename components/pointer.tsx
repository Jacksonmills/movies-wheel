import React from 'react';

export default function Pointer({ className }: { className?: string; }) {
  // Use design tokens for colors via CSS variables.
  return (
    <div aria-hidden className={className}>
      <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
        {/* triangle uses destructive token, center circle uses foreground token */}
        <path d="M12 0 L16 8 H8 Z" transform="rotate(180 12 12)" fill="var(--destructive)" />
        <circle cx="12" cy="18" r="2" fill="var(--foreground)" transform="translate(0 -4)" />
      </svg>
    </div>
  );
}
