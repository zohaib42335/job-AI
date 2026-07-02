"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getUserResumes } from "@/lib/resume";
import type { ResumeRecord } from "@/lib/resume";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useJobSearch } from "@/hooks/useJobSearch";
import toast from "react-hot-toast";
import {
  Search, MapPin, ExternalLink, Bookmark, BookmarkCheck,
  Loader2, Briefcase, ChevronDown, RefreshCw, Info,
  CheckCircle2, ArrowUpDown, X, FileText, Scan, Sparkles,
} from "lucide-react";
import { clsx } from "clsx";

// ─────────────────────────────────────────────────────────────────────────────
// Types  — Job interface reused exactly as-is (single definition here)
// ─────────────────────────────────────────────────────────────────────────────

interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  type: string;
  posted: string;
  match: number;
  description: string;
  tags: string[];
  logo: string;
  remote: boolean;
  saved?: boolean;
  applyUrl?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sample data (replace with JSearch / RapidAPI call when key is configured)
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_JOBS: Job[] = [
  {
    id: "1", title: "Product Manager, ChatGPT for Work", company: "OpenAI",
    location: "San Francisco, CA", salary: "$180k – $240k", type: "Full-time",
    posted: "2 days ago", match: 93,
    description: `OpenAI is on a mission to ensure that artificial general intelligence benefits all of humanity. We're looking for a Product Manager to drive ChatGPT for Work products — the suite of tools and integrations that help enterprises unlock the full potential of AI.\n\nYou will work cross-functionally with engineering, design, legal, and GTM teams to define the product roadmap and ship features used by millions of enterprise users.\n\nResponsibilities:\n• Own the product roadmap for ChatGPT for Work\n• Partner with enterprise sales to understand customer needs\n• Define success metrics and monitor product health\n• Lead cross-functional teams from ideation to launch\n• Communicate product strategy to leadership\n\nRequirements:\n• 5+ years of product management experience\n• Experience with B2B SaaS products\n• Strong analytical and communication skills\n• Familiarity with AI/ML products preferred`,
    tags: ["Product Management", "AI", "B2B SaaS", "Roadmapping"],
    logo: "O", remote: true, applyUrl: "#",
  },
  {
    id: "2", title: "Product Manager, ChatGPT for Work", company: "OpenAI",
    location: "New York, NY", salary: "$170k – $220k", type: "Full-time",
    posted: "2 days ago", match: 81,
    description: `Join OpenAI's enterprise product team in New York. You'll be responsible for defining and shipping products that help organizations leverage ChatGPT at scale.\n\nThis role sits at the intersection of product strategy, customer empathy, and technical depth. You'll collaborate closely with engineering and design to build experiences that delight enterprise customers.\n\nRequirements:\n• 4+ years of product management experience\n• Background in enterprise or B2B products\n• Excellent written and verbal communication skills\n• Experience working with AI tools is a plus`,
    tags: ["Product", "Enterprise", "AI", "Strategy"],
    logo: "O", remote: false, applyUrl: "#",
  },
  {
    id: "3", title: "Sr. Product Manager, Media Services", company: "Adobe",
    location: "New York, NY", salary: "$160k – $210k", type: "Full-time",
    posted: "1 day ago", match: 77,
    description: `Our Company\nChanging the world through digital experiences is what Adobe's all about. We give everyone — from emerging artists to global brands — everything they need to design and deliver exceptional digital experiences! We're passionate about empowering people to create beautiful and powerful images, videos, and apps, and transform how companies interact with customers across every screen. We're on a mission to hire the very best and are committed to creating exceptional employee experiences where everyone is respected and has access to equal opportunity.\n\nThe Role\nWe're looking for a Senior Product Manager to drive our Media Services roadmap. You'll define, build, and ship features that power creative workflows for millions of users.\n\nWhat You'll Do:\n• Define and own the Media Services product roadmap\n• Collaborate with engineering, design, and marketing\n• Conduct user research and analyze usage data\n• Drive alignment across stakeholders\n\nWhat You'll Need:\n• 6+ years of product management experience\n• Experience with media/creative tools or cloud platforms\n• Strong data analysis and storytelling skills`,
    tags: ["Product Management", "Media", "Cloud", "SaaS"],
    logo: "A", remote: false, applyUrl: "#",
  },
  {
    id: "4", title: "Senior Product Manager — Growth", company: "Figma",
    location: "San Francisco, CA", salary: "$175k – $230k", type: "Full-time",
    posted: "3 days ago", match: 74,
    description: `Figma is growing our team of passionate people on a mission to make design accessible to all. Our Growth PM will own user acquisition, activation, and retention metrics for our core product.\n\nYou will run experiments, analyze funnels, and partner with engineering and data science to compound Figma's growth.\n\nRequirements:\n• 5+ years PM experience, 2+ years in growth\n• Strong SQL and analytics skills\n• Proven track record of running A/B tests\n• Experience with PLG (product-led growth) motions`,
    tags: ["Growth", "Analytics", "A/B Testing", "PLG"],
    logo: "F", remote: true, applyUrl: "#",
  },
  {
    id: "5", title: "Product Manager II — Platform", company: "Stripe",
    location: "Remote", salary: "$155k – $205k", type: "Full-time",
    posted: "4 days ago", match: 68,
    description: `Stripe is a technology company that builds economic infrastructure for the internet. Our Platform team is looking for a PM to drive our developer-facing products.\n\nYou will define APIs, SDKs, and tooling used by hundreds of thousands of developers to build financial products.\n\nRequirements:\n• 4+ years of product management experience\n• Technical background or engineering experience\n• Experience with developer products or APIs\n• Strong communication skills`,
    tags: ["Platform", "API", "Developer Tools", "Payments"],
    logo: "S", remote: true, applyUrl: "#",
  },
  {
    id: "6", title: "Associate Product Manager — AI Features", company: "Notion",
    location: "San Francisco, CA", salary: "$130k – $170k", type: "Full-time",
    posted: "5 days ago", match: 62,
    description: `Notion is on a mission to make it possible for every person, team, and company to tailor their tools to solve any problem. Join us as an APM to help build AI-powered features into the Notion product.\n\nRequirements:\n• 1-3 years of product management experience\n• Passion for AI and productivity tools\n• Strong analytical skills\n• Excellent communication`,
    tags: ["AI", "Productivity", "APM", "SaaS"],
    logo: "N", remote: false, applyUrl: "#",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DATE_RANGES   = ["Any time", "Past 24 hours", "Past week", "Past month"];
const JOB_TYPES     = ["Any type", "Full-time", "Part-time", "Contract", "Internship"];
const REMOTE_OPTS   = ["All jobs", "Remote only", "Hybrid", "On-site only"];
const DISTANCE_OPTS = ["Within 25 miles", "Within 10 miles", "Within 50 miles", "Anywhere"];
const SORT_OPTS     = ["Relevance", "Date posted", "Salary", "Match score"];

// ─────────────────────────────────────────────────────────────────────────────
// Match badge (exactly matching screenshot)
// ─────────────────────────────────────────────────────────────────────────────

function MatchBadge({ score }: { score: number }) {
  if (score >= 85) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">
        <RefreshCw className="h-2.5 w-2.5" /> Top Match
      </span>
    );
  }
  if (score >= 70) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded bg-green-100 text-green-700 border border-green-200">
        <CheckCircle2 className="h-2.5 w-2.5" /> Good Match
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
      Fair Match
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dropdown filter button
// ─────────────────────────────────────────────────────────────────────────────

function FilterDropdown({
  label, options, value, onChange,
}: {
  label: string; options: string[]; value: string; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = value !== options[0];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={clsx(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors",
          active
            ? "border-blue-500 bg-blue-50 text-blue-700"
            : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
        )}
      >
        {active ? value : label}
        <ChevronDown className="h-3 w-3 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 min-w-[160px] bg-white border border-gray-200 rounded-xl shadow-xl py-1">
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              className={clsx(
                "w-full text-left px-3 py-2 text-xs font-medium transition-colors",
                opt === value ? "bg-blue-50 text-blue-700 font-bold" : "text-gray-700 hover:bg-gray-50"
              )}
            >{opt}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading skeleton
// ─────────────────────────────────────────────────────────────────────────────

function JobCardSkeleton() {
  return (
    <div className="bg-white border-b border-gray-100 px-4 py-4 animate-pulse">
      <div className="h-3 w-16 bg-gray-200 rounded mb-2" />
      <div className="h-4 w-3/4 bg-gray-200 rounded mb-1" />
      <div className="h-3 w-1/2 bg-gray-200 rounded mb-1" />
      <div className="h-3 w-2/3 bg-gray-200 rounded mb-3" />
      <div className="flex justify-between">
        <div className="h-3 w-16 bg-gray-200 rounded" />
        <div className="flex gap-2">
          <div className="h-6 w-12 bg-gray-200 rounded" />
          <div className="h-6 w-6 bg-gray-200 rounded" />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Job card (matches screenshot layout exactly)
// ─────────────────────────────────────────────────────────────────────────────

function JobCard({
  job, selected, onSelect, onSave, onScan, saving,
}: {
  job: Job; selected: boolean;
  onSelect: () => void; onSave: () => void; onScan: () => void;
  saving: boolean;
}) {
  return (
    <div
      onClick={onSelect}
      className={clsx(
        "bg-white border-b border-gray-100 px-4 py-4 cursor-pointer transition-colors hover:bg-gray-50",
        selected && "bg-blue-50 border-l-2 border-l-blue-500"
      )}
    >
      {/* Match badge */}
      <div className="mb-1.5">
        <MatchBadge score={job.match} />
      </div>

      {/* Title */}
      <p className="text-sm font-semibold text-blue-600 hover:underline leading-snug mb-0.5">
        {job.title}
      </p>

      {/* Company */}
      <p className="text-xs font-medium text-gray-800">{job.company}</p>

      {/* Location */}
      <p className="text-xs text-gray-500 mt-0.5">
        {job.location}{job.remote ? " (Remote)" : ""}
      </p>

      {/* Bottom row */}
      <div className="flex items-center justify-between mt-3">
        <span className="text-[11px] text-gray-400">{job.posted}</span>
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          <button
            onClick={onScan}
            className="flex items-center gap-1 px-2.5 py-1 rounded border border-gray-300 text-[11px] font-semibold text-gray-700 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <Scan className="h-3 w-3" /> Scan
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="p-1 rounded hover:bg-gray-100 transition-colors"
          >
            {saving
              ? <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
              : job.saved
                ? <BookmarkCheck className="h-4 w-4 text-blue-600" />
                : <Bookmark className="h-4 w-4 text-gray-400 hover:text-blue-600" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Right panel — Job detail (matches screenshot)
// ─────────────────────────────────────────────────────────────────────────────

function JobDetail({
  job, onSave, onScan, saving,
}: {
  job: Job; onSave: () => void; onScan: () => void; saving: boolean;
}) {
  return (
    <div className="flex flex-col h-full overflow-hidden bg-white border border-gray-200 rounded-xl">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-100">
        <h2 className="text-xl font-black text-gray-900 leading-tight mb-3">{job.title}</h2>

        {/* Company */}
        <p className="text-sm font-bold text-gray-900 mb-2">{job.company}</p>

        {/* Meta rows */}
        <div className="space-y-1.5 mb-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <span>{job.location}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Briefcase className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <span>{job.type}</span>
          </div>
          {job.salary && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="text-gray-400 font-bold text-base leading-none">$</span>
              <span>{job.salary}</span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onScan}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 transition-colors"
          >
            <Scan className="h-4 w-4" /> Scan
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {job.saved
              ? <BookmarkCheck className="h-4 w-4 text-blue-600" />
              : <Bookmark className="h-4 w-4" />}
            {job.saved ? "Saved" : "Save job"}
          </button>
          <a
            href={job.applyUrl ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ExternalLink className="h-4 w-4" /> Apply
          </a>
        </div>
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3">Job description</h3>
        <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
          {job.description}
        </div>

        {job.tags.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-bold text-gray-900 mb-2">Required skills</h3>
            <div className="flex flex-wrap gap-2">
              {job.tags.map(tag => (
                <span key={tag} className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function JobMatchPage() {
  const { user } = useAuth();

  // Resume state
  const [resumes, setResumes]               = useState<ResumeRecord[]>([]);
  const [resumesLoading, setResumesLoading] = useState(true);
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const selectedResume = resumes.find(r => r.id === selectedResumeId);

  // Build resume text for scoring
  const resumeText = selectedResume
    ? [
        selectedResume.formData.fullName,
        selectedResume.formData.jobTitle,
        selectedResume.formData.summary,
        ...(selectedResume.formData.experience ?? []).map(e => `${e.jobTitle} at ${e.employer}\n${e.description}`),
        selectedResume.skills.join(", "),
      ].filter(Boolean).join("\n")
    : "";

  // Job search hook (wires to /api/search-jobs + /api/match-report)
  const { jobs: apiJobs, loading: searching, ranking, error: searchError,
          hasMore, fetchJobs, loadMore, categorizeMatch } = useJobSearch(resumeText || undefined);

  // Merge with local saved-state so bookmark icon persists across re-ranks
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const jobs: Job[] = apiJobs.map(j => ({ ...j, saved: savedIds.has(j.id) })) as Job[];

  // Search input state
  const [query, setQuery]                   = useState("");
  const [location, setLocation]             = useState("");

  // Filters
  const [dateRange, setDateRange]           = useState(DATE_RANGES[0]);
  const [jobType, setJobType]               = useState(JOB_TYPES[0]);
  const [remoteOpt, setRemoteOpt]           = useState(REMOTE_OPTS[0]);
  const [distance, setDistance]             = useState(DISTANCE_OPTS[0]);
  const [sortBy, setSortBy]                 = useState(SORT_OPTS[0]);
  const [filterOpen, setFilterOpen]         = useState(false);

  // Selected job & action states
  const [selectedJob, setSelectedJob]       = useState<Job | null>(null);
  const [savingId, setSavingId]             = useState<string | null>(null);
  const [scanningId, setScanningId]         = useState<string | null>(null);

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) loadMore();
    }, { threshold: 0.5 });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  // Load resumes, then auto-search
  useEffect(() => {
    if (!user) return;
    getUserResumes(user.uid)
      .then(d => {
        setResumes(d);
        if (d[0]) setSelectedResumeId(d[0].id);
      })
      .catch(() => {})
      .finally(() => setResumesLoading(false));
  }, [user]);

  // Auto-search on first load
  const didAutoSearch = useRef(false);
  useEffect(() => {
    if (didAutoSearch.current) return;
    didAutoSearch.current = true;
    void fetchJobs({});
  }, [fetchJobs]);

  // Select first job when results arrive
  useEffect(() => {
    if (jobs.length > 0 && !selectedJob) setSelectedJob(jobs[0]);
  }, [jobs, selectedJob]);

  // Show search errors
  useEffect(() => {
    if (searchError) toast.error(searchError);
  }, [searchError]);

  // Active filter count
  const activeFilters = [
    dateRange !== DATE_RANGES[0],
    jobType   !== JOB_TYPES[0],
    remoteOpt !== REMOTE_OPTS[0],
    distance  !== DISTANCE_OPTS[0],
  ].filter(Boolean).length;

  const clearFilters = () => {
    setDateRange(DATE_RANGES[0]);
    setJobType(JOB_TYPES[0]);
    setRemoteOpt(REMOTE_OPTS[0]);
    setDistance(DISTANCE_OPTS[0]);
  };

  // Apply client-side filters on top of API results
  const filtered = jobs.filter(j => {
    if (jobType !== JOB_TYPES[0]     && j.type !== jobType) return false;
    if (remoteOpt === "Remote only"  && !j.remote)           return false;
    if (remoteOpt === "On-site only" && j.remote)            return false;
    return true;
  }).sort((a, b) => {
    if (sortBy === "Match score") return b.match - a.match;
    return 0;
  });

  // Build employment_types param from jobType filter
  const empTypeMap: Record<string, string> = {
    "Full-time": "FULLTIME", "Part-time": "PARTTIME",
    "Contract":  "CONTRACTOR", "Internship": "INTERN",
  };

  // Search handler — calls real JSearch API
  const handleSearch = useCallback(async () => {
    await fetchJobs({
      query,
      location,
      employment_types: jobType !== JOB_TYPES[0] ? empTypeMap[jobType] : undefined,
      date_posted:      dateRange !== DATE_RANGES[0]
        ? dateRange === "Past 24 hours" ? "today"
          : dateRange === "Past week"   ? "week"
          : dateRange === "Past month"  ? "month" : "all"
        : "all",
      remote_jobs_only: remoteOpt === "Remote only",
    });
  }, [fetchJobs, query, location, jobType, dateRange, remoteOpt, empTypeMap]);

  // Save job → writes to savedJobs + jobApplications (tracker)
  const handleSave = useCallback(async (job: Job) => {
    if (job.saved) {
      // Toggle unsave (client-side only — don't delete from Firestore for safety)
      setSavedIds(prev => { const n = new Set(prev); n.delete(job.id); return n; });
      if (selectedJob?.id === job.id)
        setSelectedJob(prev => prev ? { ...prev, saved: false } : prev);
      return;
    }

    setSavedIds(prev => new Set(prev).add(job.id));
    if (selectedJob?.id === job.id)
      setSelectedJob(prev => prev ? { ...prev, saved: true } : prev);

    if (!user) return;
    setSavingId(job.id);
    try {
      const today = new Date().toISOString().split("T")[0];

      // 1. Save to savedJobs collection
      await addDoc(collection(db, "users", user.uid, "savedJobs"), {
        jobId:       job.id,
        title:       job.title,
        company:     job.company,
        location:    job.location,
        salary:      job.salary,
        type:        job.type,
        description: job.description,
        applyUrl:    job.applyUrl ?? "",
        resumeId:    selectedResumeId || null,
        matchScore:  job.match,
        savedAt:     serverTimestamp(),
      });

      // 2. Also add to Job Tracker (jobApplications) with "wishlist" status
      await addDoc(collection(db, "users", user.uid, "jobApplications"), {
        company:     job.company,
        role:        job.title,
        location:    job.location,
        salary:      job.salary,
        url:         job.applyUrl ?? "",
        status:      "wishlist",
        appliedDate: today,
        notes:       `Match score: ${job.match}%. Saved from Job Match.`,
        priority:    job.match >= 80 ? "high" : job.match >= 60 ? "medium" : "low",
        createdAt:   serverTimestamp(),
      });

      toast.success("Job saved to tracker!");
    } catch {
      toast.error("Failed to save job.");
      // Revert optimistic update
      setSavedIds(prev => { const n = new Set(prev); n.delete(job.id); return n; });
    } finally {
      setSavingId(null);
    }
  }, [user, selectedJob, selectedResumeId]);

  // Scan — navigate to match report with job description pre-filled
  const handleScan = useCallback((job: Job) => {
    setScanningId(job.id);
    // Store job description in sessionStorage so match-report can pick it up
    if (typeof window !== "undefined") {
      sessionStorage.setItem("scanJobDescription", job.description);
      sessionStorage.setItem("scanJobTitle",       job.title);
    }
    // Small delay for UX, then navigate
    setTimeout(() => {
      setScanningId(null);
      window.location.href = "/match-report";
    }, 600);
  }, []);

  return (
    <div className="flex flex-col -mx-6 -mb-6 h-[calc(100vh-4rem)] overflow-hidden">

      {/* ── TOP — Search header ─────────────────────────────────────────── */}
      <div className="bg-gradient-to-b from-slate-50 to-white border-b border-gray-200 px-6 pt-5 pb-0 flex-shrink-0">
        <h1 className="text-2xl font-black text-gray-900 mb-0.5">AI Job Match</h1>
        <p className="text-sm text-gray-500 mb-4">Get personalised skills and qualifications, and let AI match your best-fit jobs.</p>

        {/* Search row */}
        <div className="flex items-stretch gap-0 rounded-xl border border-gray-300 bg-white shadow-sm overflow-hidden mb-3">
          {/* Resume selector */}
          <div className="relative flex-shrink-0">
            <select
              value={selectedResumeId}
              onChange={e => setSelectedResumeId(e.target.value)}
              disabled={resumesLoading}
              className="h-full appearance-none pl-9 pr-8 py-3 text-sm font-semibold text-gray-700 bg-gray-50 border-r border-gray-200 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 disabled:opacity-50 cursor-pointer"
            >
              <option value="">Resume</option>
              {resumes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <FileText className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          </div>

          {/* Center placeholder / keyword input */}
          <div className="flex-1 px-4 py-3 text-sm text-gray-400 flex items-center border-r border-gray-200">
            {selectedResume
              ? <span className="text-gray-700 font-medium truncate">{selectedResume.formData.jobTitle || selectedResume.name}</span>
              : <span className="italic">AI is recommending jobs based on your resume</span>}
          </div>

          {/* Location */}
          <div className="relative flex-shrink-0">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Your current location"
              className="h-full pl-9 pr-4 py-3 text-sm text-gray-700 border-r border-gray-200 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 w-48"
            />
          </div>

          {/* Search button */}
          <button
            onClick={handleSearch}
            disabled={searching}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors flex-shrink-0"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </button>
        </div>

        {/* Filter row */}
        <div className="flex items-center gap-2 pb-3">
          <FilterDropdown label="Date range"     options={DATE_RANGES}   value={dateRange}  onChange={setDateRange} />
          <FilterDropdown label="Job type"       options={JOB_TYPES}     value={jobType}    onChange={setJobType}   />
          <FilterDropdown label="Remote options" options={REMOTE_OPTS}   value={remoteOpt}  onChange={setRemoteOpt} />
          <FilterDropdown label={distance}       options={DISTANCE_OPTS} value={distance}   onChange={setDistance}  />
          {activeFilters > 0 && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-gray-500 hover:text-red-600 transition-colors"
            >
              <X className="h-3 w-3" /> Clear all
            </button>
          )}
          <div className="ml-auto flex items-center gap-1 relative">
            <button
              onClick={() => setFilterOpen(o => !o)}
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowUpDown className="h-3.5 w-3.5" /> Sort by
              {sortBy !== SORT_OPTS[0] && (
                <span className="text-blue-600">: {sortBy}</span>
              )}
            </button>
            {filterOpen && (
              <div className="absolute top-full right-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl py-1 min-w-[140px]">
                {SORT_OPTS.map(opt => (
                  <button
                    key={opt}
                    onClick={() => { setSortBy(opt); setFilterOpen(false); }}
                    className={clsx(
                      "w-full text-left px-3 py-2 text-xs font-medium",
                      opt === sortBy ? "bg-blue-50 text-blue-700 font-bold" : "text-gray-700 hover:bg-gray-50"
                    )}
                  >{opt}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Info bar ────────────────────────────────────────────────────── */}
      <div className="bg-blue-50 border-b border-blue-100 px-6 py-2 flex items-center gap-2 flex-shrink-0">
        <Info className="h-4 w-4 text-blue-500 flex-shrink-0" />
        <p className="text-[11px] text-blue-700">
          Your ATS match rate may be different. JobAI uses AI for smarter matching.
          Use <span className="font-bold">Scan</span> to spot missing keywords and improve your ATS match rate.
        </p>
      </div>

      {/* ── Main two-column layout ──────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT — Job list (40%) */}
        <div className="w-[40%] flex-shrink-0 border-r border-gray-200 flex flex-col overflow-hidden bg-white">
          {/* Sort label */}
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-1.5">
            <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-xs font-semibold text-gray-600">{sortBy}</span>
            {ranking && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full ml-1">
                <Sparkles className="h-2.5 w-2.5 animate-pulse" /> AI ranking…
              </span>
            )}
            <span className="ml-auto text-[11px] text-gray-400">{filtered.length} jobs</span>
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto">
            {searching ? (
              Array.from({ length: 5 }).map((_, i) => <JobCardSkeleton key={i} />)
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <Briefcase className="h-10 w-10 text-gray-200 mb-3" />
                <p className="text-sm font-semibold text-gray-500">No jobs match your filters</p>
                <button onClick={clearFilters} className="mt-2 text-xs text-blue-600 hover:underline">Clear filters</button>
              </div>
            ) : (
              <>
                {filtered.map(job => (
                  <JobCard
                    key={job.id}
                    job={job}
                    selected={selectedJob?.id === job.id}
                    onSelect={() => setSelectedJob(job)}
                    onSave={() => handleSave(job)}
                    onScan={() => handleScan(job)}
                    saving={savingId === job.id}
                  />
                ))}
                {/* Infinite scroll sentinel */}
                {hasMore && (
                  <div ref={sentinelRef} className="py-4 flex justify-center">
                    <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* RIGHT — Job detail (60%) */}
        <div className="flex-1 overflow-hidden p-4 bg-gray-50">
          {!selectedJob ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <Briefcase className="h-12 w-12 text-gray-200 mb-4" />
              <p className="text-sm font-semibold text-gray-500">Select a job to see details</p>
            </div>
          ) : (
            <JobDetail
              job={selectedJob}
              onSave={() => handleSave(selectedJob)}
              onScan={() => handleScan(selectedJob)}
              saving={savingId === selectedJob.id}
            />
          )}
        </div>
      </div>

      {/* ── Bottom notice bar ───────────────────────────────────────────── */}
      <div className="bg-white border-t border-gray-100 px-6 py-2 flex-shrink-0">
        <p className="text-[10px] text-gray-400 text-center">
          Your ATS match rate may be different from the score shown. Results are based on keyword analysis and may vary by ATS system.
        </p>
      </div>
    </div>
  );
}
