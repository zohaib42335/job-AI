"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getUserResumes } from "@/lib/resume";
import type { ResumeRecord } from "@/lib/resume";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import toast from "react-hot-toast";
import {
  CheckCircle2, XCircle, Loader2, ChevronDown, Save,
  Shield, Search, Users, LayoutTemplate, BarChart3, FileText,
  Sparkles, AlertCircle, ChevronRight,
} from "lucide-react";
import { clsx } from "clsx";
import type { ResumeFormData } from "@/app/resume-builder/types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface MatchResult {
  score: number;
  atsSystem: string;
  searchability: {
    score: number;
    hasContactInfo: boolean;
    hasEmail: boolean;
    hasPhone: boolean;
    hasSummary: boolean;
    hasSectionHeadings: boolean;
    fileFormatCompatible: boolean;
    issues: string[];
  };
  hardSkills: { score: number; matched: string[]; missing: string[]; total: number };
  softSkills: { score: number; matched: string[]; missing: string[]; total: number };
  formatting: {
    score: number;
    hasBulletPoints: boolean;
    hasConsistentDates: boolean;
    noTablesColumns: boolean;
    noHeadersFooters: boolean;
    fontReadable: boolean;
    issues: string[];
  };
  recruiterTips: { score: number; tips: string[] };
  missingKeywords: string[];
  fallback?: boolean;
}

type TabId = "searchability" | "hardSkills" | "softSkills" | "formatting" | "recruiterTips";

// ─────────────────────────────────────────────────────────────────────────────
// Helper — serialize resume to plain text for the API
// ─────────────────────────────────────────────────────────────────────────────

function resumeToText(data: ResumeFormData, skills: string[]): string {
  const p: string[] = [];
  if (data.fullName)  p.push(data.fullName);
  if (data.jobTitle)  p.push(data.jobTitle);
  const contact = [data.email, data.phone, data.location].filter(Boolean);
  if (contact.length) p.push(contact.join(" | "));
  if (data.summary)   p.push("\nSUMMARY\n" + data.summary);

  if (data.experience?.some(e => e.employer || e.jobTitle)) {
    p.push("\nEXPERIENCE");
    data.experience.forEach(e => {
      if (e.jobTitle || e.employer) {
        p.push(`${e.jobTitle} at ${e.employer}`);
        const dates = [e.startDate, e.currentlyWorking ? "Present" : e.endDate].filter(Boolean).join(" - ");
        if (dates) p.push(dates);
        if (e.description) p.push(e.description);
      }
    });
  }

  if (data.education?.some(e => e.school || e.degree)) {
    p.push("\nEDUCATION");
    data.education.forEach(e => {
      if (e.degree || e.school) {
        p.push(`${e.degree}${e.fieldOfStudy ? ` in ${e.fieldOfStudy}` : ""} — ${e.school} (${e.startYear}–${e.endYear})`);
      }
    });
  }

  if (skills.length) p.push("\nSKILLS\n" + skills.join(", "));

  if (data.certifications?.some(c => c.name)) {
    p.push("\nCERTIFICATIONS");
    data.certifications.forEach(c => c.name && p.push(`${c.name} — ${c.issuer} (${c.year})`));
  }

  if (data.languages?.some(l => l.language)) {
    p.push("\nLANGUAGES");
    data.languages.forEach(l => l.language && p.push(`${l.language} (${l.proficiency})`));
  }

  return p.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Score colour helpers
// ─────────────────────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  return s >= 75 ? "#16a34a" : s >= 50 ? "#d97706" : "#dc2626";
}
function scoreBg(s: number) {
  return s >= 75 ? "#dcfce7" : s >= 50 ? "#fef3c7" : "#fee2e2";
}
function scoreLabel(s: number) {
  return s >= 75 ? "Excellent" : s >= 50 ? "Good" : "Needs Work";
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const r    = 68;
  const circ = 2 * Math.PI * r;
  const [off, setOff] = useState(circ);

  useEffect(() => {
    const t = setTimeout(() => setOff(circ - (score / 100) * circ), 80);
    return () => clearTimeout(t);
  }, [score, circ]);

  const c  = scoreColor(score);
  const bg = scoreBg(score);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-[168px] h-[168px]">
        <svg width="168" height="168" viewBox="0 0 168 168" className="-rotate-90">
          <circle cx="84" cy="84" r={r} fill="none" stroke="#f3f4f6" strokeWidth="14" />
          <circle
            cx="84" cy="84" r={r} fill="none"
            stroke={c} strokeWidth="14"
            strokeDasharray={circ} strokeDashoffset={off}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1.3s cubic-bezier(.4,0,.2,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-black tabular-nums" style={{ color: c }}>{score}</span>
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">out of 100</span>
        </div>
      </div>
      <span className="text-sm font-bold px-4 py-1.5 rounded-full" style={{ color: c, backgroundColor: bg }}>
        {scoreLabel(score)} Match
      </span>
    </div>
  );
}

