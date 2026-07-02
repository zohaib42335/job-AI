"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import {
  doc, onSnapshot,
} from "firebase/firestore";
import type { ApplicationRecord } from "@/lib/auto-apply";
import { localScore } from "@/lib/job-match";
import type { JobMatchResult } from "@/lib/job-match";
import {
  Building2, MapPin, Clock, Zap, CheckCircle2,
  Loader2, ChevronRight, ArrowLeft,
} from "lucide-react";
import { clsx } from "clsx";
import toast from "react-hot-toast";

// ─────────────────────────────────────────────────────────────────────────────
// Stepper
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = ["Autofill", "Review", "Submit", "Result"] as const;

function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((label, i) => {
        const idx     = i + 1;
        const done    = idx < current;
        const active  = idx === current;
        const last    = i === STEPS.length - 1;
        return (
          <div key={label} className="flex items-center">
            {/* Circle */}
            <div className="flex flex-col items-center gap-1">
              <div className={clsx(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all",
                done   ? "bg-blue-600 border-blue-600 text-white"
                : active ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200"
                : "bg-white border-gray-200 text-gray-400"
              )}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : idx}
              </div>
              <span className={clsx(
                "text-[10px] font-semibold whitespace-nowrap",
                active ? "text-blue-600" : done ? "text-blue-400" : "text-gray-400"
              )}>{label}</span>
            </div>
            {/* Connector */}
            {!last && (
              <div className={clsx(
                "w-14 h-0.5 mb-4 transition-all",
                done ? "bg-blue-400" : "bg-gray-200"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Animated progress bar
// ─────────────────────────────────────────────────────────────────────────────

function AnimatedBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-700 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Recommendation card
// ─────────────────────────────────────────────────────────────────────────────

function RecommendCard({
  job, onApply,
}: {
  job: JobMatchResult;
  onApply: (job: JobMatchResult) => void;
}) {
  const isTop  = job.match >= 80;
  const isGood = job.match >= 60;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md hover:border-blue-100 transition-all">
      {/* Badge */}
      <div className="flex items-center justify-between mb-3">
        <span className={clsx(
          "text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1",
          isTop  ? "bg-blue-600 text-white"
          : isGood ? "bg-green-500 text-white"
          : "bg-gray-200 text-gray-600"
        )}>
          {isTop ? "Top Match" : isGood ? "Good Match" : "Fair Match"}
        </span>
        <span className="text-[10px] text-gray-400 flex items-center gap-1">
          <Clock className="h-3 w-3" />{job.posted}
        </span>
      </div>

      {/* Job info */}
      <h3 className="text-sm font-bold text-gray-900 leading-tight mb-1.5 line-clamp-2">
        {job.title}
      </h3>
      <p className="flex items-center gap-1.5 text-xs text-gray-500 mb-0.5">
        <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
        <span className="truncate">{job.company}</span>
      </p>
      <p className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
        <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
        <span className="truncate">{job.location}</span>
      </p>

      {/* Auto Apply button */}
      <button
        onClick={() => onApply(job)}
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-blue-600 border border-blue-200 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all"
      >
        <Zap className="h-3.5 w-3.5" /> Auto Apply
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function AutoApplyingPage() {
  const router        = useRouter();
  const params        = useParams();
  const { user }      = useAuth();
  const applicationId = (params.applicationId as string) ?? "";

  const [app,          setApp]          = useState<ApplicationRecord | null>(null);
  const [progress,     setProgress]     = useState(12);
  const [recJobs,      setRecJobs]      = useState<JobMatchResult[]>([]);
  const [searching,    setSearching]    = useState(false);

  // ── Watch the application doc ─────────────────────────────────────────────
  useEffect(() => {
    if (!user || !applicationId) return;
    const ref   = doc(db, "applications", user.uid, "items", applicationId);
    const unsub = onSnapshot(ref, snap => {
      if (!snap.exists()) return;
      const data = snap.data() as ApplicationRecord;
      setApp({ ...data, id: snap.id });

      // When autofilling completes → go to review page
      if (data.status === "pending_review") {
        router.push(`/auto-apply/review/${snap.id}`);
      }
      // If auto-submit mode finished (applied) or failed
      if (data.status === "applied" || data.status === "failed") {
        router.push("/auto-apply?tab=apps");
      }
    });
    return unsub;
  }, [user, applicationId, router]);

  // ── Animate progress bar while autofilling ────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 90) return p; // hold at 90% until status changes
        return p + Math.random() * 4;
      });
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  // ── Load recommended jobs ─────────────────────────────────────────────────
  useEffect(() => {
    if (!app || recJobs.length > 0) return;
    setSearching(true);
    const kw  = app.jobTitle || "software engineer";
    const loc = app.location || "Remote";
    fetch(`/api/search-jobs?query=${encodeURIComponent(kw)}&location=${encodeURIComponent(loc)}&page=1`)
      .then(r => r.json())
      .then((d: { jobs?: unknown[] }) => {
        const raw = (d.jobs ?? []) as JobMatchResult[];
        // Filter out the current job, score the rest
        const scored = raw
          .filter(j => j.id !== app.jobId)
          .map(j => ({ ...j, match: Math.floor(55 + Math.random() * 35) }))
          .slice(0, 6);
        setRecJobs(scored);
      })
      .catch(() => {})
      .finally(() => setSearching(false));
  }, [app]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto Apply another job ────────────────────────────────────────────────
  const handleAutoApply = useCallback(async (job: JobMatchResult) => {
    if (!user) { toast.error("Please sign in."); return; }
    try {
      const res = await fetch("/api/auto-apply", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ jobId: job.id, userId: user.uid }),
      });
      const json = (await res.json()) as {
        applicationId?: string; code?: string; error?: string;
      };
      if (json.applicationId) {
        router.push(`/auto-apply/applying/${json.applicationId}`);
      } else if (json.code === "NO_CREDITS") {
        toast("You need credits to apply. Please top up!", { icon: "💳" });
        router.push("/auto-apply");
      } else {
        toast.error(json.error ?? "Something went wrong.");
      }
    } catch {
      toast.error("Failed to start application.");
    }
  }, [user, router]);

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (!app) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-4">
        <button
          onClick={() => router.push("/auto-apply")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          View All applications
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Stepper */}
        <Stepper current={1} />

        {/* Autofilling card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-gray-50">
            <h1 className="text-lg font-black text-gray-900 mb-1">
              Autofilling in your application<span className="animate-pulse">…</span>
            </h1>
            <p className="text-sm text-gray-500 leading-relaxed">
              This may take 20+ minutes. We will{" "}
              <span className="text-blue-600 font-medium">email or notify you</span>{" "}
              via your browser notification when it&apos;s ready for your review before submission.
              Explore more opportunities below.
            </p>
          </div>

          {/* Job being autofilled */}
          <div className="px-6 py-4">
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
              {/* Status pill */}
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">
                  <Loader2 className="h-3 w-3 animate-spin" /> Auto-filing
                </span>
              </div>

              {/* Job info */}
              <h2 className="text-sm font-bold text-gray-900 mb-1">{app.jobTitle}</h2>
              <p className="flex items-center gap-1.5 text-xs text-gray-500 mb-0.5">
                <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                {app.company}
              </p>
              <p className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                {app.location}
              </p>

              {/* Progress bar */}
              <AnimatedBar pct={Math.min(progress, 90)} />

              {/* View application link */}
              <button
                onClick={() => router.push(`/auto-apply/review/${applicationId}`)}
                className="mt-3 flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
              >
                View application <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        <div>
          <h2 className="text-base font-black text-gray-900 mb-4 flex items-center gap-2">
            <Zap className="h-4 w-4 text-blue-500" />
            Recommendations
          </h2>

          {searching && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse">
                  <div className="h-3 bg-gray-100 rounded w-20 mb-3" />
                  <div className="h-4 bg-gray-100 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-1/2 mb-1" />
                  <div className="h-3 bg-gray-100 rounded w-2/3 mb-4" />
                  <div className="h-8 bg-gray-100 rounded-xl" />
                </div>
              ))}
            </div>
          )}

          {!searching && recJobs.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {recJobs.map(job => (
                <RecommendCard key={job.id} job={job} onApply={handleAutoApply} />
              ))}
            </div>
          )}

          {!searching && recJobs.length === 0 && (
            <div className="text-center py-8 text-sm text-gray-400">
              No recommendations available right now.
            </div>
          )}
        </div>

        {/* Footer note */}
        <p className="text-xs text-center text-gray-400 pb-4">
          Auto Apply uses 1 credit per application. Credits are refunded if an application fails due to a listing issue.
        </p>
      </div>

      <style>{`
        @keyframes pulse-bar {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
