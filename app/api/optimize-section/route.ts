/**
 * POST /api/optimize-section
 *
 * Body: { sectionType, originalContent, jobDescription, targetKeywords }
 *
 * Response (SSE named events):
 *   event: status  — progress message
 *   event: chunk   — streaming delta
 *   event: result  — { optimizedContent, addedKeywords, explanation }
 *   event: done
 *   event: error
 *
 * Types imported from:
 *   - @/app/resume-builder/types  (ResumeFormData, ExperienceEntry, …)
 *   - @/lib/resume                (ResumeRecord)
 * Groq is used via the openai SDK (GROQ_API_KEY + custom baseURL).
 */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_MODEL    = "llama-3.3-70b-versatile";

// ── SSE helper ────────────────────────────────────────────────────────────────
function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ── Section-specific system prompts ───────────────────────────────────────────
const PROMPTS: Record<string, string> = {
  summary: `You are an expert resume writer and ATS specialist.
Rewrite the professional summary to perfectly match the job description.
Return ONLY valid JSON (no markdown fences):
{
  "optimizedContent": "<rewritten summary — 2-4 sentences, max 80 words>",
  "addedKeywords": ["<keyword naturally inserted>", ...],
  "explanation": "<one-sentence rationale>"
}
Rules:
- Mirror exact keywords from the job description
- Start with a strong action phrase
- Include the target job title
- Quantify impact where possible
- Maintain the candidate's authentic voice`,

  experience: `You are an expert resume writer and ATS specialist.
Rewrite the experience bullet points to match the job description.
Return ONLY valid JSON (no markdown fences):
{
  "optimizedContent": "<rewritten bullets, one per line, each starting with •>",
  "addedKeywords": ["<keyword naturally inserted>", ...],
  "explanation": "<one-sentence rationale>"
}
Rules:
- Start every bullet with a strong action verb (Led, Built, Reduced, Engineered…)
- Add specific metrics (%, $, headcount, time saved) where plausible
- Mirror exact keywords from the job description naturally
- Remove passive voice entirely
- 4-6 bullets maximum
- Keep ATS-friendly plain text formatting`,

  skills: `You are an expert resume writer and ATS specialist.
Rewrite the skills section to match the job description.
Return ONLY valid JSON (no markdown fences):
{
  "optimizedContent": "<comma-separated skills, most relevant first>",
  "addedKeywords": ["<skill added from JD>", ...],
  "explanation": "<one-sentence rationale>"
}
Rules:
- List skills that appear verbatim in the JD first
- Add clearly required skills from JD that are missing
- Remove skills with zero relevance to the role
- Keep ATS-friendly: plain comma-separated list, no bullets`,

  education: `You are an expert resume writer and ATS specialist.
Rewrite the education entry to highlight relevance to the job description.
Return ONLY valid JSON (no markdown fences):
{
  "optimizedContent": "<rewritten education entry — one or two lines>",
  "addedKeywords": ["<relevant term added>", ...],
  "explanation": "<one-sentence rationale>"
}
Rules:
- Highlight relevant coursework, projects, or honors if they match JD keywords
- Keep degree and institution accurate — do NOT invent credentials
- Plain text, ATS-friendly`,
};

function getPrompt(sectionType: string): string {
  return PROMPTS[sectionType] ?? PROMPTS["experience"];
}

// ── POST handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let sectionType: string;
  let originalContent: string;
  let jobDescription: string;
  let targetKeywords: string[];

  try {
    const body = (await req.json()) as {
      sectionType?: string;
      originalContent?: string;
      jobDescription?: string;
      targetKeywords?: string[];
    };
    sectionType     = (body.sectionType    ?? "experience").trim().toLowerCase();
    originalContent = (body.originalContent ?? "").trim();
    jobDescription  = (body.jobDescription  ?? "").trim();
    targetKeywords  = Array.isArray(body.targetKeywords) ? body.targetKeywords : [];
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!originalContent) return NextResponse.json({ error: "originalContent is required." }, { status: 400 });
  if (!jobDescription)  return NextResponse.json({ error: "jobDescription is required."  }, { status: 400 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GROQ_API_KEY is not configured." }, { status: 500 });

  const openai  = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enq = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sse(event, data)));

      try {
        enq("status", { message: `Optimizing ${sectionType} section…` });

        const userPrompt = [
          `SECTION TYPE: ${sectionType}`,
          targetKeywords.length ? `TARGET KEYWORDS: ${targetKeywords.join(", ")}` : "",
          `\nORIGINAL CONTENT:\n${originalContent}`,
          `\nJOB DESCRIPTION:\n${jobDescription}`,
        ].filter(Boolean).join("\n");

        const completion = await openai.chat.completions.create({
          model:           GROQ_MODEL,
          stream:          true,
          temperature:     0.35,
          max_tokens:      1024,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: getPrompt(sectionType) },
            { role: "user",   content: userPrompt },
          ],
        });

        let accumulated = "";
        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (delta) { accumulated += delta; enq("chunk", { delta }); }
        }

        let parsed: { optimizedContent?: string; addedKeywords?: string[]; explanation?: string };
        try {
          parsed = JSON.parse(accumulated) as typeof parsed;
        } catch {
          enq("error", { error: "Failed to parse AI response as JSON." });
          return;
        }

        enq("result", {
          result: {
            optimizedContent: parsed.optimizedContent ?? "",
            addedKeywords:    Array.isArray(parsed.addedKeywords) ? parsed.addedKeywords : [],
            explanation:      parsed.explanation ?? "",
          },
        });
        enq("done", { message: "Section optimization complete." });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[optimize-section]", msg);
        enq("error", { error: `Groq request failed: ${msg}` });
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
