import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { Checkbox } from './ui/checkbox';

type Slice = { id: string; label: string; color: string; };

type Props = {
  slices: Slice[];
  radius: number;
  spinSecs: number;
  removalMode: boolean;
  isSpinning: boolean;
  winner: string | null;
  setRadius: (n: number) => void;
  setSpinSecs: (n: number) => void;
  setRemovalMode: (b: boolean) => void;
  addSlice: () => void;
  newLabel: string;
  setNewLabel: (s: string) => void;
  newColor: string;
  setNewColor: (s: string) => void;
  removeSlice: (id: string) => void;
  shuffleColors: () => void;
  clearAll: () => void;
  exportJSON: () => void;
  importJSON: (f: File) => void;
  // sound controls (optional wiring by parent)
  muted?: boolean;
  volume?: number;
  setMuted?: (b: boolean) => void;
  setVolume?: (n: number) => void;
};

function AddMovieForm({ newLabel, setNewLabel, newColor, setNewColor, addSlice }: {
  newLabel: string;
  setNewLabel: (s: string) => void;
  newColor: string;
  setNewColor: (s: string) => void;
  addSlice: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Add movie</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <input
            id="new-slice-color"
            aria-label="Slice color"
            type="color"
            value={newColor}
            onChange={e => setNewColor(e.target.value)}
            title="Slice color"
            className="sr-only"
          />
          <label htmlFor="new-slice-color" className="inline-flex items-center cursor-pointer">
            <span className="inline-block size-6 rounded-sm aspect-square border-ring ring-ring/50 ring-[3px]" style={{ background: newColor }} aria-hidden />
          </label>

          <Input
            type="text"
            value={newLabel}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewLabel(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') addSlice(); }}
            placeholder="Movie title"
          />

          <Button onClick={addSlice}>Add</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WheelSettings({ radius, spinSecs, setRadius, setSpinSecs, removalMode, setRemovalMode }: {
  radius: number;
  spinSecs: number;
  setRadius: (n: number) => void;
  setSpinSecs: (n: number) => void;
  removalMode: boolean;
  setRemovalMode: (b: boolean) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Wheel settings</CardTitle>
      </CardHeader>
      <CardContent>
        <Label>Size: {radius}px</Label>
        <Slider value={[radius]} min={140} max={320} onValueChange={(v: number[] | undefined) => setRadius(v ? v[0] : radius)} />

        <div className="mt-3" />
        <Label>Spin duration: {spinSecs}s</Label>
        <Slider value={[spinSecs]} min={2} max={12} onValueChange={(v: number[] | undefined) => setSpinSecs(v ? v[0] : spinSecs)} />

        <div className="mt-3 inline-flex items-center gap-2">
          <Checkbox checked={removalMode} onCheckedChange={(c: boolean | "indeterminate" | undefined) => setRemovalMode(Boolean(c))} />
          <Label>Remove the winner after a spin</Label>
        </div>
      </CardContent>
    </Card>
  );
}

function SliceList({ slices, removeSlice, isSpinning }: { slices: Slice[]; removeSlice: (id: string) => void; isSpinning: boolean; }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Slices</CardTitle>
      </CardHeader>
      <CardContent>
        {slices.length === 0 ? (
          <p className="text-muted-foreground">No movies yet.</p>
        ) : (
          <ul className="space-y-2 max-h-[260px] overflow-auto pr-1">
            {slices.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className="inline-block h-4 w-4 rounded-sm" style={{ background: s.color }} aria-hidden />
                <span className="flex-1 truncate">{i + 1}. {s.label}</span>
                <Button variant="ghost" className="px-2 py-1" onClick={() => removeSlice(s.id)} disabled={isSpinning}>Remove</Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function Controls(props: Props) {
  const {
    slices, radius, spinSecs, removalMode, isSpinning,
    setRadius, setSpinSecs, setRemovalMode,
    addSlice, newLabel, setNewLabel, newColor, setNewColor,
    removeSlice, exportJSON, importJSON
  } = props;

  return (
    <div className="space-y-5">
      <AddMovieForm newLabel={newLabel} setNewLabel={setNewLabel} newColor={newColor} setNewColor={setNewColor} addSlice={addSlice} />

      <WheelSettings radius={radius} spinSecs={spinSecs} setRadius={setRadius} setSpinSecs={setSpinSecs} removalMode={removalMode} setRemovalMode={setRemovalMode} />

      <SliceList slices={slices} removeSlice={removeSlice} isSpinning={isSpinning} />

      <Card>
        <CardHeader>
          <CardTitle>Presets</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={exportJSON}>Export JSON</Button>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <Button variant="secondary">Import JSON</Button>
              <input type="file" accept="application/json" className="hidden" onChange={e => {
                const f = e.target.files?.[0];
                if (f) importJSON(f);
              }} />
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sound</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="inline-flex items-center gap-2">
              <Checkbox checked={Boolean(props.muted)} onCheckedChange={(c: boolean | 'indeterminate' | undefined) => props.setMuted && props.setMuted(Boolean(c))} />
              <Label>Mute</Label>
            </div>

            <div>
              <Label>Volume: {Math.round((props.volume ?? 0.6) * 100)}%</Label>
              <Slider value={[props.volume ?? 0.6]} min={0} max={1} step={0.01} onValueChange={(v: number[] | undefined) => props.setVolume && props.setVolume(v ? v[0] : (props.volume ?? 0.6))} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
