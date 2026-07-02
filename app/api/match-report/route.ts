import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

// Groq is OpenAI-API-compatible — we reuse the OpenAI SDK pointed at Groq's endpoint.
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_MODEL    = "llama-3.3-70b-versatile"; // fast, free-tier friendly

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface MatchReport {
  overallScore: number;
  atsCompatibility: { score: number; issues: string[] };
  hardSkills: { matched: string[]; missing: string[]; score: number };
  softSkills: { matched: string[]; missing: string[]; score: number };
  searchability: {
    hasEmail: boolean;
    hasPhone: boolean;
    hasAddress: boolean;
    hasSummary: boolean;
    hasSectionHeadings: boolean;
    score: number;
    issues: string[];
  };
  formatting: {
    usesBullets: boolean;
    consistentDates: boolean;
    noTables: boolean;
    score: number;
    issues: string[];
  };
  recruiterTips: string[];
  missingKeywords: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert ATS (Applicant Tracking System) analyzer. Analyze the resume against the job description and return a detailed JSON report.

You MUST respond with ONLY a valid JSON object — no markdown fences, no extra text:

{
  "overallScore": <integer 0-100>,
  "atsCompatibility": {
    "score": <integer 0-100>,
    "issues": [<string>, ...]
  },
  "hardSkills": {
    "matched": [<string>, ...],
    "missing": [<string>, ...],
    "score": <integer 0-100>
  },
  "softSkills": {
    "matched": [<string>, ...],
    "missing": [<string>, ...],
    "score": <integer 0-100>
  },
  "searchability": {
    "hasEmail": <boolean>,
    "hasPhone": <boolean>,
    "hasAddress": <boolean>,
    "hasSummary": <boolean>,
    "hasSectionHeadings": <boolean>,
    "score": <integer 0-100>,
    "issues": [<string>, ...]
  },
  "formatting": {
    "usesBullets": <boolean>,
    "consistentDates": <boolean>,
    "noTables": <boolean>,
    "score": <integer 0-100>,
    "issues": [<string>, ...]
  },
  "recruiterTips": [<string>, ...],
  "missingKeywords": [<string>, ...]
}

Scoring rules:
- overallScore = weighted average: hardSkills×35% + searchability×25% + softSkills×15% + formatting×15% + atsCompatibility×10%
- atsCompatibility: penalise non-standard characters, column layouts, missing contact info
- hardSkills: technical skills explicitly listed in the job description
- softSkills: interpersonal/behavioural skills from the job description
- searchability: detect contact info and structural sections in the resume text
- formatting: assess bullet usage, date format consistency, table absence
- recruiterTips: 3-5 specific, actionable suggestions
- missingKeywords: words/phrases in the job description that are absent from the resume (max 10)`;

// ─────────────────────────────────────────────────────────────────────────────
// SSE helper
// ─────────────────────────────────────────────────────────────────────────────

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Basic shape validation
// ─────────────────────────────────────────────────────────────────────────────

function isValidReport(obj: unknown): obj is MatchReport {
  if (typeof obj !== "object" || obj === null) return false;
  const r = obj as Record<string, unknown>;
  return (
    typeof r.overallScore === "number" &&
    typeof r.atsCompatibility === "object" &&
    typeof r.hardSkills === "object" &&
    typeof r.softSkills === "object" &&
    typeof r.searchability === "object" &&
    typeof r.formatting === "object" &&
    Array.isArray(r.recruiterTips) &&
    Array.isArray(r.missingKeywords)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/match-report
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── Parse body ─────────────────────────────────────────────────────────────
  let resumeText: string;
  let jobDescription: string;

  try {
    const body = (await request.json()) as {
      resumeText?: string;
      jobDescription?: string;
    };
    resumeText = (body.resumeText ?? "").trim();
    jobDescription = (body.jobDescription ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!resumeText) {
    return NextResponse.json(
      { error: "resumeText is required and must not be empty." },
      { status: 400 }
    );
  }
  if (!jobDescription) {
    return NextResponse.json(
      { error: "jobDescription is required and must not be empty." },
      { status: 400 }
    );
  }

  // ── Resolve Groq client (fall back to local analysis if key missing) ────────
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    // Graceful degradation: run local keyword analysis
    const fallbackReport = buildLocalReport(resumeText, jobDescription);
    return NextResponse.json(
      { success: true, report: fallbackReport, fallback: true },
      { status: 200 }
    );
  }

  const openai = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });

  // ── Streaming SSE response ─────────────────────────────────────────────────
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sseEvent(event, data)));

      try {
        enqueue("status", { message: "Analyzing resume against job description…" });

        const completion = await openai.chat.completions.create({
          model: GROQ_MODEL,
          stream: true,
          temperature: 0.2,
          max_tokens: 2048,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `RESUME:\n${resumeText}\n\n---\n\nJOB DESCRIPTION:\n${jobDescription}`,
            },
          ],
        });

        let accumulated = "";

        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (delta) {
            accumulated += delta;
            // Forward each token — lets UI show a live progress indicator
            enqueue("chunk", { delta });
          }
        }

        // Parse & validate final JSON
        let report: MatchReport;
        try {
          const parsed = JSON.parse(accumulated) as unknown;
          if (!isValidReport(parsed)) {
            throw new Error("Unexpected JSON shape returned by GPT-4.");
          }
          report = parsed;
        } catch (parseErr) {
          const msg =
            parseErr instanceof Error ? parseErr.message : String(parseErr);
          enqueue("error", { error: `Failed to parse AI response: ${msg}` });
          controller.close();
          return;
        }

        enqueue("report", { report });
        enqueue("done", { message: "Analysis complete." });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[match-report]", message);
        enqueue("error", { error: `Groq request failed: ${message}` });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering for true streaming
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Local keyword fallback (no OpenAI required)
// ─────────────────────────────────────────────────────────────────────────────

const HARD_SKILLS = [
  "javascript","typescript","react","vue","angular","next.js","node.js","express",
  "python","django","flask","fastapi","java","spring","kotlin","c++","c#",".net",
  "go","rust","ruby","rails","php","laravel","swift","sql","mysql","postgresql",
  "mongodb","redis","elasticsearch","dynamodb","aws","azure","gcp","docker",
  "kubernetes","terraform","git","graphql","rest api","machine learning",
  "deep learning","tensorflow","pytorch","scikit-learn","pandas","numpy",
  "tableau","power bi","excel","salesforce","jira","figma","linux","bash","ci/cd",
];

const SOFT_SKILLS = [
  "communication","leadership","teamwork","problem solving","critical thinking",
  "time management","adaptability","creativity","collaboration","negotiation",
  "mentoring","project management","stakeholder management","analytical thinking",
  "attention to detail","customer service","decision making","strategic thinking",
  "agile","scrum","conflict resolution","initiative",
];

function buildLocalReport(resumeText: string, jobDescription: string): MatchReport {
  const rl = resumeText.toLowerCase();
  const jd = jobDescription.toLowerCase();

  const jdHard      = HARD_SKILLS.filter((s) => jd.includes(s));
  const jdSoft      = SOFT_SKILLS.filter((s) => jd.includes(s));
  const hardMatched = jdHard.filter((s) => rl.includes(s));
  const hardMissing = jdHard.filter((s) => !rl.includes(s));
  const softMatched = jdSoft.filter((s) => rl.includes(s));
  const softMissing = jdSoft.filter((s) => !rl.includes(s));

  const hasEmail           = /[\w._%+-]+@[\w.-]+\.[a-zA-Z]{2,}/.test(resumeText);
  const hasPhone           = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(resumeText);
  const hasAddress         = /\b[A-Z][a-zA-Z\s]+,\s*[A-Z]{2}\b/.test(resumeText);
  const hasSummary         = /\b(summary|objective|profile|about)\b/i.test(resumeText);
  const hasSectionHeadings = /\b(experience|education|skills|work history)\b/i.test(resumeText);
  const usesBullets        = /[•\-\*◦·▸]/.test(resumeText);
  const consistentDates    = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4}/i.test(resumeText);
  const noTables           = !resumeText.includes("\t\t");

  const searchabilityItems = [hasEmail, hasPhone, hasSummary, hasSectionHeadings];
  const searchabilityScore = Math.round(
    (searchabilityItems.filter(Boolean).length / searchabilityItems.length) * 100
  );
  const hardScore = jdHard.length > 0 ? Math.round((hardMatched.length / jdHard.length) * 100) : 80;
  const softScore = jdSoft.length > 0 ? Math.round((softMatched.length / jdSoft.length) * 100) : 75;
  const fmtScore  = Math.round(([usesBullets, consistentDates, noTables].filter(Boolean).length / 3) * 100);
  const atsScore  = Math.round(([!/<[^>]+>/.test(resumeText), noTables].filter(Boolean).length / 2) * 100);
  const overall   = Math.round(
    hardScore * 0.35 + searchabilityScore * 0.25 + softScore * 0.15 + fmtScore * 0.15 + atsScore * 0.1
  );

  const searchabilityIssues: string[] = [];
  if (!hasEmail)           searchabilityIssues.push("No email address detected");
  if (!hasPhone)           searchabilityIssues.push("No phone number detected");
  if (!hasSummary)         searchabilityIssues.push("Missing professional summary section");
  if (!hasSectionHeadings) searchabilityIssues.push("Standard section headings not detected");

  const formattingIssues: string[] = [];
  if (!usesBullets)     formattingIssues.push("Use bullet points for experience descriptions");
  if (!consistentDates) formattingIssues.push("Use a consistent date format (e.g. Jan 2022 – Mar 2024)");
  if (!noTables)        formattingIssues.push("Avoid tables — many ATS systems cannot parse them");

  return {
    overallScore:     overall,
    atsCompatibility: { score: atsScore, issues: [...searchabilityIssues, ...formattingIssues].slice(0, 3) },
    hardSkills:       { matched: hardMatched, missing: hardMissing, score: hardScore },
    softSkills:       { matched: softMatched, missing: softMissing, score: softScore },
    searchability:    { hasEmail, hasPhone, hasAddress, hasSummary, hasSectionHeadings, score: searchabilityScore, issues: searchabilityIssues },
    formatting:       { usesBullets, consistentDates, noTables, score: fmtScore, issues: formattingIssues },
    recruiterTips: [
      hardMissing.length > 0
        ? `Add missing skills to your resume: ${hardMissing.slice(0, 3).join(", ")}`
        : "Your technical skills align well with this role",
      "Quantify achievements with specific numbers and percentages",
      "Keep your resume to 1–2 pages for optimal ATS compatibility",
      !hasSummary
        ? "Add a professional summary tailored to this job description"
        : "Tailor your summary to mirror language from the job description",
    ],
    missingKeywords: [...hardMissing, ...softMissing].slice(0, 10),
  };
}
