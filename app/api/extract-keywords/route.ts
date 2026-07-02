/**
 * POST /api/extract-keywords
 *
 * Body: { jobDescription }
 *
 * Response (JSON — not streamed; fast enough to return synchronously):
 *   {
 *     requiredSkills: string[],
 *     niceToHaveSkills: string[],
 *     softSkills: string[],
 *     experienceLevel: string,
 *     keyPhrases: string[]
 *   }
 *
 * Falls back to a local heuristic extractor when GROQ_API_KEY is absent.
 */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_MODEL    = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `You are an expert ATS analyst and recruiter.
Extract and categorize all important terms from the job description.
Return ONLY valid JSON (no markdown fences):
{
  "requiredSkills": [
    "<hard skill or technology explicitly required>"
  ],
  "niceToHaveSkills": [
    "<hard skill listed as preferred / nice-to-have / bonus>"
  ],
  "softSkills": [
    "<interpersonal or behavioral skill mentioned>"
  ],
  "experienceLevel": "<entry | mid | senior | lead | executive>",
  "keyPhrases": [
    "<important multi-word phrase or domain term that should appear in the resume>"
  ]
}
Rules:
- requiredSkills: only skills the posting says are REQUIRED / MUST HAVE
- niceToHaveSkills: skills listed as preferred, desired, or nice-to-have
- softSkills: communication, leadership, teamwork, etc.
- experienceLevel: infer from years requested or title seniority
- keyPhrases: domain jargon, certifications, methodologies (Agile, CI/CD, SOC 2, …)
- No duplicates between arrays
- Lowercase all terms`;

// ── Local fallback (no API key) ───────────────────────────────────────────────
const STOP = new Set([
  "and","the","with","for","our","you","are","this","that","will","have",
  "from","they","their","your","about","also","both","into","more","some",
  "such","than","then","them","these","those","when","which","while","who",
  "how","its","not","can","all","any","but","may","use","via","per","etc",
  "able","work","team","role","join","help","make","time","year","years",
]);

function localExtract(jd: string): {
  requiredSkills: string[];
  niceToHaveSkills: string[];
  softSkills: string[];
  experienceLevel: string;
  keyPhrases: string[];
} {
  const lower = jd.toLowerCase();
  const words = lower.match(/\b[a-z][a-z+#.]{2,}\b/g) ?? [];

  // Frequency map
  const freq: Record<string, number> = {};
  for (const w of words) {
    if (!STOP.has(w) && w.length > 3) freq[w] = (freq[w] ?? 0) + 1;
  }
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([w]) => w);

  // Soft skill keywords
  const softSet = ["communication","leadership","teamwork","collaboration",
    "problem-solving","analytical","organized","detail","proactive","self-starter",
    "interpersonal","adaptable","initiative","mentoring","time management"];
  const softSkills = sorted.filter(w => softSet.some(s => s.includes(w))).slice(0, 6);

  // Nice-to-have section heuristic
  const niceSection = lower.match(/(?:nice.to.have|preferred|bonus|plus)[^\n]*\n([\s\S]*?)(?:\n\n|\n[A-Z]|$)/)?.[1] ?? "";
  const niceWords = niceSection.match(/\b[a-z][a-z+#.]{2,}\b/g)?.filter(w => !STOP.has(w)) ?? [];
  const niceToHaveSkills = Array.from(new Set(niceWords)).slice(0, 8);

  const requiredSkills = sorted
    .filter(w => !softSkills.includes(w) && !niceToHaveSkills.includes(w))
    .slice(0, 12);

  // Experience level
  let experienceLevel = "mid";
  if (/senior|sr\.|staff|principal|8\+|10\+/i.test(jd)) experienceLevel = "senior";
  else if (/lead|director|vp |head of|15\+/i.test(jd))   experienceLevel = "lead";
  else if (/entry|junior|jr\.|0-2|1-2 year/i.test(jd))   experienceLevel = "entry";

  // Key phrases — bigrams that appear > 1 time
  const tokens = lower.match(/[a-z][a-z+#.]+/g) ?? [];
  const bigrams: Record<string, number> = {};
  for (let i = 0; i < tokens.length - 1; i++) {
    const bg = `${tokens[i]} ${tokens[i + 1]}`;
    if (!STOP.has(tokens[i]) && !STOP.has(tokens[i + 1])) {
      bigrams[bg] = (bigrams[bg] ?? 0) + 1;
    }
  }
  const keyPhrases = Object.entries(bigrams)
    .filter(([, c]) => c > 1)
    .sort((a, b) => b[1] - a[1])
    .map(([bg]) => bg)
    .slice(0, 10);

  return { requiredSkills, niceToHaveSkills, softSkills, experienceLevel, keyPhrases };
}

// ── POST handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let jobDescription: string;

  try {
    const body = (await req.json()) as { jobDescription?: string };
    jobDescription = (body.jobDescription ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!jobDescription) {
    return NextResponse.json({ error: "jobDescription is required." }, { status: 400 });
  }

  const apiKey = process.env.GROQ_API_KEY;

  // ── Fallback: no API key ──────────────────────────────────────────────────
  if (!apiKey) {
    return NextResponse.json({
      ...localExtract(jobDescription),
      fallback: true,
    });
  }

  // ── Groq path ─────────────────────────────────────────────────────────────
  const openai = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });

  try {
    const completion = await openai.chat.completions.create({
      model:           GROQ_MODEL,
      stream:          false,
      temperature:     0.2,
      max_tokens:      1024,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: `JOB DESCRIPTION:\n${jobDescription}` },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";

    let parsed: {
      requiredSkills?: string[];
      niceToHaveSkills?: string[];
      softSkills?: string[];
      experienceLevel?: string;
      keyPhrases?: string[];
    };

    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      return NextResponse.json({ error: "AI returned invalid JSON." }, { status: 502 });
    }

    return NextResponse.json({
      requiredSkills:   Array.isArray(parsed.requiredSkills)   ? parsed.requiredSkills   : [],
      niceToHaveSkills: Array.isArray(parsed.niceToHaveSkills) ? parsed.niceToHaveSkills : [],
      softSkills:       Array.isArray(parsed.softSkills)       ? parsed.softSkills       : [],
      experienceLevel:  typeof parsed.experienceLevel === "string" ? parsed.experienceLevel : "mid",
      keyPhrases:       Array.isArray(parsed.keyPhrases)       ? parsed.keyPhrases       : [],
      fallback:         false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[extract-keywords]", msg);
    return NextResponse.json({ error: `Groq request failed: ${msg}` }, { status: 502 });
  }
}
