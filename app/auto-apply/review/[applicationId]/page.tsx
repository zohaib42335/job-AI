"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import { deductCredit, refundCredit, type ApplicationRecord } from "@/lib/auto-apply";
import {
  Building2, MapPin, CheckCircle2, Loader2, AlertTriangle,
  RefreshCcw, ExternalLink, X, Zap, FileText,
} from "lucide-react";
import { clsx } from "clsx";
import toast from "react-hot-toast";

// ─────────────────────────────────────────────────────────────────────────────
// Match score badge
// ─────────────────────────────────────────────────────────────────────────────

function MatchBadge({ score }: { score: number }) {
  const color = score >= 80 ? "bg-green-100 text-green-700 border-green-200"
              : score >= 60 ? "bg-blue-100 text-blue-700 border-blue-200"
              : score >= 40 ? "bg-amber-100 text-amber-700 border-amber-200"
                            : "bg-red-100 text-red-700 border-red-200";
  const label = score >= 80 ? "Top Match" : score >= 60 ? "Good Match" : score >= 40 ? "Fair Match" : "Low Match";
  return (
    <span className={clsx("text-xs font-bold px-2.5 py-1 rounded-full border", color)}>
      {label} · {score}%
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Read-only field
// ─────────────────────────────────────────────────────────────────────────────

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</span>
      <span className="text-sm text-gray-800 font-medium">{value || "—"}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const router       = useRouter();
  const params       = useParams();
  const { user }     = useAuth();
  const applicationId = (params.applicationId as string) ?? "";

  const [app,          setApp]          = useState<ApplicationRecord | null>(null);
  const [coverLetter,  setCoverLetter]  = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [skipping,     setSkipping]     = useState(false);

  // ── Load application via onSnapshot ────────────────────────────────────────
  useEffect(() => {
    if (!user || !applicationId) return;
    const ref = doc(db, "applications", user.uid, "items", applicationId);
    const unsub = onSnapshot(ref, snap => {
      if (!snap.exists()) return;
      const data = snap.data() as ApplicationRecord;
      setApp({ ...data, id: snap.id });
      setCoverLetter(data.coverLetter ?? "");
    }, () => {});
    return unsub;
  }, [user, applicationId]);

  // ── Regenerate cover letter ─────────────────────────────────────────────────
  const regenerate = useCallback(async () => {
    if (!app || !user) return;
    setRegenerating(true);
    try {
      const res = await fetch("/api/auto-apply/regenerate-cover", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          userId:      user.uid,
          jobTitle:    app.jobTitle,
          company:     app.company,
          description: "",
          firstName:   app.firstName,
        }),
      });
      const j = (await res.json()) as { coverLetter?: string };
      if (j.coverLetter) setCoverLetter(j.coverLetter);
    } catch { toast.error("Failed to regenerate. Try again."); }
    finally   { setRegenerating(false); }
  }, [app, user]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!app || !user) return;
    setSubmitting(true);
    try {
      // 1. Deduct 1 credit (atomic)
      await deductCredit(user.uid);

      // 2. Save edited cover letter + mark applied
      const ref = doc(db, "applications", user.uid, "items", applicationId);
      await updateDoc(ref, {
        coverLetter,
        status:      "applied",
        submittedAt: serverTimestamp(),
      });

      // 3. Add to Job Tracker "Applied" column (stubbed — lib/job-tracker.ts)
      try {
        await fetch("/api/job-tracker/add", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            userId:   user.uid,
            jobTitle: app.jobTitle,
            company:  app.company,
            status:   "Applied",
            source:   "auto-apply",
          }),
        });
      } catch { /* non-critical */ }

      // 4. Open job site in new tab
      if (app.applyUrl && app.applyUrl !== "#") {
        window.open(app.applyUrl, "_blank", "noreferrer");
      }

      toast.success("Application submitted!");
      router.push("/auto-apply?tab=apps");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submit failed";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }, [app, user, applicationId, coverLetter, router]);

  // ── Skip ────────────────────────────────────────────────────────────────────
  const handleSkip = useCallback(async () => {
    if (!app || !user) return;
    setSkipping(true);
    try {
      const ref = doc(db, "applications", user.uid, "items", applicationId);
      await updateDoc(ref, { status: "failed", failReason: "Skipped by user" });
      // No credit deducted for skipping
      toast("Job skipped — no credit charged.", { icon: "ℹ️" });
      router.push("/auto-apply");
    } catch { toast.error("Failed to skip."); }
    finally   { setSkipping(false); }
  }, [app, user, applicationId, router]);

  // ── Loading state ───────────────────────────────────────────────────────────
  if (!app) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-gray-900 leading-tight">{app.jobTitle}</h1>
            <p className="flex items-center gap-1.5 text-sm text-gray-500 mt-1">
              <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />{app.company}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-gray-400 mt-0.5">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0" />{app.location}
            </p>
          </div>
          {app.matchScore > 0 && <MatchBadge score={app.matchScore} />}
        </div>

        {/* Low match warning */}
        {app.matchScore > 0 && app.matchScore < 50 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mt-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <p className="text-xs text-amber-800">
              Your resume matches <strong>{app.matchScore}%</strong> of this job&apos;s requirements.
              You can still apply — just make sure your experience is relevant.
            </p>
          </div>
        )}
      </div>

      {/* ── Application preview ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
          <FileText className="h-4 w-4 text-blue-500" /> Application Preview
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <ReadField label="First Name" value={app.firstName} />
          <ReadField label="Last Name"  value={app.lastName}  />
          <ReadField label="Email"      value={app.email}     />
          <ReadField label="Phone"      value={app.phone}     />
          <ReadField label="Job Type"   value={app.jobType}   />
          <ReadField label="Status"     value={app.status.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())} />
        </div>
        {app.resumeId && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <ReadField label="Resume" value={`Resume ID: ${app.resumeId}`} />
          </div>
        )}
      </div>

      {/* ── Cover letter ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-900">Cover Letter</h2>
          <button
            onClick={regenerate}
            disabled={regenerating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {regenerating
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCcw className="h-3.5 w-3.5" />}
            {regenerating ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
        <textarea
          value={coverLetter}
          onChange={e => setCoverLetter(e.target.value)}
          rows={12}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="Your cover letter will appear here…"
        />
        <p className="text-xs text-gray-400 mt-1.5">You can edit this before submitting.</p>
      </div>

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-3">
          <button
            onClick={handleSubmit}
            disabled={submitting || skipping}
            className={clsx(
              "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all",
              submitting || skipping
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
            )}
          >
            {submitting
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
              : <><Zap className="h-4 w-4" /> Submit Application</>}
          </button>

          {app.applyUrl && app.applyUrl !== "#" && (
            <a
              href={app.applyUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <ExternalLink className="h-4 w-4" /> View posting
            </a>
          )}

          <button
            onClick={handleSkip}
            disabled={submitting || skipping}
            className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-40 transition-colors"
          >
            {skipping ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            Skip this job
          </button>
        </div>
        <p className="text-xs text-gray-400 text-center mt-2">
          Submitting costs 1 credit. Skipping is always free.
        </p>
      </div>
    </div>
  );
}
