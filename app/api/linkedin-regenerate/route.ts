/**
 * POST /api/linkedin-regenerate
 *
 * Powers "Generate new headline" / "Generate new summary" buttons.
 * Produces ONE freshly rewritten version on demand — the user can
 * re-roll without re-running the full audit.
 *
 * Body:
 *   section:         'headline' | 'summary'
 *   currentText:     string   — verbatim current text shown in UI
 *   jobDescriptions: string[] — same JDs used in the audit
 *   profileData:     object   — same profile data used in the audit
 *
 * Response (JSON, not SSE — fast single-shot call):
 *   { newText: string }
 */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_MODEL    = "llama-3.3-70b-versatile";

// ── Prompts ────────────────────────────────────────────────────────────────────

const HEADLINE_SYSTEM = `You are a LinkedIn headline specialist.
Write ONE exceptional LinkedIn headline for the candidate based on their profile and target job descriptions.

Rules:
- Max 220 characters
- Use | as separators between sections
- Include the exact job title from the JD as the first segment
- Add 3-5 high-value keywords from the JD naturally
- End with a value proposition or specialty
- NO emoji, NO quotation marks, NO brackets or placeholders
- Return ONLY the headline text, nothing else`;

const SUMMARY_SYSTEM = `You are a LinkedIn About section specialist.
Write ONE compelling LinkedIn About/Summary for the candidate based on their profile and target job descriptions.

Rules:
- 1500–2000 characters
- Open with a powerful hook (NOT "I am a...")
- 3-4 paragraphs: hook → expertise & skills → achievements/impact → CTA
- Weave in keywords from the job descriptions naturally
- End with a clear call-to-action (e.g. "Open to new opportunities — feel free to connect!")
- Use plain text only: no emoji, no markdown, no bullet symbols
- Return ONLY the summary text, nothing else`;

// ── POST handler ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let section:         "headline" | "summary";
  let currentText:     string;
  let jobDescriptions: string[];
  let profileData:     Record<string, unknown>;

  try {
    const body = (await req.json()) as {
      section?:         string;
      currentText?:     string;
      jobDescriptions?: string[];
      profileData?:     Record<string, unknown>;
    };
    section          = (body.section === "summary" ? "summary" : "headline");
    currentText      = (body.currentText ?? "").trim();
    jobDescriptions  = Array.isArray(body.jobDescriptions)
      ? body.jobDescriptions.filter(d => d?.trim())
      : [];
    profileData      = body.profileData ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GROQ_API_KEY is not configured." }, { status: 500 });
  }

  const openai = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });

  // ── Build user message ──────────────────────────────────────────────────────
  const exp    = (profileData.experience as { title?: string; company?: string }[] | undefined) ?? [];
  const skills = (profileData.skills    as string[] | undefined) ?? [];

  const profileSnippet = [
    `Name: ${profileData.fullName ?? "(unknown)"}`,
    `Current headline: ${profileData.headline ?? "(empty)"}`,
    `Location: ${profileData.location ?? "(unknown)"}`,
    `Industry: ${profileData.industry ?? "(unknown)"}`,
    exp.length ? `Experience: ${exp.map(e => `${e.title ?? ""} at ${e.company ?? ""}`).join(", ")}` : "",
    skills.length ? `Skills: ${skills.slice(0, 20).join(", ")}` : "",
    currentText ? `\nCurrent ${section === "headline" ? "headline" : "summary"} to improve:\n${currentText}` : "",
  ].filter(Boolean).join("\n");

  const jdSnippet = jobDescriptions.length
    ? `\n\nTarget job descriptions:\n${jobDescriptions.map((jd, i) => `--- JD ${i + 1} ---\n${jd.slice(0, 800)}`).join("\n\n")}`
    : "";

  try {
    const completion = await openai.chat.completions.create({
      model:       GROQ_MODEL,
      temperature: 0.6,    // slightly higher for creative variation
      max_tokens:  section === "headline" ? 100 : 700,
      messages: [
        {
          role:    "system",
          content: section === "headline" ? HEADLINE_SYSTEM : SUMMARY_SYSTEM,
        },
        {
          role:    "user",
          content: profileSnippet + jdSnippet,
        },
      ],
    });

    const newText = (completion.choices[0]?.message?.content ?? "").trim();

    if (!newText) {
      return NextResponse.json({ error: "AI returned an empty response. Please retry." }, { status: 500 });
    }

    return NextResponse.json({ newText });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[linkedin-regenerate]", msg);
    return NextResponse.json({ error: `Groq request failed: ${msg}` }, { status: 500 });
  }
}
