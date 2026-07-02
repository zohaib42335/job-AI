"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Animated progress bar — increments to ~90% while waiting, then jumps to 100%
// when the page content takes over.
// ─────────────────────────────────────────────────────────────────────────────
function ProgressBar() {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    // Fast initial burst → slow crawl → stall near 90%
    const stages = [
      { target: 30, ms: 600 },
      { target: 55, ms: 900 },
      { target: 72, ms: 1400 },
      { target: 83, ms: 2200 },
      { target: 90, ms: 3500 },
    ];
    let t = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    stages.forEach(({ target, ms }) => {
      t += ms;
      timers.push(setTimeout(() => setPct(target), t));
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="w-64 h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div
        className="h-full bg-green-500 rounded-full transition-all duration-700 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading UI
// ─────────────────────────────────────────────────────────────────────────────
export default function LinkedInReportLoading() {
  const [phase, setPhase] = useState(0);
  const phases = [
    "Loading your LinkedIn profile…",
    "Analyzing profile completeness…",
    "Matching keywords against job descriptions…",
    "Generating improvement suggestions…",
  ];

  useEffect(() => {
    const intervals = [1200, 2400, 3800];
    const timers = intervals.map((ms, i) =>
      setTimeout(() => setPhase(i + 1), ms)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center gap-6">
      {/* Icon */}
      <div className="relative w-14 h-14">
        <div className="w-14 h-14 rounded-full border-4 border-green-100 flex items-center justify-center">
          <CheckCircle2 className="h-7 w-7 text-green-500" />
        </div>
        {/* Pulse ring */}
        <span className="absolute inset-0 rounded-full border-4 border-green-300 animate-ping opacity-40" />
      </div>

      {/* Text */}
      <div className="text-center space-y-1">
        <p className="text-base font-bold text-gray-800">{phases[phase]}</p>
        <p className="text-xs text-gray-400">This takes about 5–10 seconds</p>
      </div>

      {/* Progress bar */}
      <ProgressBar />

      {/* Phase dots */}
      <div className="flex gap-1.5">
        {phases.map((_, i) => (
          <span
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
              i <= phase ? "bg-green-500" : "bg-gray-200"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