function MetricBar({ label, pct, issues }: { label: string; pct: number; issues: number }) {
  const [w, setW] = useState(0);
  const c = scoreColor(pct);

  useEffect(() => {
    const t = setTimeout(() => setW(pct), 120);
    return () => clearTimeout(t);
  }, [pct]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-gray-700">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tabular-nums" style={{ color: c }}>{pct}%</span>
          {issues > 0 && (
            <span className="text-[10px] text-orange-500 font-medium">{issues} issue{issues !== 1 ? "s" : ""}</span>
          )}
        </div>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${w}%`, backgroundColor: c, transition: "width 1s ease" }}
        />
      </div>
    </div>
  );
}

function CheckRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-700">{label}</span>
      {ok
        ? <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
        : <XCircle className="h-5 w-5 text-red-400 flex-shrink-0" />}
    </div>
  );
}

function SkillPill({ skill, found }: { skill: string; found: boolean }) {
  return (
    <div className={clsx(
      "flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium capitalize",
      found ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
    )}>
      <span>{skill}</span>
      {found
        ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 ml-2 flex-shrink-0" />
        : <XCircle className="h-3.5 w-3.5 text-red-400 ml-2 flex-shrink-0" />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab definitions
// ─────────────────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "searchability",  label: "Searchability",  icon: Search        },
  { id: "hardSkills",     label: "Hard Skills",    icon: BarChart3     },
  { id: "softSkills",     label: "Soft Skills",    icon: Users         },
  { id: "formatting",    label: "Formatting",     icon: LayoutTemplate },
  { id: "recruiterTips", label: "Recruiter Tips", icon: Sparkles      },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function MatchReportPage() {
  const { user }  = useAuth();

  // Resume source
  const [resumes, setResumes]               = useState<ResumeRecord[]>([]);
  const [resumesLoading, setResumesLoading] = useState(true);
  const [selectedId, setSelectedId]         = useState<string>("");
  const [resumeMode, setResumeMode]         = useState<"select" | "paste">("select");
  const [pastedResume, setPastedResume]     = useState("");

  // Job description
  const [jobDescription, setJobDescription] = useState("");

  // Scan state
  const [loading, setLoading]       = useState(false);
  const [streamStatus, setStreamStatus] = useState("");
  const [result, setResult]         = useState<MatchResult | null>(null);
  const [activeTab, setActiveTab]   = useState<TabId>("searchability");

  // Save state
  const [saving, setSaving] = useState(false);

  // ── Load resumes ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const data = await getUserResumes(user.uid);
        setResumes(data);
        if (data.length > 0) setSelectedId(data[0].id);
      } catch { /* ignore */ }
      finally { setResumesLoading(false); }
    })();
  }, [user]);

  // ── Get resume text ───────────────────────────────────────────────────────
  const getResumeText = (): string => {
    if (resumeMode === "paste") return pastedResume;
    const r = resumes.find(r => r.id === selectedId);
    if (!r) return "";
    return resumeToText(r.formData, r.skills);
  };

  const canScan = () => {
    const rt = getResumeText().trim();
    return rt.length > 50 && jobDescription.trim().length > 50 && !loading;
  };

  // ── Scan (SSE streaming) ──────────────────────────────────────────────────
  const handleScan = async () => {
    if (!canScan()) { toast.error("Please provide both a resume and a job description."); return; }
    setLoading(true);
    setResult(null);
    setStreamStatus("Connecting to AI…");
    try {
      const res = await fetch("/api/match-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText: getResumeText(), jobDescription }),
      });

      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? "Scan failed");
      }

      const contentType = res.headers.get("content-type") ?? "";

      // ── Non-streaming fallback (no Groq key configured) ─────────────────
      if (!contentType.includes("text/event-stream")) {
        const json = await res.json();
        if (!json.success) throw new Error(json.error ?? "Scan failed");
        setResult(mapApiResult(json.report, json.fallback));
        setActiveTab("searchability");
        return;
      }

      // ── SSE stream (named events: status | chunk | report | done | error) ─
      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let   buffer  = "";
      let   currentEvent = "";
      let   deltaCount   = 0;

      setStreamStatus("Groq (Llama 3.3) is analyzing…");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          // Track the current named event
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
            continue;
          }

          if (!line.startsWith("data: ")) continue;

          const raw = JSON.parse(line.slice(6)) as Record<string, unknown>;

          if (currentEvent === "error") {
            throw new Error((raw.error as string) ?? "Unknown error");
          }

          if (currentEvent === "chunk" && typeof raw.delta === "string") {
            deltaCount += raw.delta.length;
            setStreamStatus(`Analyzing… (${deltaCount} chars processed)`);
          }

          if (currentEvent === "report" && raw.report) {
            setResult(mapApiResult(raw.report as Parameters<typeof mapApiResult>[0]));
            setActiveTab("searchability");
          }

          if (currentEvent === "done") {
            setStreamStatus("");
          }
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Scan failed");
      setStreamStatus("");
    } finally {
      setLoading(false);
    }
  };

  // ── Map API result shape → UI MatchResult ─────────────────────────────────
  function mapApiResult(
    r: {
      overallScore?: number;
      atsCompatibility?: { score?: number; issues?: string[] };
      hardSkills?: { matched?: string[]; missing?: string[]; score?: number };
      softSkills?: { matched?: string[]; missing?: string[]; score?: number };
      searchability?: { hasEmail?: boolean; hasPhone?: boolean; hasAddress?: boolean; hasSummary?: boolean; hasSectionHeadings?: boolean; score?: number; issues?: string[] };
      formatting?: { usesBullets?: boolean; consistentDates?: boolean; noTables?: boolean; score?: number; issues?: string[] };
      recruiterTips?: string[];
      missingKeywords?: string[];
    },
    fallback?: boolean
  ): MatchResult {
    const hs = r.hardSkills ?? {};
    const ss = r.softSkills ?? {};
    const se = r.searchability ?? {};
    const fm = r.formatting   ?? {};
    const tips = r.recruiterTips ?? [];
    const atsScore = r.atsCompatibility?.score ?? r.overallScore ?? 0;
    return {
      score:     r.overallScore ?? 0,
      atsSystem: fallback ? "Generic ATS" : "Workday / Taleo / Greenhouse",
      fallback,
      searchability: {
        score:                se.score ?? 0,
        hasContactInfo:       !!(se.hasEmail && se.hasPhone),
        hasEmail:             se.hasEmail ?? false,
        hasPhone:             se.hasPhone ?? false,
        hasSummary:           se.hasSummary ?? false,
        hasSectionHeadings:   se.hasSectionHeadings ?? false,
        fileFormatCompatible: true,
        issues:               se.issues ?? [],
      },
      hardSkills: {
        score:   hs.score ?? 0,
        matched: hs.matched ?? [],
        missing: hs.missing ?? [],
        total:   (hs.matched?.length ?? 0) + (hs.missing?.length ?? 0),
      },
      softSkills: {
        score:   ss.score ?? 0,
        matched: ss.matched ?? [],
        missing: ss.missing ?? [],
        total:   (ss.matched?.length ?? 0) + (ss.missing?.length ?? 0),
      },
      formatting: {
        score:              fm.score ?? 0,
        hasBulletPoints:    fm.usesBullets ?? false,
        hasConsistentDates: fm.consistentDates ?? false,
        noTablesColumns:    fm.noTables ?? true,
        noHeadersFooters:   true,
        fontReadable:       true,
        issues:             fm.issues ?? [],
      },
      recruiterTips: {
        score: Math.min(100, 100 - tips.length * 10),
        tips,
      },
      missingKeywords: r.missingKeywords ?? [],
      atsCompatibility: atsScore,
    } as unknown as MatchResult;
  }

  // ── Save to Firestore ─────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!user || !result) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "users", user.uid, "matchReports"), {
        ...result,
        userId: user.uid,          // explicit field for Collection Group queries
        jobDescription: jobDescription.slice(0, 500),
        resumeId: selectedId || null,
        createdAt: serverTimestamp(),
      });
      toast.success("Report saved!");
    } catch {
      toast.error("Failed to save report.");
    } finally {
      setSaving(false);
    }
  };

  // ── Derived metrics for left panel bars ───────────────────────────────────
  const metrics = result ? [
    { label: "Searchability",  pct: result.searchability.score,  issues: (result.searchability.issues ?? []).length },
    { label: "Hard Skills",    pct: result.hardSkills.score,     issues: result.hardSkills.missing.length },
    { label: "Soft Skills",    pct: result.softSkills.score,     issues: result.softSkills.missing.length },
    { label: "Formatting",     pct: result.formatting.score,     issues: (result.formatting.issues ?? []).length },
    { label: "Recruiter Tips", pct: result.recruiterTips.score,  issues: Math.max(0, result.recruiterTips.tips.length - 2) },
  ] : [];

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-[calc(100vh-10rem)]">

      {/* ── LEFT PANEL ───────────────────────────────────────────────────── */}
      <div className="lg:w-[400px] flex-shrink-0 flex flex-col gap-4">

        {/* Input card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col gap-5">

          {/* Resume section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600" /> Resume
              </h3>
              <div className="flex text-[11px] font-medium border border-gray-200 rounded-lg overflow-hidden">
                {(["select", "paste"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setResumeMode(m)}
                    className={clsx(
                      "px-2.5 py-1 capitalize transition-colors",
                      resumeMode === m ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50"
                    )}
                  >
                    {m === "select" ? "Saved" : "Paste"}
                  </button>
                ))}
              </div>
            </div>

            {resumeMode === "select" ? (
              <div className="relative">
                <select
                  value={selectedId}
                  onChange={e => setSelectedId(e.target.value)}
                  disabled={resumesLoading}
                  className="w-full appearance-none rounded-xl border border-gray-200 pl-3 pr-8 py-2.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                >
                  <option value="">
                    {resumesLoading ? "Loading resumes…" : resumes.length === 0 ? "No saved resumes — go to Resume Builder" : "Select a resume"}
                  </option>
                  {resumes.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              </div>
            ) : (
              <textarea
                rows={6}
                value={pastedResume}
                onChange={e => setPastedResume(e.target.value)}
                placeholder="Paste your resume text here…"
                className="w-full rounded-xl border border-gray-200 p-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100" />

          {/* Job description */}
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-600" /> Job Description
            </h3>
            <textarea
              rows={10}
              value={jobDescription}
              onChange={e => setJobDescription(e.target.value)}
              placeholder="Paste the full job description here…&#10;&#10;Include requirements, responsibilities, and qualifications for the best analysis."
              className="w-full rounded-xl border border-gray-200 p-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Scan button */}
          <button
            onClick={handleScan}
            disabled={!canScan()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {streamStatus || "Analyzing with AI…"}
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Scan Resume
              </>
            )}
          </button>
        </div>

        {/* Metrics card — shown after scan */}
        {result && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-gray-800">Category Scores</h3>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {saving ? "Saving…" : "Save Report"}
              </button>
            </div>
            <div className="space-y-4">
              {metrics.map(m => <MetricBar key={m.label} {...m} />)}
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT PANEL ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col">

        {/* Empty state */}
        {!result && !loading && (
          <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
            <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mb-5">
              <Search className="h-9 w-9 text-blue-400" />
            </div>
            <h2 className="text-lg font-bold text-gray-800 mb-2">Run Your First Scan</h2>
            <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
              Select a saved resume, paste a job description, and click <strong>Scan Resume</strong> to see your ATS match score.
            </p>
            <div className="mt-6 grid grid-cols-3 gap-4 text-xs text-gray-500">
              {["Keyword matching", "ATS scoring", "Gap analysis"].map(t => (
                <div key={t} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gray-50">
                  <CheckCircle2 className="h-5 w-5 text-blue-400" />
                  {t}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center gap-5">
            <div className="relative">
              <Loader2 className="h-14 w-14 text-blue-500 animate-spin" />
              <Sparkles className="h-6 w-6 text-blue-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div>
              <p className="text-base font-bold text-gray-800 mb-1">Analyzing with Groq…</p>
              <p className="text-sm text-gray-500 font-mono">{streamStatus || "Connecting…"}</p>
              <p className="text-xs text-gray-400 mt-2">Comparing keywords · Checking ATS compatibility · Calculating score</p>
            </div>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col overflow-hidden">

            {/* Score header */}
            <div className="px-8 py-8 border-b border-gray-100 flex flex-col sm:flex-row items-center gap-8">
              <ScoreGauge score={result.score} />

              <div className="flex flex-col gap-3 flex-1">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-1">Match Rate</p>
                  <h2 className="text-2xl font-black text-gray-900 leading-tight">
                    Your resume matches <span style={{ color: scoreColor(result.score) }}>{result.score}%</span> of this job
                  </h2>
                </div>

                {/* ATS badge */}
                <div className="flex items-center gap-2 w-fit px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
                  <Shield className="h-4 w-4 text-blue-600" />
                  <span className="text-xs font-semibold text-gray-700">ATS Detected:</span>
                  <span className="text-xs font-bold text-blue-700">{result.atsSystem}</span>
                </div>

                {/* Quick stats */}
                <div className="flex flex-wrap gap-3">
                  <Stat label="Hard Skills" value={`${result.hardSkills.matched.length}/${result.hardSkills.total}`} ok={result.hardSkills.score >= 60} />
                  <Stat label="Soft Skills" value={`${result.softSkills.matched.length}/${result.softSkills.total}`} ok={result.softSkills.score >= 60} />
                  <Stat label="Searchability" value={`${result.searchability.score}%`} ok={result.searchability.score >= 75} />
                </div>
              </div>
            </div>

            {/* Tab nav */}
            <div className="flex border-b border-gray-100 px-6 overflow-x-auto">
              {TABS.map(tab => {
                const Icon = tab.icon;
                const s = result[tab.id as keyof MatchResult];
                const tabScore = (typeof s === "object" && s !== null && "score" in s) ? (s as {score: number}).score : 0;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={clsx(
                      "flex items-center gap-2 px-4 py-4 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors",
                      active
                        ? "border-blue-600 text-blue-700"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                    {tabScore > 0 && (
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ color: scoreColor(tabScore), backgroundColor: scoreBg(tabScore) }}
                      >
                        {tabScore}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-6">

              {/* Searchability */}
              {activeTab === "searchability" && (
                <div>
                  <SectionHeader score={result.searchability.score} title="ATS Searchability" desc="How easily ATS systems can read and parse your resume." />
                  <div className="divide-y divide-gray-50">
                    <CheckRow label="Contact Information (email + phone)" ok={result.searchability.hasContactInfo} />
                    <CheckRow label="Email address present"               ok={result.searchability.hasEmail} />
                    <CheckRow label="Phone number present"                ok={result.searchability.hasPhone} />
                    <CheckRow label="Professional summary / objective"    ok={result.searchability.hasSummary} />
                    <CheckRow label="Standard section headings"           ok={result.searchability.hasSectionHeadings} />
                    <CheckRow label="ATS-compatible file format"          ok={result.searchability.fileFormatCompatible} />
                  </div>
                </div>
              )}

              {/* Hard Skills */}
              {activeTab === "hardSkills" && (
                <SkillsTab
                  score={result.hardSkills.score}
                  title="Hard Skills / Technical Skills"
                  desc="Technical keywords and tools found in the job description vs your resume."
                  matched={result.hardSkills.matched}
                  missing={result.hardSkills.missing}
                  total={result.hardSkills.total}
                />
              )}

              {/* Soft Skills */}
              {activeTab === "softSkills" && (
                <SkillsTab
                  score={result.softSkills.score}
                  title="Soft Skills / Interpersonal Skills"
                  desc="Behavioural and interpersonal keywords from the job description."
                  matched={result.softSkills.matched}
                  missing={result.softSkills.missing}
                  total={result.softSkills.total}
                />
              )}

              {/* Formatting */}
              {activeTab === "formatting" && (
                <div>
                  <SectionHeader score={result.formatting.score} title="Resume Formatting" desc="Formatting best practices for ATS readability." />
                  <div className="divide-y divide-gray-50">
                    <CheckRow label="Bullet points used for experience"       ok={result.formatting.hasBulletPoints} />
                    <CheckRow label="Consistent date format (Month YYYY)"     ok={result.formatting.hasConsistentDates} />
                    <CheckRow label="No tables or multi-column layouts"       ok={result.formatting.noTablesColumns} />
                    <CheckRow label="No headers or footers"                   ok={result.formatting.noHeadersFooters} />
                    <CheckRow label="Readable font (standard sans/serif)"     ok={result.formatting.fontReadable} />
                  </div>
                  {(result.formatting.issues ?? []).length > 0 && (
                    <ul className="mt-4 space-y-2">
                      {(result.formatting.issues ?? []).map((issue, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-orange-700 bg-orange-50 rounded-lg px-3 py-2">
                          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />{issue}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Recruiter Tips */}
              {activeTab === "recruiterTips" && (
                <div>
                  <SectionHeader score={result.recruiterTips.score} title="AI Recruiter Tips" desc="Personalised suggestions from GPT-4o to improve your match rate." />
                  {result.recruiterTips.tips.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">No tips generated.</p>
                  ) : (
                    <ul className="space-y-3">
                      {result.recruiterTips.tips.map((tip, i) => (
                        <li key={i} className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-200 text-amber-800 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                          <span className="text-sm text-gray-800 leading-relaxed">{tip}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {result.missingKeywords?.length > 0 && (
                    <div className="mt-6">
                      <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-3">Missing Keywords (add to resume)</p>
                      <div className="flex flex-wrap gap-2">
                        {result.missingKeywords.map(kw => (
                          <span key={kw} className="px-2.5 py-1 rounded-full bg-red-50 border border-red-100 text-xs font-medium text-red-700 capitalize">{kw}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.fallback && (
                    <div className="mt-4 flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                      <AlertCircle className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-700">Add your <strong>GROQ_API_KEY</strong> to <code>.env.local</code> to unlock Groq (Llama 3.3) powered analysis.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helper components (outside main to avoid re-renders)
// ─────────────────────────────────────────────────────────────────────────────

function Stat({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 text-xs">
      {ok
        ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
        : <XCircle className="h-3.5 w-3.5 text-red-400" />}
      <span className="text-gray-500">{label}:</span>
      <span className="font-bold text-gray-800">{value}</span>
    </div>
  );
}

function SectionHeader({ score, title, desc }: { score: number; title: string; desc: string }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-0.5">{title}</h3>
        <p className="text-xs text-gray-500">{desc}</p>
      </div>
      <span
        className="text-lg font-black tabular-nums flex-shrink-0"
        style={{ color: scoreColor(score) }}
      >
        {score}%
      </span>
    </div>
  );
}

function SkillsTab({ score, title, desc, matched, missing, total }: {
  score: number; title: string; desc: string;
  matched: string[]; missing: string[]; total: number;
}) {
  return (
    <div>
      <SectionHeader score={score} title={title} desc={desc} />

      {total === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          No recognisable {title.toLowerCase()} found in this job description.
        </div>
      ) : (
        <div className="space-y-5">
          {/* Summary row */}
          <div className="flex gap-4">
            <div className="flex-1 rounded-xl bg-green-50 border border-green-100 px-4 py-3 text-center">
              <p className="text-2xl font-black text-green-600">{matched.length}</p>
              <p className="text-xs text-green-700 font-medium">Matched</p>
            </div>
            <div className="flex-1 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-center">
              <p className="text-2xl font-black text-red-500">{missing.length}</p>
              <p className="text-xs text-red-600 font-medium">Missing</p>
            </div>
            <div className="flex-1 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-center">
              <p className="text-2xl font-black text-gray-700">{total}</p>
              <p className="text-xs text-gray-500 font-medium">Total</p>
            </div>
          </div>

          {/* Matched */}
          {matched.length > 0 && (
            <div>
              <p className="text-xs font-bold text-green-700 uppercase tracking-wide mb-2">✓ Found in your resume</p>
              <div className="grid grid-cols-2 gap-1.5">
                {matched.map(s => <SkillPill key={s} skill={s} found />)}
              </div>
            </div>
          )}

          {/* Missing */}
          {missing.length > 0 && (
            <div>
              <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-2">✗ Missing from your resume</p>
              <div className="grid grid-cols-2 gap-1.5">
                {missing.map(s => <SkillPill key={s} skill={s} found={false} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
