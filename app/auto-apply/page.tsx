"use client";

import {
  useState, useEffect, useCallback, useRef,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import {
  collection, onSnapshot, query, orderBy, doc, getDoc,
} from "firebase/firestore";
import { getUserResumes } from "@/lib/resume";
import { localScore, categorizeMatch } from "@/lib/job-match";
import type { JobMatchResult } from "@/lib/job-match";
import { topUpCredits, getCredits } from "@/lib/auto-apply";
import {
  Zap, Settings2, Coins, Bell, X, Search, MapPin,
  Building2, Clock, ChevronLeft, ChevronRight,
  MousePointerClick, ClipboardList, FileText, CheckCircle2,
  XCircle, AlertCircle, Loader2, Inbox, AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { clsx } from "clsx";
import toast from "react-hot-toast";

// ─────────────────────────────────────────────────────────────────────────────
// Types  (no types/index.ts in this project — defined locally)
// ─────────────────────────────────────────────────────────────────────────────

type AppStatus = "Autofilling" | "Pending Review" | "Applied" | "Submitting" | "Failed";

interface ApplicationRow {
  id:          string;
  jobTitle:    string;
  company:     string;
  status:      AppStatus;
  submittedAt?: string;   // ISO string or human-readable
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const JOBS_PER_PAGE = 9;
const BANNER_KEY    = "auto_apply_banner_dismissed";

// ─────────────────────────────────────────────────────────────────────────────
// Job description parser
// Splits raw JSearch plain-text description into named subsections
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_PATTERNS: [RegExp, string][] = [
  [/^(about\s+(the\s+)?(role|job|us|company|position))/i, "about"],
  [/^(key\s+)?(responsibilities|duties|what you.ll do|your role)/i, "responsibilities"],
  [/^(requirements|qualifications|what you.ll need|what we.re looking for|required)/i, "requirements"],
  [/^(preferred|nice[- ]to[- ]have)/i, "preferred"],
  [/^(benefits|perks|what we offer|compensation|why join)/i, "benefits"],
];

function matchSection(line: string): string | null {
  const clean = line.trim().replace(/[:\-_•*]+$/, "").trim();
  if (clean.length > 80) return null;
  for (const [re, name] of SECTION_PATTERNS) {
    if (re.test(clean)) return name;
  }
  return null;
}

interface ParsedDescription {
  intro:           string;
  about:           string;
  responsibilities: string[];
  requirements:    string[];
  preferred:       string[];
  benefits:        string[];
  rest:            string;
}

function parseDescription(raw: string): ParsedDescription {
  const lines  = raw.split(/\n/).map(l => l.trim()).filter(Boolean);
  const result: ParsedDescription = {
    intro: "", about: "", responsibilities: [],
    requirements: [], preferred: [], benefits: [], rest: "",
  };

  let current: string | null = null;
  const intro: string[] = [];
  const restLines: string[] = [];

  for (const line of lines) {
    const sec = matchSection(line);
    if (sec) { current = sec; continue; }

    const isBullet = /^[•\-\*]\s*/.test(line);
    const text     = line.replace(/^[•\-\*]\s*/, "").trim();

    if (!current) {
      intro.push(line);
    } else if (current === "about") {
      result.about += (result.about ? " " : "") + line;
    } else if (current === "responsibilities" && (isBullet || text.length < 200)) {
      result.responsibilities.push(text);
    } else if (current === "requirements" && (isBullet || text.length < 200)) {
      result.requirements.push(text);
    } else if (current === "preferred") {
      result.preferred.push(text);
    } else if (current === "benefits") {
      result.benefits.push(text);
    } else {
      restLines.push(line);
    }
  }

  result.intro = intro.slice(0, 6).join(" ");
  result.rest  = restLines.join("\n");
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// JobDetailPanel
// ─────────────────────────────────────────────────────────────────────────────

function JobDetailPanel({
  job, onClose, onAutoApply,
}: {
  job:         JobMatchResult;
  onClose:     () => void;
  onAutoApply: (job: JobMatchResult) => void;
}) {
  const parsed = parseDescription(job.description);
  const cat    = job.match >= 80 ? "TOP MATCH" : job.match >= 60 ? "GOOD MATCH" : "FAIR MATCH";

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px] transition-opacity"
        onClick={onClose}
        aria-hidden
      />

      {/* Slide-over panel */}
      <div className="fixed right-0 top-0 bottom-0 z-40 w-full sm:w-[420px] lg:w-[38vw] bg-white shadow-2xl flex flex-col animate-slide-in-right overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            {/* Match badge */}
            <span className={clsx(
              "inline-flex text-[10px] font-black px-2.5 py-0.5 rounded-full mb-2",
              cat === "TOP MATCH"  ? "bg-blue-600 text-white" :
              cat === "GOOD MATCH" ? "bg-green-500 text-white" :
                                     "bg-gray-200 text-gray-600"
            )}>{cat === "TOP MATCH" ? "Top Match" : cat === "GOOD MATCH" ? "Good Match" : "Fair Match"}</span>

            <h2 className="text-lg font-black text-gray-900 leading-tight mb-1">{job.title}</h2>
            <p className="flex items-center gap-1.5 text-sm text-gray-500 mb-0.5">
              <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />{job.company}
            </p>
            <p className="flex items-center gap-1.5 text-sm text-gray-500">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />{job.location}
            </p>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <button
            onClick={() => onAutoApply(job)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 transition-colors"
          >
            <Zap className="h-4 w-4" /> Auto Apply
          </button>
          {job.applyUrl && job.applyUrl !== "#" && (
            <a
              href={job.applyUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <ExternalLink className="h-4 w-4" /> View job site
            </a>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Key-value metadata */}
          <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-2">
            {[
              { label: "Job Title",   value: job.title             },
              { label: "Job Type",    value: job.type              },
              { label: "Location",    value: job.location          },
              job.salary ? { label: "Salary", value: job.salary }  : null,
              { label: "Posted",      value: job.posted            },
              job.remote ? { label: "Remote",  value: "Yes" }      : null,
            ].filter(Boolean).map((row, i) => (
              <div key={i} className="flex gap-3">
                <span className="text-xs font-bold text-gray-400 w-24 flex-shrink-0 pt-0.5">{row!.label}</span>
                <span className="text-xs text-gray-700 leading-relaxed">{row!.value}</span>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100" />
          <h3 className="text-sm font-bold text-gray-900">Job Description</h3>

          {/* Intro / About */}
          {(parsed.intro || parsed.about) && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">About the Role</p>
              <p className="text-sm text-gray-700 leading-relaxed">
                {parsed.about || parsed.intro}
              </p>
            </div>
          )}

          {/* Responsibilities */}
          {parsed.responsibilities.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Key Responsibilities</p>
              <ul className="space-y-1.5">
                {parsed.responsibilities.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Requirements */}
          {parsed.requirements.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Requirements</p>
              <ul className="space-y-1.5">
                {parsed.requirements.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-green-500" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Preferred */}
          {parsed.preferred.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Preferred / Nice to Have</p>
              <ul className="space-y-1.5">
                {parsed.preferred.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 mt-1.5" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Benefits */}
          {parsed.benefits.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Benefits & Perks</p>
              <ul className="space-y-1.5">
                {parsed.benefits.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0 mt-1.5" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Skills chips */}
          {job.tags.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {job.tags.map((tag, i) => (
                  <span key={i} className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-0.5 font-semibold">{tag}</span>
                ))}
              </div>
            </div>
          )}

          {/* Fallback: raw description if nothing parsed */}
          {!parsed.about && !parsed.intro && parsed.responsibilities.length === 0 && parsed.requirements.length === 0 && (
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{job.description}</p>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slide-in-right {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
      `}</style>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Status badge (All Applications table)
// ─────────────────────────────────────────────────────────────────────────────

function AppStatusBadge({ status }: { status: AppStatus }) {
  const cfg: Record<AppStatus, { cls: string; Icon: React.ElementType }> = {
    "Autofilling":    { cls: "bg-gray-100 text-gray-600",    Icon: Loader2       },
    "Pending Review": { cls: "bg-amber-100 text-amber-700",  Icon: AlertTriangle },
    "Applied":        { cls: "bg-green-100 text-green-700",  Icon: CheckCircle2  },
    "Submitting":     { cls: "bg-blue-100 text-blue-700",    Icon: Loader2       },
    "Failed":         { cls: "bg-red-100 text-red-600",      Icon: XCircle       },
  };
  const { cls, Icon } = cfg[status];
  return (
    <span className={clsx("flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap", cls)}>
      <Icon className={clsx("h-3 w-3 flex-shrink-0", status === "Autofilling" || status === "Submitting" ? "animate-spin" : "")} />
      {status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Match badge
// ─────────────────────────────────────────────────────────────────────────────

function MatchBadge({ score }: { score: number }) {
  const cat = categorizeMatch(score);
  const cfg = {
    "TOP MATCH":  { cls: "bg-blue-600 text-white",          label: "Top Match"  },
    "GOOD MATCH": { cls: "bg-green-500 text-white",         label: "Good Match" },
    "FAIR MATCH": { cls: "bg-gray-200 text-gray-600",       label: "Fair Match" },
  }[cat];
  return (
    <span className={clsx("text-[10px] font-black px-2 py-0.5 rounded-full", cfg.cls)}>
      {cfg.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Info banner
// ─────────────────────────────────────────────────────────────────────────────

function InfoBanner({ onDismiss }: { onDismiss: () => void }) {
  const steps = [
    { Icon: MousePointerClick, title: "Find a job & hit Auto Apply",    sub: "Browse matched jobs and click Apply on any listing you like"          },
    { Icon: ClipboardList,     title: "Complete your preferences",      sub: "Answer a few quick questions — takes less than 2 minutes"              },
    { Icon: FileText,          title: "Review & submit",                sub: "Preview your application and confirm before it goes out"                },
    { Icon: CheckCircle2,      title: "Sit back & wait",                sub: "Done! Track your applications under All Applications"                  },
  ];

  return (
    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 mb-4 relative">
      <button
        onClick={onDismiss}
        className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-blue-100"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>

      <h3 className="text-sm font-black text-blue-900 mb-0.5">We apply to jobs for you</h3>
      <p className="text-xs text-blue-700 mb-0.5 leading-relaxed">
        Hit <strong>Auto Apply</strong> for jobs you like — we&apos;ll ask a few quick questions first, then handle the application for you.{" "}
        Buy your credits here. <span className="font-semibold">Premium members get 20% off.</span>
      </p>
      <p className="text-[11px] text-blue-600 mb-4 leading-relaxed">
        <span className="font-semibold">Note:</span> Some applications may be unsuccessful due to issues with the job listing itself. If one does, we&apos;ll refund your credit.
      </p>

      <div className="grid grid-cols-4 gap-3">
        {steps.map((step, i) => (
          <div key={i} className="flex flex-col items-center text-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-white border border-blue-200 flex items-center justify-center shadow-sm flex-shrink-0">
              <step.Icon className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-blue-900 leading-tight">{step.title}</p>
              <p className="text-[10px] text-blue-600 leading-snug mt-0.5">{step.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Job card
// ─────────────────────────────────────────────────────────────────────────────

function JobCard({
  job,
  onAutoApply,
  onCardClick,
}: {
  job:         JobMatchResult;
  onAutoApply: (job: JobMatchResult) => void;
  onCardClick: (job: JobMatchResult) => void;
}) {
  return (
    <div
      onClick={() => onCardClick(job)}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3 cursor-pointer hover:border-blue-200 hover:shadow-md transition-all group"
    >
      {/* Top: match badge + days ago */}
      <div className="flex items-center justify-between">
        <MatchBadge score={job.match} />
        <span className="text-[10px] text-gray-400 flex items-center gap-1">
          <Clock className="h-3 w-3" />{job.posted}
        </span>
      </div>

      {/* Title */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 leading-tight group-hover:text-blue-700 transition-colors line-clamp-2">
          {job.title}
        </h3>
      </div>

      {/* Company + location */}
      <div className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs text-gray-500">
          <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
          <span className="truncate">{job.company}</span>
        </p>
        <p className="flex items-center gap-1.5 text-xs text-gray-500">
          <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
          <span className="truncate">{job.location}</span>
        </p>
      </div>

      {/* Tags */}
      {job.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {job.tags.slice(0, 3).map((tag, i) => (
            <span key={i} className="text-[10px] text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">{tag}</span>
          ))}
        </div>
      )}

      {/* Auto Apply button */}
      <div className="mt-auto pt-1 flex justify-end">
        <button
          onClick={e => { e.stopPropagation(); onAutoApply(job); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-blue-600 border border-blue-200 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all"
        >
          <Zap className="h-3.5 w-3.5" /> Auto Apply
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────────────────────────────────────────

function Pagination({
  page, total, perPage, onChange,
}: { page: number; total: number; perPage: number; onChange: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1);

  return (
    <div className="flex items-center justify-center gap-1 mt-6">
      <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}
        className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition-colors">
        <ChevronLeft className="h-4 w-4" />
      </button>
      {pages.map(p => (
        <button key={p} onClick={() => onChange(p)}
          className={clsx("w-9 h-9 rounded-lg text-sm font-semibold transition-colors",
            p === page ? "bg-blue-600 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"
          )}>{p}</button>
      ))}
      <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}
        className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition-colors">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// All Applications tab content
// ─────────────────────────────────────────────────────────────────────────────

function AllApplicationsTab({
  apps, onSwitchTab,
}: { apps: ApplicationRow[]; onSwitchTab: () => void }) {
  if (apps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-5">
          <Inbox className="h-9 w-9 text-gray-300" />
        </div>
        <h3 className="text-base font-bold text-gray-800 mb-1">You don&apos;t have any application yet</h3>
        <p className="text-sm text-gray-400 mb-6">Start auto-applying to jobs to see your applications here.</p>
        <button onClick={onSwitchTab}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 transition-colors">
          <Search className="h-4 w-4" /> Search Auto Apply Jobs
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[120px_1fr_180px] gap-4 px-5 py-3 border-b border-gray-100 bg-gray-50">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Status</span>
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Application</span>
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Submitted</span>
      </div>
      <div className="divide-y divide-gray-50">
        {apps.map(app => (
          <div key={app.id}
            className="grid grid-cols-[120px_1fr_180px] gap-4 px-5 py-3.5 items-center hover:bg-gray-50 cursor-pointer transition-colors group">
            {/* Status */}
            <AppStatusBadge status={app.status} />
            {/* Application */}
            <div>
              <p className="text-sm font-bold text-gray-900 truncate group-hover:text-blue-700 transition-colors">{app.jobTitle}</p>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{app.company}</p>
            </div>
            {/* Submitted */}
            <div>
              {app.status === "Pending Review" && (
                <button className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1">
                  Review <ChevronRight className="h-3 w-3" />
                </button>
              )}
              {app.status === "Applied" && (
                <span className="text-xs text-gray-500">{app.submittedAt ?? "—"}</span>
              )}
              {app.status === "Submitting" && (
                <span className="text-xs text-blue-600 font-semibold flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Applying...
                </span>
              )}
              {(app.status === "Autofilling" || app.status === "Failed") && (
                <span className="text-xs text-gray-400">—</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Top Up Credits modal
// ─────────────────────────────────────────────────────────────────────────────

const CREDIT_PACKAGES = [
  { amount: 5,  price: "$4.99",  label: "Starter",    popular: false },
  { amount: 20, price: "$14.99", label: "Popular",     popular: true  },
  { amount: 50, price: "$29.99", label: "Power User",  popular: false },
];

function TopUpModal({
  onClose, userId, onSuccess,
}: { onClose: () => void; userId: string; onSuccess: (added: number) => void }) {
  const [loading, setLoading] = useState(false);

  const handlePurchase = async (amount: number) => {
    setLoading(true);
    // TODO: replace with Stripe checkout session before going to production
    try {
      await topUpCredits(userId, amount);
      onSuccess(amount);
      toast.success(`${amount} credits added!`);
      onClose();
    } catch { toast.error("Failed to add credits."); }
    finally   { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 z-10">
        <button onClick={onClose} className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-700 transition-colors">
          <X className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 mb-1">
          <Coins className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-black text-gray-900">Top Up Credits</h2>
        </div>
        <p className="text-sm text-gray-500 mb-5">Each credit lets you auto-apply to one job. Premium members get 20% off.</p>
        <div className="space-y-3">
          {CREDIT_PACKAGES.map(pkg => (
            <button key={pkg.amount} onClick={() => handlePurchase(pkg.amount)} disabled={loading}
              className={clsx(
                "w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border-2 transition-all disabled:opacity-50",
                pkg.popular
                  ? "border-blue-600 bg-blue-50"
                  : "border-gray-200 hover:border-blue-300 bg-white"
              )}>
              <div className="flex items-center gap-3">
                <div className={clsx("w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black",
                  pkg.popular ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700")}>
                  {pkg.amount}
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-gray-900">{pkg.amount} Credits · {pkg.label}</p>
                  {pkg.popular && <p className="text-[10px] text-blue-600 font-bold">MOST POPULAR</p>}
                </div>
              </div>
              <span className={clsx("text-sm font-black", pkg.popular ? "text-blue-700" : "text-gray-700")}>{pkg.price}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 text-center mt-4">Payments via Stripe — coming soon. Credits added directly for now.</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function AutoApplyPage() {
  const { user } = useAuth();
  const router   = useRouter();

  // UI state
  const [tab,           setTab]           = useState<"jobs" | "apps">("jobs");
  const [bannerVisible, setBannerVisible] = useState(false);
  const [credits,       setCredits]       = useState(0);
  const [showTopUp,     setShowTopUp]     = useState(false);

  // Search
  const [keywords,  setKeywords]  = useState("");
  const [location,  setLocation]  = useState("");
  const [searching, setSearching] = useState(false);
  const [jobs,      setJobs]      = useState<JobMatchResult[]>([]);
  const [page,      setPage]      = useState(1);

  // Applications from Firestore
  const [apps, setApps] = useState<ApplicationRow[]>([]);

  // Job detail panel
  const [selectedJob, setSelectedJob] = useState<JobMatchResult | null>(null);

  // Resume text for local scoring
  const resumeTextRef = useRef("");

  // ── Load real credit balance ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    getCredits(user.uid).then(setCredits).catch(() => {});
    // Keep live
    const ref  = doc(db, "autoApplyCredits", user.uid);
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) setCredits((snap.data() as { credits: number }).credits ?? 0);
    });
    return unsub;
  }, [user]);

  // ── Banner persistence ──────────────────────────────────────────────────────
  useEffect(() => {
    const dismissed = localStorage.getItem(BANNER_KEY);
    if (!dismissed) setBannerVisible(true);
  }, []);

  const dismissBanner = () => {
    localStorage.setItem(BANNER_KEY, "1");
    setBannerVisible(false);
  };

  // ── Load resume for scoring ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    getUserResumes(user.uid).then(resumes => {
      const r = resumes[0];
      if (!r) return;
      const f = r.formData;
      resumeTextRef.current = [
        f.fullName, f.jobTitle, f.summary,
        ...(f.experience ?? []).map(e => `${e.jobTitle} ${e.description}`),
        r.skills.join(" "),
      ].filter(Boolean).join(" ");
    }).catch(() => {});
  }, [user]);

  // ── Listen to applications/{userId}/items (real-time) ───────────────────────
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "applications", user.uid, "items"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, snap => {
      setApps(snap.docs.map(d => {
        const data = d.data() as {
          jobTitle?: string; company?: string;
          status?: string; submittedAt?: { toDate?: () => Date } | string;
        };
        let submittedAt: string | undefined;
        if (data.submittedAt) {
          const raw = data.submittedAt;
          if (typeof raw === "object" && "toDate" in raw && raw.toDate) {
            submittedAt = raw.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
          } else if (typeof raw === "string") {
            submittedAt = raw;
          }
        }
        // Map backend status → display status
        const statusMap: Record<string, AppStatus> = {
          autofilling:    "Autofilling",
          pending_review: "Pending Review",
          submitting:     "Submitting",
          applied:        "Applied",
          failed:         "Failed",
        };
        return {
          id:          d.id,
          jobTitle:    data.jobTitle  ?? "Unknown Position",
          company:     data.company   ?? "",
          status:      statusMap[data.status ?? ""] ?? "Autofilling",
          submittedAt,
        };
      }));
    }, () => {});
    return unsub;
  }, [user]);

  // ── Search jobs ─────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    const kw = keywords.trim() || "software engineer";
    const loc = location.trim() || "Remote";
    setSearching(true);
    setPage(1);
    try {
      const params = new URLSearchParams({ query: kw, location: loc, page: "1" });
      const res = await fetch(`/api/search-jobs?${params.toString()}`);
      if (!res.ok) throw new Error("Search failed");
      const data = (await res.json()) as { jobs?: unknown[] };
      const raw = (data.jobs ?? []) as JobMatchResult[];
      // Score instantly with local heuristic
      const scored = raw.map(j => ({
        ...j,
        match: resumeTextRef.current
          ? localScore(resumeTextRef.current, j.description)
          : Math.floor(55 + Math.random() * 30),
      }));
      setJobs(scored);
    } catch {
      toast.error("Job search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  }, [keywords, location]);

  // Auto-search on first load
  useEffect(() => { void handleSearch(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Notification permission ─────────────────────────────────────────────────
  const requestNotifications = async () => {
    if (!("Notification" in window)) { toast.error("Notifications not supported in this browser."); return; }
    const result = await Notification.requestPermission();
    if (result === "granted") toast.success("Notifications enabled!");
    else toast.error("Notification permission denied.");
  };

  // ── Auto Apply click ────────────────────────────────────────────────────────
  const handleAutoApply = async (job: JobMatchResult) => {
    if (!user) { toast.error("Please sign in to continue."); return; }

    // ── Step 1: Check onboarding CLIENT-SIDE (Firebase auth works here) ──────
    try {
      const prefSnap = await getDoc(doc(db, "autoApplyPreferences", user.uid));
      const onboardingDone = prefSnap.exists() && prefSnap.data()?.onboardingCompleted === true;

      if (!onboardingDone) {
        // Save where to return after wizard
        sessionStorage.setItem("pending_auto_apply_job", job.id);
        router.push(`/auto-apply/onboarding?jobId=${encodeURIComponent(job.id)}`);
        return;
      }
    } catch {
      // If the read fails, fall through to the API which will also check
    }

    // ── Step 2: Credits check (client-side fast path) ─────────────────────────
    if (credits <= 0) {
      setShowTopUp(true);
      return;
    }

    // ── Step 3: Call API to create application + generate cover letter ────────
    sessionStorage.setItem("pending_auto_apply_job", job.id);
    try {
      const res = await fetch("/api/auto-apply", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          jobId:  job.id,
          userId: user.uid,
          jobData: {
            title:       job.title,
            company:     job.company,
            location:    job.location,
            type:        job.type,
            description: job.description,
            applyUrl:    job.applyUrl ?? "",
          },
        }),
      });
      const json = (await res.json()) as {
        needsOnboarding?: boolean;
        applicationId?:   string;
        code?:            string;
        error?:           string;
      };

      // API may still gate on onboarding (double-check)
      if (json.needsOnboarding) {
        router.push(`/auto-apply/onboarding?jobId=${encodeURIComponent(job.id)}`);
        return;
      }
      if (json.code === "NO_CREDITS") { setShowTopUp(true); return; }
      if (json.error) { toast.error(json.error); return; }
      if (json.applicationId) {
        // Check user's preferred mode and route accordingly
        try {
          const prefSnap2 = await getDoc(doc(db, "autoApplyPreferences", user.uid));
          const mode = prefSnap2.exists() ? prefSnap2.data()?.applyMode : "manual";
          if (mode === "auto") {
            router.push(`/auto-apply/applying/${json.applicationId}`);
          } else {
            router.push(`/auto-apply/review/${json.applicationId}`);
          }
        } catch {
          router.push(`/auto-apply/review/${json.applicationId}`);
        }
      }
    } catch {
      toast.error("Failed to start application. Please try again.");
    }
  };

  const handleCardClick = (job: JobMatchResult) => {
    setSelectedJob(job);
  };

  // Paginated jobs
  const pagedJobs  = jobs.slice((page - 1) * JOBS_PER_PAGE, page * JOBS_PER_PAGE);

  return (
    <div className="flex flex-col gap-0 -mx-1">

      {/* ── Top Up modal ───────────────────────────────────────────── */}
      {showTopUp && user && (
        <TopUpModal
          userId={user.uid}
          onClose={() => setShowTopUp(false)}
          onSuccess={added => setCredits(c => c + added)}
        />
      )}

      {/* ── Job detail slide-over ─────────────────────────────────────── */}
      {selectedJob && (
        <JobDetailPanel
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onAutoApply={job => { setSelectedJob(null); handleAutoApply(job); }}
        />
      )}

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-black text-gray-900">Auto Apply</h1>
        <div className="flex items-center gap-2">
          {/* Credits badge */}
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5">
            <Coins className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-black text-amber-800">
              Auto Apply Credits: <span className="text-amber-600">{credits}</span>
            </span>
          </div>
          {/* Top Up */}
          <button
            onClick={() => setShowTopUp(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-blue-200 text-xs font-bold text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <Coins className="h-3.5 w-3.5" /> Top Up Credits
          </button>
          {/* Preferences */}
          <button
            onClick={() => router.push("/auto-apply/preferences")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Settings2 className="h-3.5 w-3.5" /> Preferences
          </button>
        </div>
      </div>

      {/* ── Info banner ──────────────────────────────────────────────────── */}
      {bannerVisible && <InfoBanner onDismiss={dismissBanner} />}

      {/* ── Notification row ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl px-5 py-3 mb-5 shadow-sm">
        <Bell className="h-5 w-5 text-blue-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-800">Stay updated on your applications</p>
          <p className="text-xs text-gray-500">Get notified when your application is submitted, needs review, or has an update.</p>
        </div>
        <button
          onClick={requestNotifications}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0"
        >
          <Bell className="h-3.5 w-3.5" /> Enable browser notifications
        </button>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 mb-5 border-b border-gray-100">
        {[
          { id: "jobs" as const, label: "Auto-Apply Jobs",  badge: null          },
          { id: "apps" as const, label: "All Applications", badge: apps.length   },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-all",
              tab === t.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            {t.label}
            {t.badge !== null && t.badge > 0 && (
              <span className="bg-blue-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════ TAB 1: Auto-Apply Jobs ═══════════════════════ */}
      {tab === "jobs" && (
        <>
          {/* Search row */}
          <div className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl px-4 py-3 mb-5 shadow-sm">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xs font-bold text-gray-500 whitespace-nowrap">Keywords</span>
              <input
                value={keywords}
                onChange={e => setKeywords(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
                placeholder="e.g. QA Engineer"
                className="flex-1 text-sm text-gray-800 bg-transparent focus:outline-none placeholder-gray-400 min-w-0"
              />
            </div>
            <div className="w-px h-6 bg-gray-200" />
            <div className="flex items-center gap-2 w-40">
              <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <input
                value={location}
                onChange={e => setLocation(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
                placeholder="Location"
                className="flex-1 text-sm text-gray-800 bg-transparent focus:outline-none placeholder-gray-400 min-w-0"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searching}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors flex-shrink-0"
            >
              {searching
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Search className="h-4 w-4" />}
              Search
            </button>
          </div>

          {/* Job grid */}
          {searching ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
              <p className="text-sm text-gray-500">Searching jobs…</p>
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <AlertCircle className="h-10 w-10 text-gray-300 mb-3" />
              <p className="text-sm font-semibold text-gray-500">No jobs found</p>
              <p className="text-xs text-gray-400 mt-1">Try different keywords or location</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-400">{jobs.length} jobs found</p>
                <p className="text-xs text-gray-400">Page {page} of {Math.ceil(jobs.length / JOBS_PER_PAGE)}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {pagedJobs.map(job => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onAutoApply={handleAutoApply}
                    onCardClick={handleCardClick}
                  />
                ))}
              </div>
              <Pagination
                page={page}
                total={jobs.length}
                perPage={JOBS_PER_PAGE}
                onChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              />
            </>
          )}
        </>
      )}

      {/* ══════════════════ TAB 2: All Applications ══════════════════════ */}
      {tab === "apps" && (
        <AllApplicationsTab
          apps={apps}
          onSwitchTab={() => setTab("jobs")}
        />
      )}
    </div>
  );
}
