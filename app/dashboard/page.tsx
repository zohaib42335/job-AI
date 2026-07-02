"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  where,
  getCountFromServer,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import {
  FileSearch,
  Sparkles,
  Briefcase,
  Link2,
  Send,
  FileText,
  KanbanSquare,
  TrendingUp,
  ClipboardList,
  CalendarCheck,
  Star,
  ChevronRight,
  Lightbulb,
  ArrowUpRight,
  Loader2,
} from "lucide-react";
import { clsx } from "clsx";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AppStatus = "Saved" | "Applied" | "Interview" | "Offer" | "Rejected";

interface RecentApplication {
  id: string;
  company: string;
  role: string;
  status: AppStatus;
  appliedAt: Date | null;
}

interface DashboardStats {
  totalApplications: number;
  matchReportsRun: number;
  interviewsScheduled: number;
  resumeScore: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<AppStatus, { bg: string; text: string; dot: string }> = {
  Saved:     { bg: "bg-gray-100",   text: "text-gray-600",  dot: "bg-gray-400"   },
  Applied:   { bg: "bg-blue-50",    text: "text-blue-700",  dot: "bg-blue-500"   },
  Interview: { bg: "bg-amber-50",   text: "text-amber-700", dot: "bg-amber-400"  },
  Offer:     { bg: "bg-green-50",   text: "text-green-700", dot: "bg-green-500"  },
  Rejected:  { bg: "bg-red-50",     text: "text-red-600",   dot: "bg-red-400"    },
};

const QUICK_ACTIONS = [
  {
    label:       "Match Report",
    href:        "/match-report",
    icon:        FileSearch,
    description: "Upload your resume and a job description to get an instant ATS match score.",
    color:       "text-violet-600",
    bg:          "bg-violet-50",
  },
  {
    label:       "AI Optimize",
    href:        "/ai-optimize",
    icon:        Sparkles,
    description: "Let AI rewrite your resume bullets to perfectly match the job requirements.",
    color:       "text-blue-600",
    bg:          "bg-blue-50",
  },
  {
    label:       "Job Match",
    href:        "/job-match",
    icon:        Briefcase,
    description: "Discover curated job listings matched to your skills and experience.",
    color:       "text-indigo-600",
    bg:          "bg-indigo-50",
  },
  {
    label:       "LinkedIn Optimization",
    href:        "/linkedin",
    icon:        Link2,
    description: "Improve your LinkedIn profile headline, summary, and skills section.",
    color:       "text-sky-600",
    bg:          "bg-sky-50",
  },
  {
    label:       "Auto Apply",
    href:        "/auto-apply",
    icon:        Send,
    description: "Automatically apply to matching jobs with a single click.",
    color:       "text-emerald-600",
    bg:          "bg-emerald-50",
  },
  {
    label:       "Resume Builder",
    href:        "/resume-builder",
    icon:        FileText,
    description: "Build an ATS-optimised resume from scratch with AI assistance.",
    color:       "text-orange-600",
    bg:          "bg-orange-50",
  },
  {
    label:       "Job Tracker",
    href:        "/job-tracker",
    icon:        KanbanSquare,
    description: "Track every application on a visual kanban board with status updates.",
    color:       "text-teal-600",
    bg:          "bg-teal-50",
  },
] as const;

const ATS_TIPS = [
  {
    title:   "Use exact keywords from the job description",
    body:    "ATS systems rank resumes by keyword density. Mirror the exact phrasing used in the job posting — especially for skills, tools, and job titles.",
    icon:    "🎯",
  },
  {
    title:   "Avoid tables, columns, and graphics",
    body:    "Many ATS parsers read text linearly. Multi-column layouts, headers, footers, and images are often skipped entirely — use a single-column format.",
    icon:    "📄",
  },
  {
    title:   "Quantify every achievement",
    body:    "Replace vague phrases like 'improved performance' with measurable results: 'Reduced API response time by 40%, improving user retention by 18%.'",
    icon:    "📊",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 animate-pulse">
      <div className="h-4 bg-gray-100 rounded w-1/2 mb-4" />
      <div className="h-8 bg-gray-100 rounded w-1/3 mb-2" />
      <div className="h-3 bg-gray-100 rounded w-2/3" />
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  loading,
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: React.ElementType;
  loading: boolean;
}) {
  if (loading) return <SkeletonCard />;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-start gap-4 hover:shadow-md transition-shadow">
      <div className="p-3 rounded-xl bg-blue-50 flex-shrink-0">
        <Icon className="h-5 w-5 text-blue-600" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
        <p className="text-3xl font-bold text-gray-900 tabular-nums leading-none mb-1">
          {value}
        </p>
        <p className="text-xs text-gray-400">{sub}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: AppStatus }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.Saved;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold",
        s.bg,
        s.text
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full flex-shrink-0", s.dot)} />
      {status}
    </span>
  );
}

