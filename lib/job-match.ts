/**
 * lib/job-match.ts
 *
 * Client-side utilities for AI job matching.
 *
 * Uses the existing /api/match-report SSE endpoint for scoring — no scoring
 * logic is duplicated here. The endpoint expects { resumeText, jobDescription }
 * and emits named SSE events; we read the "report" event for overallScore.
 *
 * Exports:
 *   scoreJobMatch(resumeText, jobDescription) → Promise<number>   (0-100)
 *   rankJobs(jobs, resumeText)               → Promise<JobMatchResult[]>
 *   categorizeMatch(score)                   → "TOP MATCH" | "GOOD MATCH" | "FAIR MATCH"
 */

// ── Minimal Job shape (structurally identical to Job in app/job-match/page.tsx) ─
// We can't import from a page file, so we define the minimum required fields here.
export interface JobMatchResult {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  type: string;
  posted: string;
  match: number;      // overallScore from /api/match-report
  description: string;
  tags: string[];
  logo: string;
  remote: boolean;
  applyUrl?: string;
  saved?: boolean;
}

export type MatchCategory = "TOP MATCH" | "GOOD MATCH" | "FAIR MATCH";

// ── categorizeMatch ───────────────────────────────────────────────────────────

/**
 * Converts a numeric score (0-100) into a human-readable match category.
 * Thresholds match the badge labels in app/job-match/page.tsx.
 */
export function categorizeMatch(score: number): MatchCategory {
  if (score >= 80) return "TOP MATCH";
  if (score >= 60) return "GOOD MATCH";
  return "FAIR MATCH";
}

// ── SSE reader helper ─────────────────────────────────────────────────────────

/**
 * Reads the /api/match-report SSE stream and resolves with overallScore.
 * Matches the named-event protocol: event: report\ndata: {"report":{...}}
 */
async function readMatchReportStream(res: Response): Promise<number> {
  // Non-streaming JSON fallback
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("text/event-stream")) {
    const j = (await res.json()) as { report?: { overallScore?: number } };
    return j.report?.overallScore ?? 0;
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
      if (evt === "report" && raw.report) {
        const report = raw.report as { overallScore?: number };
        return report.overallScore ?? 0;
      }
    }
  }
  return 0;
}

// ── scoreJobMatch ─────────────────────────────────────────────────────────────

/**
 * Calls the existing /api/match-report endpoint and returns the overallScore.
 * Never throws — returns 0 on any failure so callers can degrade gracefully.
 */
export async function scoreJobMatch(
  resumeText: string,
  jobDescription: string
): Promise<number> {
  if (!resumeText.trim() || !jobDescription.trim()) return 0;
  try {
    const res = await fetch("/api/match-report", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ resumeText, jobDescription }),
    });
    if (!res.ok) return 0;
    return await readMatchReportStream(res);
  } catch {
    return 0;
  }
}

// ── rankJobs ──────────────────────────────────────────────────────────────────

/**
 * Scores all jobs against the provided resume text and returns a sorted copy.
 *
 * Calls /api/match-report for EACH job — for large result sets consider
 * batching or using the local keyword heuristic as a pre-filter.
 *
 * @param jobs        – array of jobs to rank
 * @param resumeText  – full plain-text resume
 * @param onProgress  – optional callback (completedCount, total) for UI progress
 */
export async function rankJobs(
  jobs: JobMatchResult[],
  resumeText: string,
  onProgress?: (done: number, total: number) => void
): Promise<JobMatchResult[]> {
  if (!resumeText.trim() || jobs.length === 0) return jobs;

  const scored = await Promise.all(
    jobs.map(async (job, i) => {
      const score = await scoreJobMatch(resumeText, job.description);
      onProgress?.(i + 1, jobs.length);
      return { ...job, match: score };
    })
  );

  return scored.sort((a, b) => b.match - a.match);
}

// ── Local keyword heuristic (fast, no API call) ───────────────────────────────

/**
 * Lightweight client-side scorer that counts overlapping keywords between
 * the resume and job description. Returns 0-100. Use this for instant
 * UI feedback before the AI score arrives.
 */
export function localScore(resumeText: string, jobDescription: string): number {
  const tokenize = (s: string) =>
    s.toLowerCase().match(/\b[a-z][a-z+#.]{2,}\b/g) ?? [];

  const resumeWords = new Set(tokenize(resumeText));
  const jdWords     = tokenize(jobDescription);

  if (resumeWords.size === 0 || jdWords.length === 0) return 0;

  const uniqueJd  = Array.from(new Set(jdWords));
  const matched   = uniqueJd.filter(w => resumeWords.has(w)).length;
  const raw       = matched / uniqueJd.length;

  // Scale to a realistic 40-95 range so scores don't look artificially low/high
  return Math.round(40 + raw * 55);
}
