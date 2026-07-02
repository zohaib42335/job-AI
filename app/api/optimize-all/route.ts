/**
 * POST /api/optimize-all
 *
 * Body: { resumeData: ResumeFormData & { skills: string[] }, jobDescription }
 *
 * Optimizes the entire resume section-by-section via streaming.
 * The client sees real-time progress as each section completes.
 *
 * SSE named events:
 *   event: status   — { message: string, section: string, progress: number }
 *   event: section  — { section: string, optimizedContent: string, addedKeywords: string[] }
 *   event: complete — { optimizedResume: OptimizedResume }
 *   event: error    — { error: string }
 *   event: done     — { message: string }
 *
 * Types reused:
 *   - ResumeFormData  from @/app/resume-builder/types
 *   - ExperienceEntry from @/app/resume-builder/types
 * (imported at type level only — these are client-side types; API routes
 *  use them purely for structural validation, not for Firebase calls)
 */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type {
  ResumeFormData,
  ExperienceEntry,
} from "@/app/resume-builder/types";

export const runtime = "nodejs";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_MODEL    = "llama-3.3-70b-versatile";

// ── SSE helper ────────────────────────────────────────────────────────────────
function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ── Optimized resume shape ────────────────────────────────────────────────────
interface SectionResult {
  optimizedContent: string;
  addedKeywords: string[];
}

interface OptimizedResume {
  summary:    SectionResult;
  experience: SectionResult[];
  skills:     SectionResult;
  addedKeywordsTotal: string[];
}

// ── Call Groq for a single section (non-streaming sub-call) ───────────────────
async function optimizeSection(
  openai: OpenAI,
  systemPrompt: string,
  userContent:  string
): Promise<{ optimizedContent: string; addedKeywords: string[] }> {
  const resp = await openai.chat.completions.create({
    model:           GROQ_MODEL,
    stream:          false,
    temperature:     0.35,
    max_tokens:      1024,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userContent  },
    ],
  });

  const raw = resp.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as {
    optimizedContent?: string;
    addedKeywords?:    string[];
  };

  return {
    optimizedContent: parsed.optimizedContent ?? "",
    addedKeywords:    Array.isArray(parsed.addedKeywords) ? parsed.addedKeywords : [],
  };
}

// ── System prompts (inline — each section has its own tight spec) ─────────────
const SUMMARY_SYS = `You are an expert resume writer and ATS specialist.
Rewrite the professional summary to perfectly match the job description.
Return ONLY valid JSON: { "optimizedContent": "<2-4 sentences, max 80 words>", "addedKeywords": ["<keyword>"] }
Rules: mirror exact JD keywords, start with action phrase, include job title, quantify impact, keep authentic voice.`;

const EXPERIENCE_SYS = `You are an expert resume writer and ATS specialist.
Rewrite the experience bullets to match the job description.
Return ONLY valid JSON: { "optimizedContent": "<bullets, one per line starting with •>", "addedKeywords": ["<keyword>"] }
Rules: strong action verbs, specific metrics, mirror JD keywords, no passive voice, 4-6 bullets, ATS plain text.`;

const SKILLS_SYS = `You are an expert resume writer and ATS specialist.
Rewrite the skills section to match the job description.
Return ONLY valid JSON: { "optimizedContent": "<comma-separated skills>", "addedKeywords": ["<skill added>"] }
Rules: JD-matching skills first, add clearly required missing skills, remove irrelevant ones, plain comma list.`;