function SectionHeader({
  title,
  href,
  linkLabel = "View all",
}: {
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {href && (
        <Link
          href={href}
          className="flex items-center gap-1 text-sm text-blue-600 font-medium hover:text-blue-700 transition-colors"
        >
          {linkLabel}
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function toDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === "object" && val !== null && "toDate" in val) {
    return (val as { toDate(): Date }).toDate();
  }
  return null;
}

function capitalize(s: string): string {
  if (!s) return "Saved";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();

  const [stats, setStats] = useState<DashboardStats>({
    totalApplications:  0,
    matchReportsRun:    0,
    interviewsScheduled:0,
    resumeScore:        null,
  });
  const [recentApps, setRecentApps]   = useState<RecentApplication[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [appsLoading, setAppsLoading]   = useState(true);

  useEffect(() => {
    if (!user) return;

    const uid = user.uid;

    // ── Fetch stats ──────────────────────────────────────────────────────
    (async () => {
      try {
        const appsRef       = collection(db, "users", uid, "jobApplications");
        const reportsRef    = collection(db, "users", uid, "matchReports");
        const interviewsQ   = query(appsRef, where("status", "==", "interview"));

        const [appsSnap, reportsSnap, interviewsSnap] = await Promise.all([
          getCountFromServer(appsRef),
          getCountFromServer(reportsRef),
          getCountFromServer(query(interviewsQ)),
        ]);

        // Latest match score
        const latestReportQ = query(reportsRef, orderBy("createdAt", "desc"), limit(1));
        const latestReportSnap = await getDocs(latestReportQ);
        const latestScore = latestReportSnap.empty
          ? null
          : (latestReportSnap.docs[0].data().score as number ?? null);

        setStats({
          totalApplications:   appsSnap.data().count,
          matchReportsRun:     reportsSnap.data().count,
          interviewsScheduled: interviewsSnap.data().count,
          resumeScore:         latestScore,
        });
      } catch (err) {
        console.error("Failed to load stats:", err);
      } finally {
        setStatsLoading(false);
      }
    })();

    // ── Fetch recent applications ────────────────────────────────────────
    (async () => {
      try {
        const appsRef = collection(db, "users", uid, "jobApplications");
        const q = query(appsRef, orderBy("createdAt", "desc"), limit(5));
        const snap = await getDocs(q);

        const apps: RecentApplication[] = snap.docs.map((doc) => {
          const d = doc.data();
          return {
            id:        doc.id,
            company:   d.company      ?? "Unknown Company",
            role:      d.role         ?? "Unknown Role",
            status:    capitalize(d.status as string) as AppStatus ?? "Saved",
            appliedAt: toDate(d.createdAt),
          };
        });
        setRecentApps(apps);
      } catch (err) {
        console.error("Failed to load applications:", err);
      } finally {
        setAppsLoading(false);
      }
    })();
  }, [user]);

  const displayName = user?.displayName?.split(" ")[0] ?? "there";
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="max-w-7xl mx-auto space-y-8">

      {/* ── Greeting ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {greeting}, {displayName} 👋
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Here&apos;s a snapshot of your job search activity.
        </p>
      </div>

      {/* ── Stat cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total Applications"
          value={stats.totalApplications}
          sub="Across all statuses"
          icon={ClipboardList}
          loading={statsLoading}
        />
        <StatCard
          label="Match Reports Run"
          value={stats.matchReportsRun}
          sub="ATS analyses completed"
          icon={TrendingUp}
          loading={statsLoading}
        />
        <StatCard
          label="Interviews Scheduled"
          value={stats.interviewsScheduled}
          sub="Active interview pipeline"
          icon={CalendarCheck}
          loading={statsLoading}
        />
        <StatCard
          label="Resume Score"
          value={
            stats.resumeScore !== null ? `${stats.resumeScore}%` : "—"
          }
          sub="Latest ATS match score"
          icon={Star}
          loading={statsLoading}
        />
      </div>

      {/* ── Main 2-column grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left col (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">

          {/* Recent Applications */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <SectionHeader title="Recent Applications" href="/job-tracker" />

            {appsLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="h-10 w-10 rounded-xl bg-gray-100 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 bg-gray-100 rounded w-2/5" />
                      <div className="h-3 bg-gray-100 rounded w-1/3" />
                    </div>
                    <div className="h-6 w-20 bg-gray-100 rounded-full" />
                  </div>
                ))}
              </div>
            ) : recentApps.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-14 w-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
                  <KanbanSquare className="h-7 w-7 text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-500">No applications yet</p>
                <p className="text-xs text-gray-400 mt-1">
                  Start tracking your job applications in the Job Tracker.
                </p>
                <Link
                  href="/job-tracker"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  Go to Job Tracker
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {recentApps.map((app) => (
                  <div
                    key={app.id}
                    className="flex items-center gap-4 py-3 first:pt-0 last:pb-0 group"
                  >
                    {/* Company avatar */}
                    <div className="h-10 w-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0 text-sm font-bold text-gray-400">
                      {app.company[0].toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {app.role}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{app.company}</p>
                    </div>

                    {/* Date */}
                    <p className="text-xs text-gray-400 hidden sm:block flex-shrink-0">
                      {formatDate(app.appliedAt)}
                    </p>

                    {/* Status badge */}
                    <div className="flex-shrink-0">
                      <StatusBadge status={app.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <SectionHeader title="Quick Actions" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {QUICK_ACTIONS.map(({ label, href, icon: Icon, description, color, bg }) => (
                <Link
                  key={href}
                  href={href}
                  id={`quick-action-${href.replace("/", "")}`}
                  className="group flex items-start gap-4 p-4 rounded-xl border border-gray-100 hover:border-blue-100 hover:bg-blue-50/30 transition-all duration-150"
                >
                  <div
                    className={clsx(
                      "p-2.5 rounded-xl flex-shrink-0 transition-transform group-hover:scale-110 duration-150",
                      bg
                    )}
                  >
                    <Icon className={clsx("h-5 w-5", color)} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 mb-0.5 group-hover:text-blue-700 transition-colors">
                      {label}
                    </p>
                    <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                      {description}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Right col (1/3 width) */}
        <div className="space-y-6">

          {/* ATS Tips */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <SectionHeader title="ATS Tips of the Day" />
            <div className="space-y-4">
              {ATS_TIPS.map((tip, i) => (
                <div
                  key={i}
                  className="flex gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100"
                >
                  <span className="text-xl flex-shrink-0 mt-0.5" role="img" aria-label="tip">
                    {tip.icon}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 mb-1 leading-snug">
                      {tip.title}
                    </p>
                    <p className="text-xs text-gray-500 leading-relaxed">{tip.body}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-100">
              <Lightbulb className="h-4 w-4 text-blue-500 flex-shrink-0" />
              <p className="text-xs text-blue-700 font-medium">
                Run a Match Report to get personalised ATS tips for your resume.
              </p>
            </div>
          </div>

          {/* Progress nudge */}
          {!statsLoading && stats.totalApplications === 0 && (
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-6 text-white">
              <p className="text-sm font-semibold mb-1">🚀 Get started</p>
              <p className="text-xs opacity-90 leading-relaxed mb-4">
                Upload your resume and run your first Match Report to see how well you match a job description.
              </p>
              <Link
                href="/match-report"
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white text-blue-700 px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors"
              >
                Run Match Report
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
