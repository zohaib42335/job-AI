"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getUserResumes, saveResume } from "@/lib/resume";
import type { ResumeRecord } from "@/lib/resume";
import toast from "react-hot-toast";
import {
  Sparkles, ChevronDown, Loader2, Save, Download,
  CheckCircle2, XCircle, Wand2, BarChart3, Info,
  Zap, Mail, Phone, MapPin, Globe,
  Plus, AlertCircle, FileText,
} from "lucide-react";
import { clsx } from "clsx";
import type { ResumeFormData } from "@/app/resume-builder/types";

// ─────────────────────────────────────────────────────────────────────────────
// Local types  (ResumeRecord / ResumeFormData are imported — not redefined)
// ─────────────────────────────────────────────────────────────────────────────

interface AnalysisReport {
  overallScore: number;
  atsCompatibility: { score: number; issues: string[] };
  hardSkills:   { matched: string[]; missing: string[]; score: number };
  softSkills:   { matched: string[]; missing: string[]; score: number };
  searchability: {
    hasEmail: boolean; hasPhone: boolean; hasAddress: boolean;
    hasSummary: boolean; hasSectionHeadings: boolean;
    score: number; issues: string[];
  };
  formatting: {
    usesBullets: boolean; consistentDates: boolean;
    noTables: boolean; score: number; issues: string[];
  };
  recruiterTips: string[];
  missingKeywords: string[];
}

interface AISuggestion {
  id: string;           // same as sectionKey
  original: string;
  suggested: string;
  improvements: string[];
  accepted: boolean;
  rejected: boolean;
}

type LeftTab = "skills" | "searchability" | "recruiterTips";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function resumeToText(data: ResumeFormData, skills: string[]): string {
  const p: string[] = [];
  if (data.fullName) p.push(data.fullName);
  if (data.jobTitle) p.push(data.jobTitle);
  const c = [data.email, data.phone, data.location].filter(Boolean);
  if (c.length) p.push(c.join(" | "));
  if (data.summary) p.push("\nSUMMARY\n" + data.summary);
  if (data.experience?.some(e => e.employer || e.jobTitle)) {
    p.push("\nEXPERIENCE");
    data.experience.forEach(e => {
      if (e.jobTitle || e.employer) {
        p.push(`${e.jobTitle} at ${e.employer}`);
        const dates = [e.startDate, e.currentlyWorking ? "Present" : e.endDate]
          .filter(Boolean).join(" – ");
        if (dates) p.push(dates);
        if (e.description) p.push(e.description);
      }
    });
  }
  if (skills.length) p.push("\nSKILLS\n" + skills.join(", "));
  return p.join("\n");
}

/** Parse the match-report SSE stream and return the final report */
async function fetchAnalysis(
  resumeText: string,
  jobDescription: string
): Promise<AnalysisReport> {
  const res = await fetch("/api/match-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumeText, jobDescription }),
  });
  if (!res.ok) {
    const j = (await res.json()) as { error?: string };
    throw new Error(j.error ?? "Analysis failed");
  }
  const ct = res.headers.get("content-type") ?? "";

  // Non-streaming fallback
  if (!ct.includes("text/event-stream")) {
    const j = (await res.json()) as { report?: AnalysisReport };
    if (!j.report) throw new Error("Empty analysis response");
    return j.report;
  }

  // SSE stream — wait for the "report" event
  const reader  = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let evt = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("event: ")) { evt = line.slice(7).trim(); continue; }
      if (!line.startsWith("data: "))  continue;
      const raw = JSON.parse(line.slice(6)) as Record<string, unknown>;
      if (evt === "error") throw new Error((raw.error as string) ?? "Analysis failed");
      if (evt === "report" && raw.report) return raw.report as AnalysisReport;
    }
  }
  throw new Error("Stream ended without a report");
}

