/**
 * GET /api/search-jobs
 *
 * Query params:
 *   query            – job title / keyword (default: "")
 *   location         – city / country (default: "")
 *   page             – page number, 1-indexed (default: 1)
 *   employment_types – comma-separated: FULLTIME,PARTTIME,CONTRACTOR,INTERN
 *   date_posted      – all | today | 3days | week | month (default: all)
 *   remote_jobs_only – true | false (default: false)
 *   radius           – km radius (default: 50)
 *
 * Response:
 *   { jobs: Job[], total: number, page: number, hasMore: boolean }
 *
 * Types:
 *   Job shape matches the interface in app/job-match/page.tsx exactly.
 *   No redefinition — both map to the same structural shape.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// ── Job shape (matches app/job-match/page.tsx Job interface) ─────────────────
export interface MappedJob {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  type: string;
  posted: string;
  match: number;          // 0 until ranked by lib/job-match.ts
  description: string;
  tags: string[];
  logo: string;
  remote: boolean;
  applyUrl?: string;
  saved?: boolean;
}

// ── JSearch raw response shape (partial) ─────────────────────────────────────
interface JSearchJob {
  job_id:            string;
  job_title:         string;
  employer_name:     string;
  job_city?:         string;
  job_state?:        string;
  job_country?:      string;
  job_employment_type?: string;
  job_posted_at_datetime_utc?: string;
  job_description?:  string;
  job_required_skills?: string[];
  job_min_salary?:   number;
  job_max_salary?:   number;
  job_salary_currency?: string;
  job_is_remote?:    boolean;
  job_apply_link?:   string;
  employer_logo?:    string;
}

interface JSearchResponse {
  status: string;
  data:   JSearchJob[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function postedLabel(isoDate?: string): string {
  if (!isoDate) return "recently";
  const diff = Date.now() - new Date(isoDate).getTime();
  const hrs   = Math.floor(diff / 3_600_000);
  if (hrs < 1)   return "Just now";
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "1 day ago";
  if (days < 7)  return `${days} days ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function salaryLabel(job: JSearchJob): string {
  if (!job.job_min_salary && !job.job_max_salary) return "";
  const cur  = job.job_salary_currency ?? "USD";
  const sym  = cur === "USD" ? "$" : cur === "GBP" ? "£" : cur === "EUR" ? "€" : cur + " ";
  const fmt  = (n: number) => n >= 1000 ? `${sym}${Math.round(n / 1000)}k` : `${sym}${n}`;
  if (job.job_min_salary && job.job_max_salary)
    return `${fmt(job.job_min_salary)} – ${fmt(job.job_max_salary)}`;
  return fmt((job.job_min_salary ?? job.job_max_salary)!);
}

function employmentLabel(raw?: string): string {
  const map: Record<string, string> = {
    FULLTIME:   "Full-time",
    PARTTIME:   "Part-time",
    CONTRACTOR: "Contract",
    INTERN:     "Internship",
  };
  return raw ? (map[raw] ?? raw) : "Full-time";
}

function mapJob(j: JSearchJob): MappedJob {
  const locationParts = [j.job_city, j.job_state, j.job_country].filter(Boolean);
  return {
    id:          j.job_id,
    title:       j.job_title,
    company:     j.employer_name,
    location:    locationParts.join(", ") || "Remote",
    salary:      salaryLabel(j),
    type:        employmentLabel(j.job_employment_type),
    posted:      postedLabel(j.job_posted_at_datetime_utc),
    match:       0,  // scored later by lib/job-match.ts
    description: j.job_description ?? "",
    tags:        (j.job_required_skills ?? []).slice(0, 8),
    logo:        (j.employer_name?.[0] ?? "?").toUpperCase(),
    remote:      j.job_is_remote ?? false,
    applyUrl:    j.job_apply_link,
    saved:       false,
  };
}

// ── Fallback sample data (used when RAPIDAPI_KEY is absent) ──────────────────
const FALLBACK_JOBS: MappedJob[] = [
  {
    id: "f1", title: "Senior Product Manager", company: "OpenAI",
    location: "San Francisco, CA", salary: "$180k – $240k", type: "Full-time",
    posted: "2 days ago", match: 0,
    description: "Drive ChatGPT product strategy for enterprise customers. Own roadmap, work cross-functionally with engineering and design, and ship features at scale.",
    tags: ["Product Strategy", "B2B SaaS", "AI", "Roadmapping"], logo: "O", remote: true, applyUrl: "#",
  },
  {
    id: "f2", title: "Sr. Product Manager, Media Services", company: "Adobe",
    location: "New York, NY", salary: "$160k – $210k", type: "Full-time",
    posted: "1 day ago", match: 0,
    description: "Own the Media Services roadmap. Collaborate with engineering, design, and marketing to build creative cloud features for millions of users.",
    tags: ["Product Management", "Media", "Cloud", "SaaS"], logo: "A", remote: false, applyUrl: "#",
  },
  {
    id: "f3", title: "Product Manager — Growth", company: "Figma",
    location: "San Francisco, CA", salary: "$175k – $230k", type: "Full-time",
    posted: "3 days ago", match: 0,
    description: "Run experiments, analyse funnels, and partner with engineering and data science to drive Figma's growth metrics.",
    tags: ["Growth", "Analytics", "A/B Testing", "PLG"], logo: "F", remote: true, applyUrl: "#",
  },
  {
    id: "f4", title: "Product Manager II — Platform", company: "Stripe",
    location: "Remote", salary: "$155k – $205k", type: "Full-time",
    posted: "4 days ago", match: 0,
    description: "Define APIs and developer tooling used by hundreds of thousands of developers building financial products.",
    tags: ["Platform", "API", "Developer Tools", "Payments"], logo: "S", remote: true, applyUrl: "#",
  },
  {
    id: "f5", title: "Associate Product Manager — AI", company: "Notion",
    location: "San Francisco, CA", salary: "$130k – $170k", type: "Full-time",
    posted: "5 days ago", match: 0,
    description: "Help build AI-powered features into the Notion product. Partner with engineering and design to ship delightful user experiences.",
    tags: ["AI", "Productivity", "APM", "SaaS"], logo: "N", remote: false, applyUrl: "#",
  },
];

// ── GET handler ───────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const queryParam      = searchParams.get("query")            ?? "";
  const location        = searchParams.get("location")         ?? "";
  const page            = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const employmentTypes = searchParams.get("employment_types") ?? "";
  const datePosted      = searchParams.get("date_posted")      ?? "all";
  const remoteOnly      = searchParams.get("remote_jobs_only") === "true";
  const radius          = searchParams.get("radius")           ?? "50";

  const apiKey  = process.env.RAPIDAPI_KEY;
  const apiHost = process.env.RAPIDAPI_HOST ?? "jsearch.p.rapidapi.com";

  // ── Fallback when key is absent ───────────────────────────────────────────
  if (!apiKey) {
    const filtered = FALLBACK_JOBS.filter(j => {
      if (remoteOnly && !j.remote) return false;
      if (queryParam && !j.title.toLowerCase().includes(queryParam.toLowerCase()) &&
          !j.company.toLowerCase().includes(queryParam.toLowerCase())) return false;
      if (location && !j.location.toLowerCase().includes(location.toLowerCase())) return false;
      return true;
    });
    return NextResponse.json({
      jobs:    filtered,
      total:   filtered.length,
      page:    1,
      hasMore: false,
      fallback: true,
    });
  }

  // ── Build JSearch query string ─────────────────────────────────────────────
  const searchQuery = [queryParam, location].filter(Boolean).join(" in ") || "software engineer";
  const params = new URLSearchParams({
    query:          searchQuery,
    page:           String(page),
    num_pages:      "1",
    date_posted:    datePosted,
    remote_jobs_only: remoteOnly ? "true" : "false",
    radius,
  });
  if (employmentTypes) params.set("employment_types", employmentTypes);

  const url = `https://${apiHost}/search?${params.toString()}`;

  try {
    const res = await fetch(url, {
      headers: {
        "X-RapidAPI-Key":  apiKey,
        "X-RapidAPI-Host": apiHost,
      },
      // 8-second timeout
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      throw new Error(`JSearch returned HTTP ${res.status}`);
    }

    const json = (await res.json()) as JSearchResponse;

    if (!Array.isArray(json.data)) {
      return NextResponse.json({ error: "Unexpected JSearch response shape." }, { status: 502 });
    }

    const jobs: MappedJob[] = json.data.map(mapJob);

    return NextResponse.json({
      jobs,
      total:   jobs.length,
      page,
      hasMore: jobs.length === 10,  // JSearch returns 10 per page
      fallback: false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[search-jobs]", msg);
    // Return fallback so the UI doesn't break
    return NextResponse.json({
      jobs:     FALLBACK_JOBS,
      total:    FALLBACK_JOBS.length,
      page:     1,
      hasMore:  false,
      fallback: true,
      error:    msg,
    });
  }
}
