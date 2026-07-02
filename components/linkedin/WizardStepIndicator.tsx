"use client";

import { CheckCircle2 } from "lucide-react";
import { clsx } from "clsx";

// ─────────────────────────────────────────────────────────────────────────────
// Shared step indicator used by both LinkedIn wizard pages.
// Extracted here because Next.js page files may only export route-specific
// things (default, metadata, etc.) — extra named exports cause TS errors.
// ─────────────────────────────────────────────────────────────────────────────

export function WizardStepIndicator({ currentStep }: { currentStep: 1 | 2 }) {
  const steps = [
    { n: 1, label: "Add LinkedIn Profile URL" },
    { n: 2, label: "Add jobs" },
  ];

  return (
    <div className="flex items-center gap-0 mb-10">
      {steps.map((s, i) => {
        const done   = s.n < currentStep;
        const active = s.n === currentStep;
        return (
          <div key={s.n} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className={clsx(
                "w-9 h-9 rounded-full flex items-center justify-center border-2 text-sm font-black transition-all",
                done || active
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "bg-white border-gray-300 text-gray-400"
              )}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : s.n}
              </div>
              <span className={clsx(
                "text-xs font-semibold whitespace-nowrap",
                active ? "text-blue-600" : done ? "text-blue-500" : "text-gray-400"
              )}>{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={clsx(
                "w-32 h-0.5 mx-3 mb-5 flex-shrink-0 transition-colors",
                currentStep > 1 ? "bg-blue-600" : "bg-gray-200"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}