/** Call the ai-optimize SSE API and return optimized text + improvements */
async function fetchOptimization(
  resumeText: string,
  jobDescription: string,
  mode: string
): Promise<{ optimized: string; improvements: string[] }> {
  const res = await fetch("/api/ai-optimize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumeText, jobDescription, mode }),
  });
  if (!res.ok) {
    const j = (await res.json()) as { error?: string };
    throw new Error(j.error ?? "Optimization failed");
  }

  const reader  = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let evt = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("event: ")) { evt = line.slice(7).trim(); continue; }
      if (!line.startsWith("data: "))  continue;
      const raw = JSON.parse(line.slice(6)) as Record<string, unknown>;
      if (evt === "error") throw new Error((raw.error as string) ?? "Optimization failed");
      if (evt === "result" && raw.result) {
        const r = raw.result as { optimized?: string; improvements?: string[] };
        return { optimized: r.optimized ?? "", improvements: r.improvements ?? [] };
      }
    }
  }
  throw new Error("Stream ended without a result");
}

// ─────────────────────────────────────────────────────────────────────────────
// Score ring
// ─────────────────────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r    = 28;
  const circ = 2 * Math.PI * r;
  const off  = circ - (score / 100) * circ;
  const color = score >= 75 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626";
  return (
    <div className="relative w-[68px] h-[68px] flex-shrink-0">
      <svg width="68" height="68" viewBox="0 0 68 68" className="-rotate-90">
        <circle cx="34" cy="34" r={r} fill="none" stroke="#f3f4f6" strokeWidth="7" />
        <circle
          cx="34" cy="34" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1.2s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-black tabular-nums" style={{ color }}>{score}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill row
// ─────────────────────────────────────────────────────────────────────────────

function SkillRow({
  skill, matched, aiSuggested, onAdd,
}: {
  skill: string; matched: boolean; aiSuggested?: boolean; onAdd?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0 group">
      <div className={clsx(
        "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 border",
        matched
          ? "bg-green-500 border-green-500"
          : "bg-white border-gray-200"
      )}>
        {matched
          ? <CheckCircle2 className="h-3.5 w-3.5 text-white" />
          : <XCircle className="h-3.5 w-3.5 text-red-400" />}
      </div>
      <span className={clsx(
        "flex-1 text-xs capitalize truncate",
        matched ? "font-semibold text-gray-800" : "text-gray-500"
      )}>
        {skill}
      </span>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {aiSuggested && (
          <span className="flex items-center gap-0.5 text-[9px] font-bold text-blue-600">
            <Sparkles className="h-2.5 w-2.5" />AI suggested
          </span>
        )}
        {!matched && onAdd && (
          <button
            onClick={onAdd}
            className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 text-[9px] font-bold text-white bg-blue-600 hover:bg-blue-700 px-2 py-0.5 rounded-full"
          >
            <Plus className="h-2.5 w-2.5" /> Add
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline text with keyword highlights
// ─────────────────────────────────────────────────────────────────────────────

function HighlightText({
  text,
  matchedKw,
  missingKw,
  hasSuggestion,
  suggestionActive,
  onClickSuggestion,
}: {
  text: string;
  matchedKw: string[];
  missingKw: string[];
  hasSuggestion?: boolean;
  suggestionActive?: boolean;
  onClickSuggestion?: () => void;
}) {
  if (!text) return null;

  // If there's a pending suggestion, wrap the whole text in a clickable highlight
  if (hasSuggestion && !suggestionActive) {
    return (
      <span
        onClick={e => { e.stopPropagation(); onClickSuggestion?.(); }}
        className="bg-amber-100 border-b-2 border-amber-400 text-amber-900 cursor-pointer rounded px-0.5 hover:bg-amber-200 transition-colors"
        title="Click to review AI suggestion"
      >
        {text}
      </span>
    );
  }

  const allKw = [...matchedKw, ...missingKw].filter(k => k.length > 2);
  if (allKw.length === 0) return <>{text}</>;

  const escaped = allKw.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts   = text.split(pattern);

  return (
    <>
      {parts.map((part, i) => {
        if (matchedKw.some(k => k.toLowerCase() === part.toLowerCase())) {
          return (
            <span key={i} className="text-green-700 font-semibold underline decoration-green-400 decoration-2 underline-offset-2">
              {part}
            </span>
          );
        }
        if (missingKw.some(k => k.toLowerCase() === part.toLowerCase())) {
          return (
            <span key={i} className="text-red-600 bg-red-50 rounded px-0.5 font-medium">
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline suggestion popup
// ─────────────────────────────────────────────────────────────────────────────

function SuggestionPopup({
  suggestion,
  onAccept,
  onReject,
}: {
  suggestion: AISuggestion;
  onAccept: () => void;
  onReject: () => void;
}) {
  const [tab, setTab] = useState<"rephrase" | "add_skill">("rephrase");
  return (
    <div
      className="absolute z-40 mt-1 w-80 bg-white border border-gray-200 rounded-2xl shadow-2xl"
      style={{ top: "100%", left: 0 }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-gray-100">
        <Sparkles className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide flex-shrink-0">AI suggested to</span>
        <div className="flex gap-1 ml-auto">
          {(["rephrase", "add_skill"] as const).map(t => (
            <button key={t}
              onClick={() => setTab(t)}
              className={clsx(
                "text-[9px] font-black px-2 py-0.5 rounded-full transition-colors uppercase tracking-wide",
                tab === t ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {t === "rephrase" ? "Rephrase" : "Add Skill"}
            </button>
          ))}
        </div>
      </div>

      {/* Suggested text */}
      <div className="px-3 py-2.5">
        <p className="text-xs text-gray-700 leading-relaxed line-clamp-5">{suggestion.suggested}</p>
        {suggestion.improvements.slice(0, 2).map((imp, i) => (
          <p key={i} className="flex items-center gap-1 text-[9px] text-gray-400 mt-1">
            <CheckCircle2 className="h-2.5 w-2.5 text-green-400 flex-shrink-0" />{imp}
          </p>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-3 pb-3">
        <button
          onClick={onAccept}
          className="flex-1 py-1.5 rounded-xl bg-blue-600 text-xs font-bold text-white hover:bg-blue-700 transition-colors"
        >Accept</button>
        <button
          onClick={onReject}
          className="flex-1 py-1.5 rounded-xl border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >Reject</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Resume document — formatted like a real resume with inline highlights
// ─────────────────────────────────────────────────────────────────────────────

function ResumeDocument({
  resume, analysis, suggestions, activeSuggId,
  sectionLoading, onOptimizeSection, onClickSuggestion,
  onAcceptSuggestion, onRejectSuggestion,
}: {
  resume: ResumeRecord;
  analysis: AnalysisReport | null;
  suggestions: Record<string, AISuggestion>;
  activeSuggId: string | null;
  sectionLoading: Record<string, boolean>;
  onOptimizeSection: (mode: string, key: string) => void;
  onClickSuggestion: (id: string) => void;
  onAcceptSuggestion: (id: string) => void;
  onRejectSuggestion: (id: string) => void;
}) {
  const d          = resume.formData;
  const matchedKw  = analysis
    ? Array.from(new Set([...analysis.hardSkills.matched, ...analysis.softSkills.matched]))
    : [];
  const missingKw  = analysis ? analysis.missingKeywords.slice(0, 12) : [];

  function OptimizeBtn({ mode, sectionKey }: { mode: string; sectionKey: string }) {
    const loading = sectionLoading[sectionKey];
    const hasSugg = !!suggestions[sectionKey] && !suggestions[sectionKey].rejected;
    return (
      <button
        onClick={() => onOptimizeSection(mode, sectionKey)}
        disabled={loading}
        className={clsx(
          "flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg transition-colors",
          hasSugg
            ? "text-green-700 bg-green-50 hover:bg-green-100"
            : "text-blue-600 hover:bg-blue-50"
        )}
      >
        {loading
          ? <Loader2 className="h-3 w-3 animate-spin" />
          : hasSugg
            ? <CheckCircle2 className="h-3 w-3" />
            : <Wand2 className="h-3 w-3" />}
        {hasSugg ? "Optimized" : "AI Optimize"}
      </button>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-2xl mx-auto">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="pb-4 border-b border-gray-200 mb-6">
        <h1 className="text-2xl font-black text-gray-900">{d.fullName || "Your Name"}</h1>
        {d.jobTitle && (
          <p className="text-sm font-bold text-blue-700 mt-0.5">{d.jobTitle}</p>
        )}
        <div className="flex flex-wrap gap-4 mt-2">
          {d.email    && <span className="flex items-center gap-1 text-xs text-gray-500"><Mail    className="h-3 w-3" />{d.email}</span>}
          {d.phone    && <span className="flex items-center gap-1 text-xs text-gray-500"><Phone   className="h-3 w-3" />{d.phone}</span>}
          {d.location && <span className="flex items-center gap-1 text-xs text-gray-500"><MapPin  className="h-3 w-3" />{d.location}</span>}
          {d.linkedin && <span className="flex items-center gap-1 text-xs text-gray-500"><Globe   className="h-3 w-3" />{d.linkedin}</span>}
        </div>
      </div>

      {/* ── Professional Summary ─────────────────────────────────────────── */}
      {d.summary && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-black uppercase tracking-widest text-gray-800">Professional Summary</h2>
            <OptimizeBtn mode="summary" sectionKey="summary" />
          </div>
          <div className="relative">
            <p className="text-xs text-gray-700 leading-relaxed">
              {suggestions["summary"] && !suggestions["summary"].rejected ? (
                suggestions["summary"].accepted ? (
                  /* Accepted — show optimized text with green highlights */
                  <HighlightText
                    text={suggestions["summary"].suggested}
                    matchedKw={matchedKw} missingKw={[]}
                  />
                ) : (
                  /* Pending — show original as amber clickable span */
                  <span className="relative inline">
                    <HighlightText
                      text={d.summary}
                      matchedKw={matchedKw} missingKw={missingKw}
                      hasSuggestion
                      suggestionActive={activeSuggId === "summary"}
                      onClickSuggestion={() => onClickSuggestion("summary")}
                    />
                  </span>
                )
              ) : (
                <HighlightText text={d.summary} matchedKw={matchedKw} missingKw={missingKw} />
              )}
            </p>
            {activeSuggId === "summary" && suggestions["summary"] && !suggestions["summary"].accepted && !suggestions["summary"].rejected && (
              <SuggestionPopup
                suggestion={suggestions["summary"]}
                onAccept={() => onAcceptSuggestion("summary")}
                onReject={() => onRejectSuggestion("summary")}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Professional Experience ──────────────────────────────────────── */}
      {d.experience?.some(e => e.employer || e.jobTitle) && (
        <div className="mb-6">
          <h2 className="text-xs font-black uppercase tracking-widest text-gray-800 mb-3">Professional Experience</h2>
          {d.experience.map((exp, idx) => {
            if (!exp.employer && !exp.jobTitle) return null;
            const key  = `exp_${idx}`;
            const sugg = suggestions[key];
            return (
              <div key={idx} className="mb-5 last:mb-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-black text-gray-900">
                      {exp.jobTitle}
                      {exp.employer && <span className="font-semibold text-gray-600">, {exp.employer}</span>}
                    </p>
                    {(exp.startDate || exp.location) && (
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {[exp.startDate && `${exp.startDate} – ${exp.currentlyWorking ? "Present" : exp.endDate}`, exp.location].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <OptimizeBtn mode="bullets" sectionKey={key} />
                </div>
                {exp.description && (
                  <div className="mt-2 relative">
                    {exp.description.split("\n").map((line, li) => (
                      <p key={li} className="text-xs text-gray-700 leading-relaxed mb-1">
                        {sugg && !sugg.rejected && li === 0 ? (
                          sugg.accepted ? (
                            <HighlightText text={sugg.suggested.split("\n")[0] ?? line} matchedKw={matchedKw} missingKw={[]} />
                          ) : (
                            <HighlightText
                              text={line} matchedKw={matchedKw} missingKw={missingKw}
                              hasSuggestion
                              suggestionActive={activeSuggId === key}
                              onClickSuggestion={() => onClickSuggestion(key)}
                            />
                          )
                        ) : (
                          <HighlightText text={line} matchedKw={matchedKw} missingKw={missingKw} />
                        )}
                      </p>
                    ))}
                    {activeSuggId === key && sugg && !sugg.accepted && !sugg.rejected && (
                      <SuggestionPopup
                        suggestion={sugg}
                        onAccept={() => onAcceptSuggestion(key)}
                        onReject={() => onRejectSuggestion(key)}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Skills ──────────────────────────────────────────────────────── */}
      {resume.skills.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-black uppercase tracking-widest text-gray-800">Skills</h2>
            <OptimizeBtn mode="skills" sectionKey="skills" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(suggestions["skills"]?.accepted
              ? suggestions["skills"].suggested.split(",").map(s => s.trim()).filter(Boolean)
              : resume.skills
            ).map((skill, i) => {
              const isMatched = matchedKw.some(k => k.toLowerCase() === skill.toLowerCase());
              const isMissing = missingKw.some(k => k.toLowerCase() === skill.toLowerCase());
              return (
                <span key={i} className={clsx(
                  "px-2.5 py-0.5 rounded-full text-[10px] font-semibold border",
                  isMatched ? "bg-green-50 border-green-200 text-green-700"
                  : isMissing ? "bg-red-50 border-red-200 text-red-600"
                  : "bg-gray-50 border-gray-200 text-gray-600"
                )}>
                  {skill}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function AiOptimizePage() {
  const { user } = useAuth();

  // Resume
  const [resumes, setResumes]               = useState<ResumeRecord[]>([]);
  const [resumesLoading, setResumesLoading] = useState(true);
  const [selectedId, setSelectedId]         = useState("");

  // Job description
  const [jobDesc, setJobDesc]               = useState("");
  const [jobTarget, setJobTarget]           = useState({ role: "Target Role", company: "Company" });

  // Analysis
  const [analysis, setAnalysis]             = useState<AnalysisReport | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  // Suggestions per section
  const [suggestions, setSuggestions]       = useState<Record<string, AISuggestion>>({});
  const [sectionLoading, setSectionLoading] = useState<Record<string, boolean>>({});
  const [activeSuggId, setActiveSuggId]     = useState<string | null>(null);

  // UI
  const [leftTab, setLeftTab]               = useState<LeftTab>("skills");
  const [saving, setSaving]                 = useState(false);

  // Load resumes
  useEffect(() => {
    if (!user) return;
    getUserResumes(user.uid)
      .then(d => { setResumes(d); if (d[0]) setSelectedId(d[0].id); })
      .catch(() => {})
      .finally(() => setResumesLoading(false));
  }, [user]);

  const resume = resumes.find(r => r.id === selectedId);

  // ── Analyze ──────────────────────────────────────────────────────────────
  const handleAnalyze = useCallback(async () => {
    if (!resume)         { toast.error("Select a resume first.");        return; }
    if (!jobDesc.trim()) { toast.error("Paste a job description first."); return; }

    setAnalysisLoading(true);
    setAnalysis(null);
    setSuggestions({});
    setActiveSuggId(null);

    // Extract first two non-empty lines as company/role
    const lines = jobDesc.split("\n").map(l => l.trim()).filter(Boolean);
    setJobTarget({
      role:    (lines[0] ?? "Target Role").slice(0, 45),
      company: (lines[1] ?? "Company").slice(0, 35),
    });

    try {
      const report = await fetchAnalysis(
        resumeToText(resume.formData, resume.skills),
        jobDesc
      );
      setAnalysis(report);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalysisLoading(false);
    }
  }, [resume, jobDesc]);

  // ── Optimize a section ────────────────────────────────────────────────────
  const handleOptimizeSection = useCallback(async (mode: string, key: string) => {
    if (!resume)         { toast.error("Select a resume first."); return; }
    if (!jobDesc.trim()) { toast.error("Paste a job description first."); return; }

    setSectionLoading(prev => ({ ...prev, [key]: true }));
    try {
      const result = await fetchOptimization(
        resumeToText(resume.formData, resume.skills),
        jobDesc,
        mode
      );
      const original =
        mode === "summary" ? (resume.formData.summary ?? "")
        : mode === "skills" ? resume.skills.join(", ")
        : resume.formData.experience?.[parseInt(key.replace("exp_", ""))]?.description ?? "";

      setSuggestions(prev => ({
        ...prev,
        [key]: {
          id: key, original,
          suggested: result.optimized,
          improvements: result.improvements,
          accepted: false, rejected: false,
        },
      }));
      setActiveSuggId(key);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Optimization failed");
    } finally {
      setSectionLoading(prev => ({ ...prev, [key]: false }));
    }
  }, [resume, jobDesc]);

  const handleAccept = useCallback((id: string) => {
    setSuggestions(prev => ({ ...prev, [id]: { ...prev[id], accepted: true } }));
    setActiveSuggId(null);
    toast.success("Change accepted!");
  }, []);

  const handleReject = useCallback((id: string) => {
    setSuggestions(prev => ({ ...prev, [id]: { ...prev[id], rejected: true } }));
    setActiveSuggId(null);
  }, []);

  const pendingCount = Object.values(suggestions).filter(s => !s.accepted && !s.rejected).length;

  const handleAcceptAll = useCallback(() => {
    setSuggestions(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        if (!next[k].rejected) next[k] = { ...next[k], accepted: true };
      });
      return next;
    });
    setActiveSuggId(null);
    toast.success("All suggestions accepted!");
  }, []);

  // ── Quick-add keyword to skills ───────────────────────────────────────────
  const handleAddKeyword = useCallback((kw: string) => {
    if (!resume) return;
    const base = suggestions["skills"]?.accepted
      ? suggestions["skills"].suggested.split(",").map(s => s.trim())
      : resume.skills;
    if (base.some(s => s.toLowerCase() === kw.toLowerCase())) {
      toast("Already in skills"); return;
    }
    const newVal = [...base, kw].join(", ");
    setSuggestions(prev => ({
      ...prev,
      skills: {
        id: "skills", original: resume.skills.join(", "), suggested: newVal,
        improvements: [`Added "${kw}" from job description`],
        accepted: true, rejected: false,
      },
    }));
    toast.success(`"${kw}" added to skills`);
  }, [resume, suggestions]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!user || !resume) return;
    setSaving(true);
    try {
      const d = resume.formData;
      const newSummary = suggestions["summary"]?.accepted
        ? suggestions["summary"].suggested : (d.summary ?? "");
      const rawSkills  = suggestions["skills"]?.accepted
        ? suggestions["skills"].suggested : resume.skills.join(", ");
      const newSkills  = rawSkills.split(",").map(s => s.trim()).filter(Boolean);
      await saveResume(user.uid, { ...d, summary: newSummary }, newSkills, resume.id);
      toast.success("Resume saved!");
    } catch { toast.error("Failed to save."); }
    finally  { setSaving(false); }
  }, [user, resume, suggestions]);

  // ── Download ──────────────────────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    if (!resume) return;
    const d          = resume.formData;
    const summary    = suggestions["summary"]?.accepted ? suggestions["summary"].suggested : (d.summary ?? "");
    const rawSkills  = suggestions["skills"]?.accepted  ? suggestions["skills"].suggested  : resume.skills.join(", ");
    const skills     = rawSkills.split(",").map(s => s.trim()).filter(Boolean);
    const text       = resumeToText({ ...d, summary }, skills);
    const blob       = new Blob([text], { type: "text/plain" });
    const url        = URL.createObjectURL(blob);
    const a          = document.createElement("a");
    a.href = url; a.download = `${d.fullName ?? "resume"}_optimized.txt`; a.click();
    URL.revokeObjectURL(url);
  }, [resume, suggestions]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const searchIssues = analysis
    ? [!analysis.searchability.hasEmail, !analysis.searchability.hasPhone,
       !analysis.searchability.hasSummary, !analysis.searchability.hasSectionHeadings,
       !analysis.formatting.usesBullets].filter(Boolean).length
    : 0;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex h-[calc(100vh-5rem)] -mx-6 -mb-6 overflow-hidden"
      onClick={() => setActiveSuggId(null)}
    >
      {/* ═══ LEFT PANEL ════════════════════════════════════════════════════ */}
      <div className="w-[340px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">

        {/* Score header */}
        <div className="px-4 py-4 border-b border-gray-100 space-y-3">
          <div className="flex items-center gap-3">
            <ScoreRing score={analysis?.overallScore ?? 0} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-gray-900 truncate">{jobTarget.company} / {jobTarget.role}</p>
              <p className="text-[10px] text-gray-400 mt-0.5 truncate">{resume?.name ?? "Select a resume"}</p>
              <button className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-bold text-amber-800 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">
                <Zap className="h-2.5 w-2.5" /> ATS Tip
              </button>
            </div>
          </div>

          {/* Resume selector */}
          <div className="relative">
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              disabled={resumesLoading}
              className="w-full appearance-none rounded-xl border border-gray-200 pl-3 pr-8 py-2 text-xs text-gray-700 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="">
                {resumesLoading ? "Loading…" : resumes.length === 0
                  ? "No saved resumes" : "Select a resume"}
              </option>
              {resumes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          </div>

          {/* JD textarea + analyse button */}
          <textarea
            rows={4}
            value={jobDesc}
            onChange={e => setJobDesc(e.target.value)}
            placeholder="Paste the job description you're targeting…"
            className="w-full rounded-xl border border-gray-200 p-2.5 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <button
            onClick={handleAnalyze}
            disabled={analysisLoading || !resume || !jobDesc.trim()}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-blue-600 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {analysisLoading
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing…</>
              : <><BarChart3 className="h-3.5 w-3.5" /> Analyze Match</>}
          </button>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        {analysis ? (
          <>
            <div className="flex border-b border-gray-100 flex-shrink-0">
              {([
                { id: "skills"        as const, label: "Skills" },
                { id: "searchability" as const, label: "Searchability" },
                { id: "recruiterTips" as const, label: "Recruiter tips" },
              ]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setLeftTab(tab.id)}
                  className={clsx(
                    "flex-1 py-2.5 text-[10px] font-bold transition-colors border-b-2",
                    leftTab === tab.id
                      ? "border-blue-600 text-blue-700"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  )}
                >
                  {tab.label}
                  {tab.id === "searchability" && searchIssues > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center w-4 h-4 bg-red-500 text-white text-[8px] font-black rounded-full">
                      {searchIssues}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">

              {/* Skills tab */}
              {leftTab === "skills" && (
                <div className="space-y-4">
                  {/* Required / soft skills */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-black text-gray-700 uppercase tracking-wide">Required skills</span>
                        <Info className="h-3 w-3 text-gray-400" />
                      </div>
                      <span className="text-[9px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                        Matched skills {analysis.softSkills.matched.length}
                      </span>
                    </div>
                    {analysis.softSkills.matched.slice(0, 6).map(s =>
                      <SkillRow key={s} skill={s} matched />
                    )}
                    {analysis.softSkills.missing.slice(0, 4).map(s =>
                      <SkillRow key={s} skill={s} matched={false} aiSuggested onAdd={() => handleAddKeyword(s)} />
                    )}
                  </div>

                  <div className="border-t border-gray-100" />

                  {/* Hard skills */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-black text-gray-700 uppercase tracking-wide">Hard skills</span>
                        <Info className="h-3 w-3 text-gray-400" />
                      </div>
                      <div className="flex gap-1">
                        <span className="text-[9px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                          Matched skills {analysis.hardSkills.matched.length}
                        </span>
                        {analysis.hardSkills.missing.length > 0 && (
                          <span className="text-[9px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                            Missing skills {analysis.hardSkills.missing.length}
                          </span>
                        )}
                      </div>
                    </div>
                    {analysis.hardSkills.matched.map(s =>
                      <SkillRow key={s} skill={s} matched />
                    )}
                    {analysis.hardSkills.missing.map(s =>
                      <SkillRow key={s} skill={s} matched={false} aiSuggested onAdd={() => handleAddKeyword(s)} />
                    )}
                  </div>

                  {/* Missing keywords quick-add */}
                  {analysis.missingKeywords.length > 0 && (
                    <div className="pt-1">
                      <p className="text-[10px] font-black text-gray-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 text-orange-500" /> Missing Keywords
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {analysis.missingKeywords.slice(0, 12).map(kw => (
                          <button
                            key={kw}
                            onClick={() => handleAddKeyword(kw)}
                            className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-[9px] font-semibold text-orange-700 hover:bg-orange-100 transition-colors"
                          >
                            <span className="capitalize">{kw}</span>
                            <Plus className="h-2.5 w-2.5" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Searchability tab */}
              {leftTab === "searchability" && (
                <div className="space-y-1">
                  {[
                    { label: "Email address",        ok: analysis.searchability.hasEmail },
                    { label: "Phone number",          ok: analysis.searchability.hasPhone },
                    { label: "Professional summary",  ok: analysis.searchability.hasSummary },
                    { label: "Section headings",      ok: analysis.searchability.hasSectionHeadings },
                    { label: "Bullet points",         ok: analysis.formatting.usesBullets },
                    { label: "Consistent date format",ok: analysis.formatting.consistentDates },
                    { label: "No tables / columns",   ok: analysis.formatting.noTables },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <span className="text-xs text-gray-700">{item.label}</span>
                      {item.ok
                        ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                        : <XCircle      className="h-4 w-4 text-red-400"   />}
                    </div>
                  ))}
                  <div className="pt-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-gray-600">Searchability score</span>
                      <span className="text-xs font-black text-blue-600">{analysis.searchability.score}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${analysis.searchability.score}%`, transition: "width 1s ease" }} />
                    </div>
                  </div>
                  {analysis.searchability.issues.map((issue, i) => (
                    <p key={i} className="flex items-center gap-1 text-[10px] text-orange-700 bg-orange-50 rounded-lg px-2 py-1 mt-1">
                      <AlertCircle className="h-2.5 w-2.5 flex-shrink-0" />{issue}
                    </p>
                  ))}
                </div>
              )}

              {/* Recruiter tips tab */}
              {leftTab === "recruiterTips" && (
                <div className="space-y-2">
                  {analysis.recruiterTips.map((tip, i) => (
                    <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-200 text-amber-800 text-[9px] font-black flex items-center justify-center">{i + 1}</span>
                      <p className="text-[11px] text-gray-700 leading-relaxed">{tip}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          /* No analysis yet */
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mb-3">
              <BarChart3 className="h-6 w-6 text-blue-400" />
            </div>
            <p className="text-xs font-bold text-gray-700 mb-1">No Analysis Yet</p>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Select a resume, paste a job description above, and click Analyze Match.
            </p>
          </div>
        )}
      </div>

      {/* ═══ RIGHT PANEL ═══════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">

        {/* Toolbar */}
        <div className="bg-white border-b border-gray-200 px-5 py-2.5 flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-1 text-[11px] font-bold text-blue-700 border-b-2 border-blue-600 pb-0.5">
            <FileText className="h-3.5 w-3.5" /> Resume
          </div>
          <div className="ml-auto flex items-center gap-2">
            {pendingCount > 0 && (
              <button
                onClick={handleAcceptAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-600 text-[11px] font-bold text-white hover:bg-green-700 transition-colors"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Accept all ({pendingCount})
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !resume}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Changes
            </button>
            <button
              onClick={handleDownload}
              disabled={!resume}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-[11px] font-bold text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Download
            </button>
          </div>
        </div>

        {/* Resume document */}
        <div className="flex-1 overflow-y-auto p-6" onClick={() => setActiveSuggId(null)}>
          {!resume ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                <FileText className="h-9 w-9 text-blue-300" />
              </div>
              <h2 className="text-base font-bold text-gray-700 mb-2">Select a Resume to Get Started</h2>
              <p className="text-sm text-gray-400 max-w-xs leading-relaxed">
                Choose a saved resume, paste a job description on the left, then click Analyze Match.
              </p>
            </div>
          ) : (
            <div onClick={e => e.stopPropagation()}>
              <ResumeDocument
                resume={resume}
                analysis={analysis}
                suggestions={suggestions}
                activeSuggId={activeSuggId}
                sectionLoading={sectionLoading}
                onOptimizeSection={handleOptimizeSection}
                onClickSuggestion={id => setActiveSuggId(prev => prev === id ? null : id)}
                onAcceptSuggestion={handleAccept}
                onRejectSuggestion={handleReject}
              />
            </div>
          )}
        </div>

        {/* Highlight legend */}
        {analysis && (
          <div className="bg-white border-t border-gray-100 px-5 py-2 flex items-center gap-5 flex-shrink-0">
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Highlights:</span>
            <span className="flex items-center gap-1.5 text-[10px] text-gray-600">
              <span className="w-3 h-3 rounded-sm bg-green-100 border border-green-300 flex-shrink-0" />Keyword matched
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-gray-600">
              <span className="w-3 h-3 rounded-sm bg-amber-100 border-b-2 border-amber-400 flex-shrink-0" />AI suggestion — click to review
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-gray-600">
              <span className="w-3 h-3 rounded-sm bg-red-100 border border-red-300 flex-shrink-0" />Missing keyword
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
