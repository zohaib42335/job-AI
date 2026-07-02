"use client";

import {
  useEffect, useState, useRef, useCallback, useMemo,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { getUserResumes } from "@/lib/resume";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { getWizardState, clearWizardState } from "@/lib/linkedin-wizard";
import type {
  LinkedInAuditResult, AuditItem, AuditStatus,
  HeadlineAudit, ProfileSummaryAudit, BasicInformationAudit,
} from "@/app/api/linkedin-audit/route";
import {
  CheckCircle2, XCircle, AlertTriangle, Info, Lightbulb,
  Sparkles, Copy, Check, History, RefreshCcw, Printer,
  ChevronDown, ChevronRight, Plus,
} from "lucide-react";
import { clsx } from "clsx";
import toast from "react-hot-toast";

/* ─────────────────────────────────────────────────────────────────────────────
   Print-friendly styles injected once
───────────────────────────────────────────────────────────────────────────── */
const PRINT_CSS = `
@media print {
  body * { visibility: hidden; }
  #linkedin-report-root, #linkedin-report-root * { visibility: visible; }
  #linkedin-report-root { position: absolute; inset: 0; }
  #linkedin-sidebar { display: none !important; }
  .no-print { display: none !important; }
  .bg-white { background: white !important; }
  * { -webkit-print-color-adjust: exact; color-adjust: exact; }
}`;

/* ─────────────────────────────────────────────────────────────────────────────
   Sidebar nav sections
───────────────────────────────────────────────────────────────────────────── */
const FINDINGS_SECTIONS = [
  { id: "basic-information", label: "Basic Information" },
  { id: "high-impact",       label: "High Impact"       },
  { id: "work-experience",   label: "Work Experience"   },
  { id: "key-skills",        label: "Key Skills"        },
  { id: "education",         label: "Education"         },
  { id: "tips-and-tricks",   label: "Tips & Tricks"     },
];

/* ─────────────────────────────────────────────────────────────────────────────
   LinkedIn SVG icon
───────────────────────────────────────────────────────────────────────────── */
function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Score ring
───────────────────────────────────────────────────────────────────────────── */
function ScoreRing({ score }: { score: number }) {
  const r    = 44;
  const circ = 2 * Math.PI * r;
  const off  = circ - (score / 100) * circ;
  const color = score >= 75 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626";
  const label = score >= 75 ? "Great" : score >= 50 ? "Fair" : "Needs work";

  return (
    <div className="relative w-28 h-28 flex-shrink-0">
      <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90">
        <circle cx="56" cy="56" r={r} fill="none" stroke="#f3f4f6" strokeWidth="10" />
        <circle cx="56" cy="56" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1.6s cubic-bezier(0.4,0,0.2,1)" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black tabular-nums leading-none" style={{ color }}>{score}</span>
        <span className="text-[10px] font-semibold" style={{ color }}>{label}</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Status icon
───────────────────────────────────────────────────────────────────────────── */
function StatusIcon({ status, size = "md" }: { status: AuditStatus; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  if (status === "pass")    return <CheckCircle2 className={clsx(cls, "text-green-500 flex-shrink-0")} />;
  if (status === "fail")    return <XCircle      className={clsx(cls, "text-red-500   flex-shrink-0")} />;
  return                           <AlertTriangle className={clsx(cls, "text-amber-500 flex-shrink-0")} />;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Copy button
───────────────────────────────────────────────────────────────────────────── */
function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}
      className="no-print flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 transition-colors"
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied!" : label}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Audit check row
───────────────────────────────────────────────────────────────────────────── */
function CheckRow({ item }: { item: AuditItem }) {
  return (
    <div className="py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-start gap-3">
        <div className="pt-0.5 flex-shrink-0"><StatusIcon status={item.status} /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800">{item.label}</span>
            {item.status === "pass" && <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full border border-green-200">✓ Good</span>}
            {item.status === "fail" && <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full border border-red-200">✗ Improve</span>}
          </div>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">{item.message}</p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Section wrapper card
───────────────────────────────────────────────────────────────────────────── */
function SectionCard({ id, title, score, items, sectionRef, children }: {
  id: string; title: string; score?: number; items?: AuditItem[];
  sectionRef?: React.RefObject<HTMLDivElement>;
  children?: React.ReactNode;
}) {
  const passCount = items ? items.filter(i => i.status === "pass").length : 0;
  const total     = items ? items.length : 0;

  return (
    <section
      ref={sectionRef}
      id={id}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-5 overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <Info className="h-4 w-4 text-gray-300" />
        </div>
        {score !== undefined && (
          <div className="flex items-center gap-3">
            {items && <span className="text-xs text-gray-400 font-semibold">{passCount}/{total} passed</span>}
            <span className={clsx("text-xs font-black px-2.5 py-1 rounded-full",
              score >= 70 ? "bg-green-100 text-green-700" :
              score >= 45 ? "bg-amber-100 text-amber-700" :
                            "bg-red-100 text-red-700"
            )}>{score}%</span>
          </div>
        )}
      </div>
      <div className="px-6 py-2">
        {items && items.map((item, i) => <CheckRow key={i} item={item} />)}
        {children}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Basic Information card
───────────────────────────────────────────────────────────────────────────── */
function BasicInfoSection({ data, sectionRef }: {
  data: BasicInformationAudit;
  sectionRef?: React.RefObject<HTMLDivElement>;
}) {
  const items: AuditItem[] = [
    data.fullName, data.profilePicture, data.backgroundPicture,
    data.location, data.industry, data.openToWork,
  ];
  const passCount = items.filter(i => i.status === "pass").length;

  return (
    <section ref={sectionRef} id="basic-information"
      className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-5 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-gray-900">Basic Information</h2>
          <Info className="h-4 w-4 text-gray-300" />
        </div>
        <span className="text-xs text-gray-400 font-semibold">{passCount}/{items.length} passed</span>
      </div>
      <div className="px-6 py-2">
        {items.map((item, i) => <CheckRow key={i} item={item} />)}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Regenerate button with Accept / Try again
───────────────────────────────────────────────────────────────────────────── */
function RegenerateBlock({
  section, currentText, profileData, jobDescriptions,
  label = "Generate new text",
}: {
  section: "headline" | "summary";
  currentText: string;
  profileData: Record<string, unknown>;
  jobDescriptions: string[];
  label?: string;
}) {
  const [status, setStatus]   = useState<"idle" | "loading" | "preview">("idle");
  const [preview, setPreview] = useState("");
  const [accepted, setAccepted] = useState("");

  const generate = async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/linkedin-regenerate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ section, currentText, jobDescriptions, profileData }),
      });
      const j = (await res.json()) as { newText?: string; error?: string };
      if (j.error) throw new Error(j.error);
      setPreview(j.newText ?? "");
      setStatus("preview");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate");
      setStatus("idle");
    }
  };

  const accept = () => { setAccepted(preview); setStatus("idle"); toast.success("Copied to clipboard!"); navigator.clipboard.writeText(preview).catch(() => {}); };

  const displayText = accepted || preview;

  return (
    <div className="mt-4 space-y-2 no-print">
      {displayText && (
        <div className="border border-blue-100 bg-blue-50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wide flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> AI Suggestion
            </span>
            <CopyBtn text={displayText} label="Copy improved text" />
          </div>
          <p className={clsx(
            "text-sm text-blue-900 leading-relaxed",
            section === "summary" ? "whitespace-pre-wrap max-h-48 overflow-y-auto" : ""
          )}>{displayText}</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={generate}
          disabled={status === "loading"}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-white text-xs font-bold text-blue-600 hover:bg-blue-50 disabled:opacity-50 transition-colors"
        >
          {status === "loading"
            ? <><RefreshCcw className="h-3.5 w-3.5 animate-spin" /> Generating…</>
            : <><Sparkles className="h-3.5 w-3.5" /> {status === "preview" ? "Try again" : label}</>}
        </button>

        {status === "preview" && (
          <button onClick={accept}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors">
            <Check className="h-3.5 w-3.5" /> Accept & copy
          </button>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   High Impact section
───────────────────────────────────────────────────────────────────────────── */
function HighImpactSection({
  headline, summary, profileData, jobDescriptions, sectionRef,
}: {
  headline:        HeadlineAudit;
  summary:         ProfileSummaryAudit;
  profileData:     Record<string, unknown>;
  jobDescriptions: string[];
  sectionRef?:     React.RefObject<HTMLDivElement>;
}) {
  const headlineChecks: AuditItem[] = [
    headline.lengthCheck, headline.exactTitleMatch,
    headline.keywordsFound, headline.specialCharactersCheck,
  ];
  const summaryChecks: AuditItem[] = [
    summary.lengthCheck, summary.keywordsCheck, summary.callToActionCheck,
  ];

  return (
    <section ref={sectionRef} id="high-impact"
      className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-5 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <h2 className="text-base font-bold text-gray-900">High Impact</h2>
        <Info className="h-4 w-4 text-gray-300" />
      </div>
      <div className="px-6 py-4 space-y-8">

        {/* Headline */}
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-black flex items-center justify-center">H</span>
            Headline
          </h3>
          <div className="space-y-0 mb-4">
            {headlineChecks.map((item, i) => <CheckRow key={i} item={item} />)}
          </div>
          {headline.currentText && (
            <div className="mb-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Current Headline</p>
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 leading-relaxed">
                &ldquo;{headline.currentText}&rdquo;
              </div>
            </div>
          )}
          {headline.suggestedHeadline && (
            <div className="mb-2">
              <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1.5">AI Suggested Headline</p>
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-900 leading-relaxed flex items-start justify-between gap-3">
                <span>&ldquo;{headline.suggestedHeadline}&rdquo;</span>
                <CopyBtn text={headline.suggestedHeadline} label="Copy" />
              </div>
            </div>
          )}
          <RegenerateBlock
            section="headline"
            currentText={headline.currentText}
            profileData={profileData}
            jobDescriptions={jobDescriptions}
            label="Generate new headline"
          />
        </div>

        <div className="border-t border-gray-100" />

        {/* Profile Summary */}
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-black flex items-center justify-center">S</span>
            Profile Summary / About
          </h3>
          <div className="space-y-0 mb-4">
            {summaryChecks.map((item, i) => <CheckRow key={i} item={item} />)}
          </div>
          {summary.currentText && (
            <div className="mb-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Current Summary</p>
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                {summary.currentText}
              </div>
            </div>
          )}
          {summary.suggestedSummary && (
            <div className="mb-2">
              <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1.5">AI Suggested Summary</p>
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-900 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                {summary.suggestedSummary}
              </div>
              <div className="flex justify-end mt-1.5">
                <CopyBtn text={summary.suggestedSummary} label="Copy improved text" />
              </div>
            </div>
          )}
          <RegenerateBlock
            section="summary"
            currentText={summary.currentText}
            profileData={profileData}
            jobDescriptions={jobDescriptions}
            label="Generate new summary"
          />
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Key Skills section
───────────────────────────────────────────────────────────────────────────── */
function KeySkillsSection({
  score, matched, missing, predicted, sectionRef,
}: {
  score: number; matched: string[]; missing: string[]; predicted: string[];
  sectionRef?: React.RefObject<HTMLDivElement>;
}) {
  return (
    <>
      <section ref={sectionRef} id="key-skills"
        className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-5 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-gray-900">Key Skills</h2>
            <Info className="h-4 w-4 text-gray-300" />
          </div>
          <span className={clsx("text-xs font-black px-2.5 py-1 rounded-full",
            score >= 70 ? "bg-green-100 text-green-700" : score >= 45 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
          )}>{score}%</span>
        </div>
        <div className="px-6 py-5 space-y-5">
          {matched.length > 0 && (
            <div>
              <p className="text-xs font-bold text-green-700 mb-2 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Matched skills ({matched.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {matched.map((s, i) => (
                  <span key={i} className="px-3 py-1 rounded-full text-xs font-semibold border bg-green-50 text-green-700 border-green-200">{s}</span>
                ))}
              </div>
            </div>
          )}
          {missing.length > 0 && (
            <div>
              <p className="text-xs font-bold text-red-600 mb-2 flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5" /> Missing skills ({missing.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {missing.map((s, i) => (
                  <span key={i} className="px-3 py-1 rounded-full text-xs font-semibold border bg-red-50 text-red-700 border-red-200">{s}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Predicted Skills */}
      {predicted.length > 0 && (
        <section id="predicted-skills"
          className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-5 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <h2 className="text-base font-bold text-gray-900">Predicted Skills</h2>
            <Sparkles className="h-4 w-4 text-blue-400" />
            <span className="text-xs text-gray-400 font-normal">AI-suggested skills to consider adding</span>
          </div>
          <div className="px-6 py-5">
            <div className="flex flex-wrap gap-2">
              {predicted.map((s, i) => (
                <span key={i}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border bg-blue-50 text-blue-700 border-blue-200 group cursor-pointer hover:bg-blue-100 transition-colors">
                  {s}
                  <Plus className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </span>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-3">Click any skill to copy it — then add it to your LinkedIn Skills section.</p>
          </div>
        </section>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Loading overlay (inline, not separate loading.tsx)
───────────────────────────────────────────────────────────────────────────── */
function AuditLoader({ phase }: { phase: number }) {
  const phases = [
    "Loading your LinkedIn profile…",
    "Analyzing profile completeness…",
    "Matching keywords against job descriptions…",
    "Generating improvement suggestions…",
  ];
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const pairs: [number, number][] = [[600,20],[1200,42],[2400,65],[3800,83],[5500,90]];
    let t = 0;
    const timers = pairs.map(([ms, target]) => { t += ms; return setTimeout(() => setPct(target), t); });
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-32">
      <div className="relative w-16 h-16">
        <div className="w-16 h-16 rounded-full border-4 border-green-100 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-green-500" />
        </div>
        <span className="absolute inset-0 rounded-full border-4 border-green-300 animate-ping opacity-40" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-base font-bold text-gray-800">{phases[Math.min(phase, phases.length - 1)]}</p>
        <p className="text-xs text-gray-400">This takes about 5–10 seconds</p>
      </div>
      <div className="w-72 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-green-500 rounded-full transition-all duration-700 ease-out" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex gap-1.5 mt-1">
        {phases.map((_, i) => (
          <span key={i} className={`w-2 h-2 rounded-full transition-colors duration-300 ${i <= phase ? "bg-green-500" : "bg-gray-200"}`} />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main page
───────────────────────────────────────────────────────────────────────────── */
export default function LinkedInReportPage() {
  const router    = useRouter();
  const { user }  = useAuth();

  const [audit,        setAudit]        = useState<LinkedInAuditResult | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [phase,        setPhase]        = useState(0);
  const [activeNav,    setActiveNav]    = useState("summary");
  const [findingsOpen, setFindingsOpen] = useState(true);
  const [linkedInUrl,  setLinkedInUrl]  = useState("");
  const [profileData,  setProfileData]  = useState<Record<string, unknown>>({});
  const [jobDescs,     setJobDescs]     = useState<string[]>([]);

  const mainRef = useRef<HTMLDivElement>(null);

  // Section refs for scroll-spy
  const sectionIds = useMemo(() => [
    "summary", "finding", "basic-information", "high-impact",
    "work-experience", "key-skills", "predicted-skills", "education", "tips-and-tricks",
  ], []);

  const sectionRefs = useRef<Record<string, React.RefObject<HTMLDivElement>>>({});
  sectionIds.forEach(id => {
    if (!sectionRefs.current[id])
      sectionRefs.current[id] = { current: null } as React.RefObject<HTMLDivElement>;
  });

  // ── Scroll-spy ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!audit) return;
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length > 0) {
          const topEntry = visible.reduce((a, b) =>
            a.boundingClientRect.top < b.boundingClientRect.top ? a : b
          );
          setActiveNav(topEntry.target.id);
        }
      },
      { root: mainRef.current, threshold: 0.2, rootMargin: "-60px 0px -40% 0px" }
    );
    sectionIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [audit, sectionIds]);

  // ── Nav click ──────────────────────────────────────────────────────────────
  const scrollTo = (id: string) => {
    setActiveNav(id);
    const el = document.getElementById(id);
    if (el && mainRef.current) {
      const top = el.offsetTop - 16;
      mainRef.current.scrollTo({ top, behavior: "smooth" });
    }
  };

  // ── Run audit on mount ─────────────────────────────────────────────────────
  const runAudit = useCallback(async () => {
    setLoading(true);
    setAudit(null);

    const wizardState = getWizardState();
    const url         = (sessionStorage.getItem("linkedin_scan_url") ?? wizardState.linkedInUrl).trim();
    const rawDescs    = sessionStorage.getItem("linkedin_scan_descriptions");
    const descriptions: string[] = rawDescs ? (JSON.parse(rawDescs) as string[]) : [];

    setLinkedInUrl(url);
    setJobDescs(descriptions);

    if (!url && descriptions.length === 0) { router.replace("/linkedin"); return; }

    // Phase ticker
    const phaseTimes = [900, 2000, 3500, 5500];
    const timers     = phaseTimes.map((ms, i) => setTimeout(() => setPhase(i + 1), ms));

    // Build profile from resume
    let pd: Record<string, unknown> = {
      fullName:  url ? (url.split("/in/")[1]?.replace(/\/$/, "") ?? "User") : "User",
      headline: "", about: "", location: "", industry: "",
      openToWork: false, hasProfilePicture: true, hasBackgroundPicture: false,
      experience: [], skills: [], education: [],
    };

    if (user) {
      try {
        const resumes = await getUserResumes(user.uid);
        const r = resumes[0];
        if (r) {
          const f = r.formData;
          pd = {
            ...pd,
            fullName:  f.fullName ?? pd.fullName,
            headline:  f.jobTitle  ?? "",
            about:     f.summary   ?? "",
            location:  f.location  ?? "",
            hasProfilePicture:    true,
            hasBackgroundPicture: false,
            experience: (f.experience ?? []).filter(e => e.jobTitle || e.employer).map(e => ({
              title: e.jobTitle ?? "", company: e.employer ?? "", description: e.description ?? "",
            })),
            skills:    r.skills,
            education: (f.education ?? []).filter(e => e.degree || e.school).map(e => ({
              degree: e.degree ?? "", school: e.school ?? "",
            })),
          };
        }
      } catch { /* use defaults */ }
    }
    setProfileData(pd);

    try {
      const res = await fetch("/api/linkedin-audit", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ profileData: pd, jobDescriptions: descriptions }),
      });
      if (!res.ok) throw new Error("Audit API failed");

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "", evt = "";

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
          if (evt === "error") throw new Error((raw.error as string) ?? "Audit failed");
          if (evt === "result" && raw.audit) {
            const result = raw.audit as LinkedInAuditResult;
            setAudit(result);
            if (user) {
              addDoc(collection(db, "users", user.uid, "linkedinAudits"), {
                overallScore:      result.overallScore,
                targetRoleSummary: result.targetRoleSummary,
                scanDate:          result.scanDate,
                linkedInUrl:       url,
                jobsUsedCount:     result.jobsUsedCount,
                createdAt:         serverTimestamp(),
              }).catch(() => {});
            }
            clearWizardState();
          }
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Audit failed");
      router.push("/linkedin/jobs");
    } finally {
      timers.forEach(clearTimeout);
      setLoading(false);
    }
  }, [user, router]);

  useEffect(() => { void runAudit(); }, [runAudit]);

  // ── Print ─────────────────────────────────────────────────────────────────
  const handlePrint = () => window.print();

  // ── Sidebar nav item ───────────────────────────────────────────────────────
  const NavItem = ({ id, label }: { id: string; label: string }) => (
    <button onClick={() => scrollTo(id)} disabled={loading}
      className={clsx(
        "w-full text-left px-3 py-2 rounded-lg text-sm transition-all",
        activeNav === id && !loading
          ? "bg-blue-50 text-blue-700 font-bold border-l-2 border-blue-600"
          : "text-gray-500 hover:text-gray-800 hover:bg-gray-50",
        loading && "cursor-not-allowed opacity-40"
      )}>
      {label}
    </button>
  );

  return (
    <>
      {/* Inject print CSS */}
      <style>{PRINT_CSS}</style>

      <div id="linkedin-report-root" className="flex -mx-6 -mb-6 h-[calc(100vh-4rem)] overflow-hidden bg-gray-50">

        {/* ════ LEFT SIDEBAR ════════════════════════════════════════════════ */}
        <aside id="linkedin-sidebar"
          className="no-print w-56 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">

          {/* Branding */}
          <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-100">
            <div className="w-6 h-6 rounded bg-[#0077B5] flex items-center justify-center flex-shrink-0">
              <LinkedinIcon className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-xs font-bold text-gray-800 leading-tight">Linkedin Scan Report</span>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-2 py-3 space-y-0.5">
            <NavItem id="summary" label="Summary" />

            {/* Findings (expandable) */}
            <div>
              <button
                onClick={() => setFindingsOpen(o => !o)}
                disabled={loading}
                className={clsx(
                  "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold transition-all",
                  ["basic-information","high-impact","work-experience","key-skills","education","tips-and-tricks"].includes(activeNav)
                    ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50",
                  loading && "opacity-40 cursor-not-allowed"
                )}
              >
                Findings
                {findingsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>

              {findingsOpen && (
                <div className="ml-3 mt-0.5 space-y-0.5 border-l border-gray-100 pl-2">
                  {FINDINGS_SECTIONS.map(s => (
                    <NavItem key={s.id} id={s.id} label={s.label} />
                  ))}
                </div>
              )}
            </div>
          </nav>

          {/* Bottom actions */}
          <div className="px-3 pb-4 space-y-2 border-t border-gray-100 pt-3">
            <button onClick={handlePrint}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
              <Printer className="h-3.5 w-3.5" /> Print Report
            </button>
            <button onClick={() => router.push("/linkedin")}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#0077B5] text-white text-xs font-bold hover:bg-[#006097] transition-colors">
              <LinkedinIcon className="h-3.5 w-3.5" /> New LinkedIn Scan
            </button>
          </div>
        </aside>

        {/* ════ MAIN CONTENT ═══════════════════════════════════════════════ */}
        <div ref={mainRef} className="flex-1 overflow-y-auto scroll-smooth">
          <div className="max-w-3xl mx-auto px-6 py-6">

            {/* Top bar */}
            <div className="flex items-start justify-between mb-6 no-print">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#0077B5] flex items-center justify-center flex-shrink-0">
                  <LinkedinIcon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-black text-gray-900">Linkedin Scan Report</h1>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Optimizing your LinkedIn profile to attract recruiters or supplement your resume in your job search!
                  </p>
                </div>
              </div>
              <button
                onClick={() => router.push("/linkedin/history")}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0">
                <History className="h-3.5 w-3.5" /> Scan History
              </button>
            </div>

            {/* Loading */}
            {loading && <AuditLoader phase={phase} />}

            {/* ── Report ─────────────────────────────────────────────────── */}
            {!loading && audit && (
              <>
                {/* Score card */}
                <section id="summary"
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
                  <div className="flex items-start gap-5">
                    <ScoreRing score={audit.overallScore} />

                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-gray-400 mb-1">
                        Scan Date : {audit.scanDate ?? new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>

                      <p className="text-sm font-black text-gray-900 leading-snug mb-2">
                        {audit.targetRoleSummary}
                      </p>

                      {/* First job bullet */}
                      {jobDescs[0] && (
                        <p className="text-xs text-gray-500 mb-3 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                          {jobDescs[0].split("\n")[0]?.slice(0, 80) ?? ""}
                        </p>
                      )}

                      {/* Counts */}
                      <div className="flex items-center gap-4 mb-2">
                        <span className="flex items-center gap-1.5 text-sm font-bold text-red-600">
                          <XCircle className="h-4 w-4" />
                          {audit.needsImprovementCount}
                          <span className="font-normal text-gray-500 text-xs">Needs improvement</span>
                        </span>
                        <div className="w-px h-4 bg-gray-200" />
                        <span className="flex items-center gap-1.5 text-sm font-bold text-green-600">
                          <CheckCircle2 className="h-4 w-4" />
                          {audit.wellDoneCount}
                          <span className="font-normal text-gray-500 text-xs">Well done</span>
                        </span>
                      </div>

                      {audit.needsImprovementCount > 0 && (
                        <button onClick={() => scrollTo("basic-information")}
                          className="no-print text-xs text-blue-600 hover:underline font-semibold">
                          See {audit.needsImprovementCount} areas to improve →
                        </button>
                      )}

                      {linkedInUrl && (
                        <a href={linkedInUrl} target="_blank" rel="noreferrer"
                          className="block text-[11px] text-blue-500 hover:underline mt-1 truncate">
                          {linkedInUrl}
                        </a>
                      )}
                    </div>
                  </div>

                  {/* JD count warning */}
                  {audit.jobsUsedCount < 3 && (
                    <div className="mt-4 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                      <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                      <p className="text-xs text-amber-800">
                        Report created with only <span className="font-bold">{audit.jobsUsedCount}</span> job description(s).
                        We recommend at least 3 job descriptions for a more accurate analysis.
                      </p>
                    </div>
                  )}
                </section>

                {/* Findings overview */}
                <section id="finding"
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
                  <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Info className="h-4 w-4 text-blue-500" /> Findings Overview
                  </h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
                      <XCircle className="h-7 w-7 text-red-500 mx-auto mb-1" />
                      <p className="text-3xl font-black text-red-600">{audit.needsImprovementCount}</p>
                      <p className="text-xs text-gray-600 mt-0.5">Needs improvement</p>
                    </div>
                    <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
                      <CheckCircle2 className="h-7 w-7 text-green-500 mx-auto mb-1" />
                      <p className="text-3xl font-black text-green-600">{audit.wellDoneCount}</p>
                      <p className="text-xs text-gray-600 mt-0.5">Well done</p>
                    </div>
                  </div>
                </section>

                {/* Basic Information */}
                <BasicInfoSection
                  data={audit.basicInformation}
                  sectionRef={sectionRefs.current["basic-information"] as React.RefObject<HTMLDivElement>}
                />

                {/* High Impact */}
                <HighImpactSection
                  headline={audit.highImpact.headline}
                  summary={audit.highImpact.profileSummary}
                  profileData={profileData}
                  jobDescriptions={jobDescs}
                  sectionRef={sectionRefs.current["high-impact"] as React.RefObject<HTMLDivElement>}
                />

                {/* Work Experience */}
                <SectionCard
                  id="work-experience"
                  title="Work Experience"
                  score={audit.workExperience.score}
                  items={audit.workExperience.items}
                  sectionRef={sectionRefs.current["work-experience"] as React.RefObject<HTMLDivElement>}
                />

                {/* Key Skills + Predicted Skills */}
                <KeySkillsSection
                  score={audit.keySkills.score}
                  matched={audit.keySkills.matched}
                  missing={audit.keySkills.missing}
                  predicted={audit.predictedSkills}
                  sectionRef={sectionRefs.current["key-skills"] as React.RefObject<HTMLDivElement>}
                />

                {/* Education */}
                <SectionCard
                  id="education"
                  title="Education"
                  score={audit.education.score}
                  items={audit.education.items}
                  sectionRef={sectionRefs.current["education"] as React.RefObject<HTMLDivElement>}
                />

                {/* Tips & Tricks */}
                <section
                  ref={sectionRefs.current["tips-and-tricks"] as React.RefObject<HTMLDivElement>}
                  id="tips-and-tricks"
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-5 overflow-hidden"
                >
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                    <h2 className="text-base font-bold text-gray-900">Tips & Tricks</h2>
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="px-6 py-4 space-y-3">
                    {audit.tipsAndTricks.map((tip, i) => (
                      <div key={i} className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                        <span className="w-6 h-6 rounded-full bg-amber-200 text-amber-900 text-[10px] font-black flex items-center justify-center flex-shrink-0">{i + 1}</span>
                        <p className="text-xs text-gray-700 leading-relaxed flex-1">{tip}</p>
                        <CopyBtn text={tip} />
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