// ── POST handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let resumeData: (ResumeFormData & { skills?: string[] }) | null = null;
  let jobDescription = "";

  try {
    const body = (await req.json()) as {
      resumeData?: ResumeFormData & { skills?: string[] };
      jobDescription?: string;
    };
    resumeData     = body.resumeData ?? null;
    jobDescription = (body.jobDescription ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!resumeData)     return NextResponse.json({ error: "resumeData is required."    }, { status: 400 });
  if (!jobDescription) return NextResponse.json({ error: "jobDescription is required." }, { status: 400 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GROQ_API_KEY is not configured." }, { status: 500 });

  const openai  = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });
  const encoder = new TextEncoder();

  // Determine sections to process
  const experiences: ExperienceEntry[] = (resumeData.experience ?? []).filter(
    e => e.jobTitle || e.employer || e.description
  );
  const skills       = resumeData.skills ?? [];
  const totalSections = 1 + experiences.length + 1; // summary + experiences + skills
  let   processed    = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const enq = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sse(event, data)));

      try {
        const optimized: OptimizedResume = {
          summary:    { optimizedContent: "", addedKeywords: [] },
          experience: [],
          skills:     { optimizedContent: "", addedKeywords: [] },
          addedKeywordsTotal: [],
        };

        // ── 1. Summary ──────────────────────────────────────────────────────
        if (resumeData!.summary?.trim()) {
          enq("status", {
            message:  "Optimizing professional summary…",
            section:  "summary",
            progress: Math.round((processed / totalSections) * 100),
          });

          const result = await optimizeSection(
            openai,
            SUMMARY_SYS,
            `SUMMARY:\n${resumeData!.summary}\n\nJOB DESCRIPTION:\n${jobDescription}`
          );

          optimized.summary = result;
          optimized.addedKeywordsTotal.push(...result.addedKeywords);
          processed++;

          enq("section", { section: "summary", ...result });
          enq("status", {
            message:  "Summary optimized ✓",
            section:  "summary",
            progress: Math.round((processed / totalSections) * 100),
          });
        } else {
          processed++;
        }

        // ── 2. Experience entries ───────────────────────────────────────────
        for (let i = 0; i < experiences.length; i++) {
          const exp = experiences[i];
          const sectionId = `experience_${i}`;

          enq("status", {
            message:  `Optimizing experience: ${exp.jobTitle} at ${exp.employer}…`,
            section:  sectionId,
            progress: Math.round((processed / totalSections) * 100),
          });

          const result = await optimizeSection(
            openai,
            EXPERIENCE_SYS,
            [
              `ROLE: ${exp.jobTitle} at ${exp.employer}`,
              exp.startDate ? `DATES: ${exp.startDate} – ${exp.currentlyWorking ? "Present" : exp.endDate}` : "",
              `\nBULLETS:\n${exp.description}`,
              `\nJOB DESCRIPTION:\n${jobDescription}`,
            ].filter(Boolean).join("\n")
          );

          optimized.experience.push(result);
          optimized.addedKeywordsTotal.push(...result.addedKeywords);
          processed++;

          enq("section", { section: sectionId, index: i, ...result });
          enq("status", {
            message:  `Experience ${i + 1}/${experiences.length} optimized ✓`,
            section:  sectionId,
            progress: Math.round((processed / totalSections) * 100),
          });
        }

        // ── 3. Skills ───────────────────────────────────────────────────────
        if (skills.length > 0) {
          enq("status", {
            message:  "Optimizing skills section…",
            section:  "skills",
            progress: Math.round((processed / totalSections) * 100),
          });

          const result = await optimizeSection(
            openai,
            SKILLS_SYS,
            `CURRENT SKILLS:\n${skills.join(", ")}\n\nJOB DESCRIPTION:\n${jobDescription}`
          );

          optimized.skills = result;
          optimized.addedKeywordsTotal.push(...result.addedKeywords);
          processed++;

          enq("section", { section: "skills", ...result });
        } else {
          processed++;
        }

        // Deduplicate addedKeywords across sections
        optimized.addedKeywordsTotal = Array.from(new Set(optimized.addedKeywordsTotal));

        enq("complete", { optimizedResume: optimized });
        enq("done",     { message: `All ${processed} sections optimized successfully.` });

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[optimize-all]", msg);
        enq("error", { error: `Optimization failed: ${msg}` });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
