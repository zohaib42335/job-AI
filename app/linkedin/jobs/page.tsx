"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import {
  collection, getDocs, query, orderBy, limit,
} from "firebase/firestore";
import {
  getWizardState, setWizardState, isValidLinkedInUrl,
} from "@/lib/linkedin-wizard";
import type { WizardJob } from "@/lib/linkedin-wizard";
import { WizardStepIndicator } from "@/components/linkedin/WizardStepIndicator";
import {
  Plus, MoreHorizontal, CheckCircle2, AlertTriangle,
  Loader2, ArrowLeft, Briefcase, Trash2, X,
} from "lucide-react";
import { clsx } from "clsx";
import toast from "react-hot-toast";

// ─────────────────────────────────────────────────────────────────────────────
// Saved job shapes from Firestore
// ─────────────────────────────────────────────────────────────────────────────
interface SavedJobDoc {
  id:          string;
  title?:      string;
  company?:    string;
  description?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Job card (right column)
// ─────────────────────────────────────────────────────────────────────────────
function JobCard({ job, onToggle, onRemove }: {
  job:      WizardJob;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      className={clsx(
        "relative rounded-xl border p-3.5 cursor-pointer transition-all group",
        job.selected
          ? "border-blue-200 bg-blue-50 shadow-sm"
          : "border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm"
      )}
      onClick={onToggle}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">{job.title || "Untitled Job"}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{job.company}</p>
          {job.description && (
            <p className="text-[11px] text-gray-400 mt-1.5 line-clamp-2 leading-relaxed">
              {job.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {job.selected && <CheckCircle2 className="h-5 w-5 text-blue-600" />}
          <div className="relative">
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(m => !m); }}
              className="p-1 text-gray-300 hover:text-gray-600 rounded opacity-0 group-hover:opacity-100 transition-all"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-6 z-20 w-28 bg-white border border-gray-100 rounded-xl shadow-lg py-1">
                <button
                  onClick={e => { e.stopPropagation(); onRemove(); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {job.source !== "manual" && (
        <span className="absolute top-2 right-2 text-[9px] font-bold text-blue-500 bg-blue-100 px-1.5 py-0.5 rounded-full">
          {job.source === "saved" ? "Saved" : "Previous"}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function LinkedInJobsPage() {
  const router = useRouter();
  const { user } = useAuth();

  // Wizard state
  const [linkedInUrl, setLinkedInUrl] = useState("");
  const [jobs, setJobs]               = useState<WizardJob[]>([]);
  const [scanning, setScanning]       = useState(false);

  // Left column
  const [pastedJD, setPastedJD]       = useState("");

  // Firestore saved jobs
  const [savedJobsLoaded, setSavedJobsLoaded] = useState(false);

  // Redirect to step 1 if wizard state is missing
  useEffect(() => {
    const state = getWizardState();
    if (!state.linkedInUrl || !isValidLinkedInUrl(state.linkedInUrl)) {
      router.replace("/linkedin");
      return;
    }
    setLinkedInUrl(state.linkedInUrl);
    if (state.jobs?.length) setJobs(state.jobs);
  }, [router]);

  // Load saved jobs from Firestore
  useEffect(() => {
    if (!user || savedJobsLoaded) return;
    setSavedJobsLoaded(true);

    const loadSaved = async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, "users", user.uid, "savedJobs"),
            orderBy("savedAt", "desc"),
            limit(10)
          )
        );
        const fromFirestore: WizardJob[] = snap.docs.map(d => {
          const data = d.data() as SavedJobDoc;
          return {
            id:          d.id,
            title:       data.title       ?? "Saved Job",
            company:     data.company     ?? "",
            description: data.description ?? "",
            source:      "saved",
            selected:    false,
          };
        });

        setJobs(prev => {
          const existingIds = new Set(prev.map(j => j.id));
          const fresh = fromFirestore.filter(j => !existingIds.has(j.id));
          return [...prev, ...fresh];
        });
      } catch {
        // Silently ignore — user may not have saved jobs yet
      }
    };

    void loadSaved();
  }, [user, savedJobsLoaded]);

  // ── Add job from textarea
  const handleAddJob = useCallback(() => {
    const text = pastedJD.trim();
    if (!text) { toast.error("Please paste a job description first."); return; }

    // Try to extract title / company from first line
    const lines     = text.split("\n").filter(l => l.trim());
    const firstLine = lines[0]?.trim() ?? "";
    const title     = firstLine.length < 80 ? firstLine : "Pasted Job";

    const newJob: WizardJob = {
      id:          `manual-${Date.now()}`,
      title,
      company:     "",
      description: text,
      source:      "manual",
      selected:    true,
    };
    setJobs(prev => [newJob, ...prev]);
    setPastedJD("");
    toast.success("Job added!");
  }, [pastedJD]);

  const toggleJob   = (id: string) => setJobs(prev => prev.map(j => j.id === id ? { ...j, selected: !j.selected } : j));
  const removeJob   = (id: string) => setJobs(prev => prev.filter(j => j.id !== id));

  const selectedJobs = jobs.filter(j => j.selected);
  const tooFew       = selectedJobs.length > 0 && selectedJobs.length < 3;

  // ── Scan → call audit API → navigate to report
  const handleScan = useCallback(async () => {
    if (selectedJobs.length === 0) { toast.error("Please add or select at least 1 job description."); return; }
    setScanning(true);

    // Save wizard state before navigating
    setWizardState({ jobs });

    // Store selected job descriptions for the report page
    const descriptions = selectedJobs.map(j => j.description).filter(Boolean);
    sessionStorage.setItem("linkedin_scan_descriptions", JSON.stringify(descriptions));
    sessionStorage.setItem("linkedin_scan_url", linkedInUrl);

    router.push("/linkedin/report");
  }, [selectedJobs, jobs, linkedInUrl, router]);

  return (
    <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center py-10">
      <div className="w-full max-w-4xl">

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 rounded bg-[#0077B5] flex items-center justify-center flex-shrink-0">
            <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-gray-900">LinkedIn Optimization</h1>
        </div>
        <p className="text-sm text-gray-500 mb-8 ml-11">
          Get noticed on LinkedIn. Your LinkedIn profile score is just 2 steps away.
        </p>

        {/* Step indicator */}
        <WizardStepIndicator currentStep={2} />

        {/* Two-column panel */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-5">
          <div className="grid grid-cols-[1fr_auto_1fr] min-h-[520px]">

            {/* LEFT — New job description */}
            <div className="p-6 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-gray-800">New job description</h2>
                <button
                  onClick={handleAddJob}
                  className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </div>

              <textarea
                value={pastedJD}
                onChange={e => setPastedJD(e.target.value)}
                placeholder="Paste a job description here or select jobs from the previous jobs"
                className="flex-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed"
                rows={16}
              />

              {pastedJD.trim() && (
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[11px] text-gray-400">{pastedJD.length} chars</span>
                  <div className="flex gap-2">
                    <button onClick={() => setPastedJD("")} className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
                      <X className="h-3 w-3" /> Clear
                    </button>
                    <button
                      onClick={handleAddJob}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add job
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Vertical divider */}
            <div className="flex flex-col items-center py-6">
              <div className="flex-1 w-px bg-gray-100" />
            </div>

            {/* RIGHT — Previous / saved jobs */}
            <div className="p-6 flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-bold text-gray-800">
                  OR&nbsp;&nbsp;Add previous jobs
                </h2>
              </div>
              <p className="text-[11px] text-gray-400 mb-4">
                Jobs added:{" "}
                <span className={clsx("font-bold", selectedJobs.length >= 3 ? "text-green-600" : "text-amber-600")}>
                  {selectedJobs.length}
                </span>
                {" "}(min 3 recommended)
              </p>

              {jobs.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-12 text-gray-300">
                  <Briefcase className="h-10 w-10 mb-3" />
                  <p className="text-xs font-semibold text-gray-400">No previous jobs found</p>
                  <p className="text-[11px] text-gray-300 mt-1">Paste a job description on the left to get started</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {jobs.map(job => (
                    <JobCard
                      key={job.id}
                      job={job}
                      onToggle={() => toggleJob(job.id)}
                      onRemove={() => removeJob(job.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Warning */}
        {tooFew && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <p className="text-xs text-amber-800">
              <span className="font-bold">{selectedJobs.length} job{selectedJobs.length > 1 ? "s" : ""} added</span> — we recommend at least 3 for an accurate profile match score.
            </p>
          </div>
        )}

        {/* Bottom bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push("/linkedin")}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

          <button
            id="linkedin-scan-btn"
            onClick={handleScan}
            disabled={scanning || selectedJobs.length === 0}
            className={clsx(
              "flex items-center gap-2 px-8 py-2.5 rounded-xl text-sm font-bold transition-all",
              selectedJobs.length > 0 && !scanning
                ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            )}
          >
            {scanning ? <><Loader2 className="h-4 w-4 animate-spin" /> Scanning…</> : "Scan"}
          </button>
        </div>

      </div>
    </div>
  );
}
