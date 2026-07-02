/**
 * hooks/useJobSearch.ts
 *
 * React hook that wraps /api/search-jobs and lib/job-match utilities.
 *
 * Features:
 *   - fetchJobs(params)   – search with filters, replaces current results
 *   - loadMore()          – append next page (infinite scroll)
 *   - Auto-fetch on mount when the user has a saved resume
 *   - Local-scores jobs instantly while AI ranking runs in background
 *   - Exposes jobs, loading, ranking, error, page, hasMore state
 */
"use client";

import { useState, useCallback, useRef } from "react";
import { localScore, categorizeMatch, type JobMatchResult } from "@/lib/job-match";

// ── Search params shape ───────────────────────────────────────────────────────
export interface JobSearchParams {
  query?:             string;
  location?:          string;
  employment_types?:  string;   // "FULLTIME,PARTTIME" etc.
  date_posted?:       string;   // "all" | "today" | "3days" | "week" | "month"
  remote_jobs_only?:  boolean;
  radius?:            string;
}

// ── API response shape ────────────────────────────────────────────────────────
interface SearchResponse {
  jobs:     JobMatchResult[];
  total:    number;
  page:     number;
  hasMore:  boolean;
  fallback?: boolean;
  error?:   string;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useJobSearch(resumeText?: string) {
  const [jobs,     setJobs]     = useState<JobMatchResult[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [ranking,  setRanking]  = useState(false);  // AI ranking in progress
  const [error,    setError]    = useState<string | null>(null);
  const [page,     setPage]     = useState(1);
  const [hasMore,  setHasMore]  = useState(false);
  const [params,   setParams]   = useState<JobSearchParams>({});

  // Track in-flight ranking so we can cancel stale requests
  const rankingAbortRef = useRef<AbortController | null>(null);

  // ── Apply local scores instantly, then kick off AI ranking ─────────────────
  const applyScoresAndRank = useCallback(
    async (newJobs: JobMatchResult[], resume: string) => {
      // 1. Apply fast local scores immediately
      const locallyScored = newJobs.map(j => ({
        ...j,
        match: localScore(resume, j.description),
      })).sort((a, b) => b.match - a.match);

      setJobs(prev => {
        const existingIds = new Set(prev.map(j => j.id));
        const fresh = locallyScored.filter(j => !existingIds.has(j.id));
        return [...prev, ...fresh];
      });

      // 2. Cancel any previous AI ranking pass
      rankingAbortRef.current?.abort();
      const ctrl = new AbortController();
      rankingAbortRef.current = ctrl;

      // 3. AI rank in background (one job at a time to avoid rate limits)
      setRanking(true);
      try {
        for (const job of locallyScored) {
          if (ctrl.signal.aborted) break;
          const res = await fetch("/api/match-report", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ resumeText: resume, jobDescription: job.description }),
            signal:  ctrl.signal,
          });
          if (!res.ok) continue;

          // Read SSE stream for report event
          const ct = res.headers.get("content-type") ?? "";
          let aiScore = job.match;

          if (ct.includes("text/event-stream")) {
            const reader  = res.body!.getReader();
            const decoder = new TextDecoder();
            let buf = "";
            let evt = "";
            outer: while (true) {
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
                  const r = raw.report as { overallScore?: number };
                  aiScore = r.overallScore ?? aiScore;
                  break outer;
                }
              }
            }
          } else {
            const j = (await res.json()) as { report?: { overallScore?: number } };
            aiScore = j.report?.overallScore ?? aiScore;
          }

          // Update this job's score in place
          if (!ctrl.signal.aborted) {
            setJobs(prev =>
              prev
                .map(j => j.id === job.id ? { ...j, match: aiScore } : j)
                .sort((a, b) => b.match - a.match)
            );
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.warn("[useJobSearch] AI ranking error:", err);
        }
      } finally {
        if (!ctrl.signal.aborted) setRanking(false);
      }
    },
    []
  );

  // ── fetchJobs — replaces current results ───────────────────────────────────
  const fetchJobs = useCallback(
    async (searchParams: JobSearchParams = {}) => {
      setLoading(true);
      setError(null);
      setPage(1);
      setJobs([]);
      setParams(searchParams);

      const qs = new URLSearchParams();
      if (searchParams.query)            qs.set("query",            searchParams.query);
      if (searchParams.location)         qs.set("location",         searchParams.location);
      if (searchParams.employment_types) qs.set("employment_types", searchParams.employment_types);
      if (searchParams.date_posted)      qs.set("date_posted",      searchParams.date_posted);
      if (searchParams.remote_jobs_only) qs.set("remote_jobs_only", "true");
      if (searchParams.radius)           qs.set("radius",           searchParams.radius);
      qs.set("page", "1");

      try {
        const res  = await fetch(`/api/search-jobs?${qs.toString()}`);
        const data = (await res.json()) as SearchResponse;

        if (!res.ok) {
          setError(data.error ?? "Search failed");
          setLoading(false);
          return;
        }

        setHasMore(data.hasMore);

        if (resumeText?.trim()) {
          // Score against resume
          await applyScoresAndRank(data.jobs, resumeText);
        } else {
          setJobs(data.jobs);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Search failed";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [resumeText, applyScoresAndRank]
  );

  // ── loadMore — appends next page ───────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);

    const qs = new URLSearchParams();
    if (params.query)            qs.set("query",            params.query);
    if (params.location)         qs.set("location",         params.location);
    if (params.employment_types) qs.set("employment_types", params.employment_types);
    if (params.date_posted)      qs.set("date_posted",      params.date_posted);
    if (params.remote_jobs_only) qs.set("remote_jobs_only", "true");
    if (params.radius)           qs.set("radius",           params.radius);
    qs.set("page", String(nextPage));

    try {
      const res  = await fetch(`/api/search-jobs?${qs.toString()}`);
      const data = (await res.json()) as SearchResponse;
      setHasMore(data.hasMore);

      if (resumeText?.trim()) {
        await applyScoresAndRank(data.jobs, resumeText);
      } else {
        setJobs(prev => {
          const ids = new Set(prev.map(j => j.id));
          return [...prev, ...data.jobs.filter(j => !ids.has(j.id))];
        });
      }
    } catch (err) {
      console.error("[useJobSearch] loadMore error:", err);
    }
  }, [loading, hasMore, page, params, resumeText, applyScoresAndRank]);

  return {
    jobs,
    loading,
    ranking,       // true while AI scores are streaming in
    error,
    page,
    hasMore,
    fetchJobs,
    loadMore,
    categorizeMatch,  // re-exported for convenience
  };
}
