/**
 * POST /api/linkedin-audit
 *
 * Body:
 *   profileData: NormalizedProfile (from /api/linkedin-fetch or manual entry)
 *   jobDescriptions: string[]   (1–many, min 3 recommended)
 *
 * SSE named events (same protocol as match-report, optimize-section):
 *   event: status  → { message }
 *   event: chunk   → { delta }
 *   event: result  → { audit: LinkedInAuditResult }
 *   event: error   → { error }
 *   event: done    → { message }
 *
 * Saves completed audit to Firestore users/{uid}/linkedinAudits (userId passed
 * in body — the client is responsible for passing it since this is a server route
 * without session access).
 *
 * Types are defined locally (no types/index.ts in this project).
 * Uses the existing lib/firebase.ts singleton via the Firebase Admin-compatible
 * client SDK (Firestore is initialised client-side; saves happen client-side
 * after the SSE result event is received). The route itself does NOT write to
 * Firestore — the client handles that to avoid needing Admin SDK credentials.
 */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_MODEL    = "llama-3.3-70b-versatile";

// ─────────────────────────────────────────────────────────────────────────────
// Public types (imported by the report page)
// ─────────────────────────────────────────────────────────────────────────────

export type AuditStatus = "pass" | "fail" | "warning";

export interface AuditItem {
  label:   string;
  status:  AuditStatus;
  message: string;
}

export interface HeadlineAudit {
  currentText:          string;
  lengthCheck:          AuditItem;
  exactTitleMatch:      AuditItem;
  keywordsFound:        AuditItem;
  specialCharactersCheck: AuditItem;
  suggestedHeadline:    string;
}

export interface ProfileSummaryAudit {
  currentText:       string;
  lengthCheck:       AuditItem;
  keywordsCheck:     AuditItem;
  callToActionCheck: AuditItem;
  suggestedSummary:  string;
}

export interface BasicInformationAudit {
  fullName:         AuditItem;
  profilePicture:   AuditItem;
  backgroundPicture: AuditItem;
  location:         AuditItem;
  industry:         AuditItem;
  openToWork:       AuditItem;
}

