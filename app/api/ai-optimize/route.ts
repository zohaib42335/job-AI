import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_MODEL    = "llama-3.3-70b-versatile";

// ─── SSE helper ───────────────────────────────────────────────────────────────
function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ─── System prompts ───────────────────────────────────────────────────────────
const SUMMARY_PROMPT = `You are an expert resume writer and ATS specialist.
Rewrite the professional summary to perfectly match the job description.
Return ONLY valid JSON (no markdown):
{
  "optimized": "<rewritten summary — 2-4 sentences>",
  "improvements": ["<specific change made>", ...]
}
Rules:
- Mirror exact keywords from the job description
- Start with a strong action phrase
- Include the job title from the JD
- Quantify where possible
- Max 80 words`;

const BULLETS_PROMPT = `You are an expert resume writer and ATS specialist.
Rewrite the experience bullets to match the job description.
Return ONLY valid JSON (no markdown):
{
  "optimized": "<rewritten bullets — one per line starting with •>",
  "improvements": ["<specific change made>", ...]
}
Rules:
- Start every bullet with a strong action verb (Led, Built, Reduced, etc.)
- Add specific metrics (%, $, numbers) where plausible
- Mirror keywords from the job description naturally
- Remove passive voice completely
- 4-6 bullets maximum`;

const SKILLS_PROMPT = `You are an expert resume writer and ATS specialist.
Rewrite the skills section to match the job description.
Return ONLY valid JSON (no markdown):
{
  "optimized": "<rewritten skills — comma-separated, most relevant first>",
  "improvements": ["<specific change made>", ...]
}
Rules:
- Put skills that appear in the JD first
- Add clearly missing skills from JD requirements
- Group: Technical Skills: ... | Soft Skills: ...
- Remove skills with no relevance to the role`;

const KEYWORDS_PROMPT = `You are an expert ATS analyst.
Identify missing keywords and return a prioritized list.
Return ONLY valid JSON (no markdown):
{
  "optimized": "<actionable list of missing keywords with placement suggestions>",
  "improvements": ["<insight about the gap>", ...],
  "missingKeywords": ["<keyword>", ...],
  "requiredSkills": ["<skill from JD>", ...],
  "matchedSkills": ["<skill in both resume and JD>", ...]
}`;

function getPrompt(mode: string): string {
  if (mode === "summary")  return SUMMARY_PROMPT;
  if (mode === "bullets")  return BULLETS_PROMPT;
  if (mode === "skills")   return SKILLS_PROMPT;
  return KEYWORDS_PROMPT;
}

// ─── POST /api/ai-optimize ────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  let resumeText: string;
  let jobDescription: string;
  let mode: string;

  try {
    const body = (await request.json()) as {
      resumeText?: string;
      jobDescription?: string;
      mode?: string;
    };
    resumeText    = (body.resumeText    ?? "").trim();
    jobDescription = (body.jobDescription ?? "").trim();
    mode          = (body.mode ?? "summary").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!resumeText)    return NextResponse.json({ error: "resumeText is required."    }, { status: 400 });
  if (!jobDescription) return NextResponse.json({ error: "jobDescription is required." }, { status: 400 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GROQ_API_KEY is not configured." }, { status: 500 });
  }

  const openai = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });

  const encoder = new TextEncoder();
  const stream  = new ReadableStream({
    async start(controller) {
      const enqueue = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sseEvent(event, data)));

      try {
        enqueue("status", { message: `Optimizing ${mode} section with Groq…` });

        const completion = await openai.chat.completions.create({
          model:  GROQ_MODEL,
          stream: true,
          temperature: 0.4,
          max_tokens:  1024,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: getPrompt(mode) },
            {
              role: "user",
              content:
                `MODE: ${mode}\n\nRESUME:\n${resumeText}\n\n---\n\nJOB DESCRIPTION:\n${jobDescription}`,
            },
          ],
        });

        let accumulated = "";
        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (delta) {
            accumulated += delta;
            enqueue("chunk", { delta });
          }
        }

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(accumulated) as Record<string, unknown>;
        } catch {
          enqueue("error", { error: "Failed to parse AI response." });
          controller.close();
          return;
        }

        enqueue("result", { result: { mode, ...parsed } });
        enqueue("done",   { message: "Optimization complete." });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[ai-optimize]", message);
        enqueue("error", { error: `Groq request failed: ${message}` });
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
