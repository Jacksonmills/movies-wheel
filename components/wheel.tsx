import React from "react";
import { WheelProvider } from "./wheel-context";
import WheelView from "./wheel-view";
import Controls from "./controls";

export default function Wheel() {
  return (
    <WheelProvider>
      <div className="w-full min-h-screen p-6">
        <div className="mx-auto max-w-6xl grid gap-6 md:grid-cols-[1fr_360px]">
          <WheelView />
          <div className="space-y-5">
            <Controls />
          </div>
        </div>
      </div>
    </WheelProvider>
  );
}