export interface LinkedInAuditResult {
  overallScore:           number;
  targetRoleSummary:      string;
  scanDate:               string;
  needsImprovementCount:  number;
  wellDoneCount:          number;
  jobsUsedCount:          number;
  basicInformation:       BasicInformationAudit;
  highImpact: {
    headline:       HeadlineAudit;
    profileSummary: ProfileSummaryAudit;
  };
  workExperience:   { score: number; items: AuditItem[] };
  keySkills:        { score: number; matched: string[]; missing: string[] };
  predictedSkills:  string[];
  education:        { score: number; items: AuditItem[] };
  tipsAndTricks:    string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// SSE helper
// ─────────────────────────────────────────────────────────────────────────────

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert LinkedIn profile optimizer and ATS specialist.
Analyze the LinkedIn profile against the provided job descriptions.
Return ONLY valid JSON (no markdown, no extra text) matching EXACTLY this structure:

{
  "overallScore": <0-100>,
  "targetRoleSummary": "<pipe-separated synthesis of JD job title + top keywords, e.g. 'Product Manager | Roadmapping · Agile · B2B SaaS · Stakeholder Management · OKRs'>",
  "scanDate": "<today ISO date>",
  "needsImprovementCount": <integer>,
  "wellDoneCount": <integer>,
  "jobsUsedCount": <integer>,
  "basicInformation": {
    "fullName":         { "label": "Full name",          "status": "pass"|"fail", "message": "<1-2 sentences>" },
    "profilePicture":   { "label": "Profile picture",    "status": "pass"|"fail", "message": "<tip about 21x views if missing>" },
    "backgroundPicture":{ "label": "Background picture", "status": "pass"|"fail", "message": "<explanation>" },
    "location":         { "label": "Location",           "status": "pass"|"fail", "message": "<30% recruiter search tip if missing>" },
    "industry":         { "label": "Industry",           "status": "pass"|"fail", "message": "<explanation>" },
    "openToWork":       { "label": "Open to Work",       "status": "pass"|"fail", "message": "<40% more messages tip if missing>" }
  },
  "highImpact": {
    "headline": {
      "currentText": "<verbatim current headline, or empty string>",
      "lengthCheck":           { "label": "Headline length",          "status": "pass"|"fail", "message": "<chars used, recommend 120+>" },
      "exactTitleMatch":       { "label": "Exact job title match",    "status": "pass"|"fail", "message": "<We recommend including exact title X in your headline>" },
      "keywordsFound":         { "label": "Keywords found",           "status": "pass"|"fail", "message": "<which keywords found or missing>" },
      "specialCharactersCheck":{ "label": "Special characters",       "status": "pass"|"fail", "message": "<pipes/bullets ok, avoid emoji overuse>" },
      "suggestedHeadline": "<full AI-rewritten headline, max 220 chars, pipe-separated>"
    },
    "profileSummary": {
      "currentText": "<verbatim current about/summary, or empty string>",
      "lengthCheck":       { "label": "Summary length",     "status": "pass"|"fail", "message": "<chars, recommend 1500-2000>" },
      "keywordsCheck":     { "label": "Keywords in summary","status": "pass"|"fail", "message": "<which keywords present or missing>" },
      "callToActionCheck": { "label": "Call to action",     "status": "pass"|"fail", "message": "<ends with CTA? suggest one if missing>" },
      "suggestedSummary": "<full AI-rewritten 3-5 paragraph summary with CTA, 1500+ chars>"
    }
  },
  "workExperience": {
    "score": <0-100>,
    "items": [
      { "label": "<job title at company>", "status": "pass"|"fail", "message": "<bullets/metrics/action verbs check>" }
    ]
  },
  "keySkills": {
    "score": <0-100>,
    "matched": ["<skill in both profile and JD>"],
    "missing": ["<skill in JD but absent from profile>"]
  },
  "predictedSkills": ["<skill commonly expected for this role but not mentioned>"],
  "education": {
    "score": <0-100>,
    "items": [
      { "label": "<degree at school>", "status": "pass"|"fail", "message": "<explanation>" }
    ]
  },
  "tipsAndTricks": [
    "<specific actionable ranked tip 1>",
    "<tip 2>",
    "<tip 3>",
    "<tip 4>",
    "<tip 5>"
  ]
}

Rules:
- overallScore = weighted avg: highImpact×35% + workExperience×25% + basicInfo×15% + skills×15% + education×10%
- needsImprovementCount = total "fail" statuses across ALL items (including basicInformation and highImpact sub-items)
- wellDoneCount = total "pass" statuses
- jobsUsedCount = number of job descriptions provided
- currentText for headline and summary MUST be the user's verbatim text (empty string if not provided)
- suggestedHeadline must be a ready-to-paste replacement, not a template with brackets
- suggestedSummary must be a complete, ready-to-paste replacement (no [placeholders])
- predictedSkills: 3-8 skills commonly expected for the inferred role that are absent from the profile
- tipsAndTricks: 5 high-impact, specific, actionable tips ranked by expected ROI`;

// ─────────────────────────────────────────────────────────────────────────────
// POST handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let profileData:    Record<string, unknown>;
  let jobDescriptions: string[];

  try {
    const body = (await req.json()) as {
      profileData?:     Record<string, unknown>;
      jobDescriptions?: string[];
    };
    profileData     = body.profileData      ?? {};
    jobDescriptions = Array.isArray(body.jobDescriptions)
      ? body.jobDescriptions.filter(d => d?.trim())
      : [];
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!profileData.fullName && !profileData.headline) {
    return NextResponse.json(
      { error: "profileData must include at least fullName or headline." },
      { status: 400 }
    );
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GROQ_API_KEY is not configured." }, { status: 500 });
  }

  const openai  = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enq = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sse(event, data)));

      try {
        enq("status", { message: "Running LinkedIn profile analysis with Groq…" });

        // ── Build user prompt ─────────────────────────────────────────────────
        const profile = profileData;
        const exp = (profile.experience as { title?: string; company?: string; description?: string }[] | undefined) ?? [];
        const skills = (profile.skills as string[] | undefined) ?? [];
        const edu = (profile.education as { degree?: string; school?: string }[] | undefined) ?? [];

        const profileText = [
          `=== LINKEDIN PROFILE ===`,
          `Full name: ${profile.fullName ?? "(not provided)"}`,
          `Headline (${String(profile.headline ?? "").length} chars): ${profile.headline ?? "(empty)"}`,
          `Location: ${profile.location ?? "(not set)"}`,
          `Industry: ${profile.industry ?? "(not set)"}`,
          `Open to Work: ${profile.openToWork ? "Yes" : "No"}`,
          `Has profile picture: ${profile.hasProfilePicture ? "Yes" : "No"}`,
          `Has background picture: ${profile.hasBackgroundPicture ? "Yes" : "No"}`,
          `\nAbout / Summary (${String(profile.about ?? "").length} chars):\n${profile.about || "(empty)"}`,
          exp.length
            ? `\nWork Experience (${exp.length} entries):\n${exp.map(e => `• ${e.title ?? "Role"} at ${e.company ?? "Company"}\n  ${e.description ?? "(no description)"}`).join("\n")}`
            : "\nWork Experience: (none provided)",
          skills.length
            ? `\nSkills (${skills.length}): ${skills.join(", ")}`
            : "\nSkills: (none listed)",
          edu.length
            ? `\nEducation:\n${edu.map(e => `• ${e.degree ?? "Degree"} — ${e.school ?? "School"}`).join("\n")}`
            : "\nEducation: (none provided)",
        ].join("\n");

        const jdText = jobDescriptions.length > 0
          ? `\n\n=== TARGET JOB DESCRIPTIONS (${jobDescriptions.length}) ===\n` +
            jobDescriptions.map((jd, i) => `--- JD ${i + 1} ---\n${jd}`).join("\n\n")
          : "\n\n=== TARGET JOB DESCRIPTIONS ===\n(none provided — perform general audit)";

        const completion = await openai.chat.completions.create({
          model:           GROQ_MODEL,
          stream:          true,
          temperature:     0.2,
          max_tokens:      4000,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user",   content: profileText + jdText },
          ],
        });

        let accumulated = "";
        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (delta) { accumulated += delta; enq("chunk", { delta }); }
        }

        let parsed: LinkedInAuditResult;
        try {
          parsed = JSON.parse(accumulated) as LinkedInAuditResult;
        } catch {
          enq("error", { error: "Failed to parse Groq response as JSON. Please retry." });
          return;
        }

        // Ensure scanDate is set
        parsed.scanDate = parsed.scanDate || new Date().toISOString().split("T")[0];

        enq("result", { audit: parsed });
        enq("done",   { message: "LinkedIn audit complete." });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[linkedin-audit]", msg);
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
