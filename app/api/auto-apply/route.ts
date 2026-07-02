/**
 * POST /api/auto-apply
 *
 * Body: { jobId: string, userId: string, jobData?: MappedJob }
 *
 * Workflow:
 *  a. Credit check   — 402 if insufficient
 *  b. Onboarding check — returns needsOnboarding if not completed
 *  c. Resume + job description fetch
 *  d. Match score (local keyword heuristic — fast, no SSE needed here)
 *  e. Create application record (status: autofilling)
 *  f. Generate cover letter via Groq
 *  g. Update status → pending_review (manual) or submitting (auto-submit)
 *  h. Return full application record
 */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  getOrCreatePreferences,
  getCredits,
  createApplication,
  updateApplicationStatus,
  type ApplicationRecord,
} from "@/lib/auto-apply";
import { getUserResumes } from "@/lib/resume";
import { localScore } from "@/lib/job-match";

export const runtime = "nodejs";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_MODEL    = "meta-llama/llama-4-scout-17b-16e-instruct";

// ─────────────────────────────────────────────────────────────────────────────
// Cover-letter generator
// ─────────────────────────────────────────────────────────────────────────────

async function generateCoverLetter(
  firstName:       string,
  resumeSummary:   string,
  jobTitle:        string,
  company:         string,
  jobDescription:  string
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return "";

  const openai = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });
  const prompt = `
You are a professional career coach. Write a concise, compelling cover letter for the following:

Candidate: ${firstName}
Resume summary: ${resumeSummary}

Job Title: ${jobTitle}
Company: ${company}
Job Description (excerpt):
${jobDescription.slice(0, 1500)}

Instructions:
- 3 short paragraphs: opening hook, relevant skills/achievements, closing
- Confident and professional tone
- Address it to "Hiring Manager"
- Do NOT include a subject line or date
- Return only the cover letter body text, no markdown
`.trim();

  const resp = await openai.chat.completions.create({
    model:       GROQ_MODEL,
    temperature: 0.6,
    max_tokens:  600,
    messages:    [{ role: "user", content: prompt }],
  });

  return resp.choices[0]?.message?.content?.trim() ?? "";
}

// ─────────────────────────────────────────────────────────────────────────────
// POST handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      jobId:    string;
      userId:   string;
      jobData?: {
        title: string; company: string; location: string;
        type: string; description: string; applyUrl?: string;
      };
    };
    const { jobId, userId, jobData } = body;
    if (!jobId || !userId) {
      return NextResponse.json({ error: "jobId and userId are required" }, { status: 400 });
    }

    // ── a. Credit check ───────────────────────────────────────────────────────
    const credits = await getCredits(userId);
    if (credits <= 0) {
      return NextResponse.json(
        { error: "Insufficient credits. Please top up to continue.", code: "NO_CREDITS" },
        { status: 402 }
      );
    }

    // ── b. Onboarding check ───────────────────────────────────────────────────
    const prefs = await getOrCreatePreferences(userId);
    if (!prefs || !prefs.onboardingCompleted) {
      return NextResponse.json(
        { needsOnboarding: true, message: "Please complete your preferences first." },
        { status: 200 }
      );
    }

    // ── c. Job data (passed from frontend or look up from Firestore cache) ────
    const job = jobData ?? (() => {
      // Fallback minimal job when not passed
      return {
        title: "Position", company: "Company", location: "Remote",
        type: "Full-time", description: "", applyUrl: "",
      };
    })();

    // ── d. Resume + match score ───────────────────────────────────────────────
    let resumeText = "";
    let resumeSummary = "";
    try {
      const resumes = await getUserResumes(userId);
      const resume  = prefs.resumeId
        ? resumes.find(r => r.id === prefs.resumeId) ?? resumes[0]
        : resumes[0];
      if (resume) {
        const f = resume.formData;
        resumeText = [
          f.fullName, f.jobTitle, f.summary,
          ...(f.experience ?? []).map(e => `${e.jobTitle} ${e.description}`),
          resume.skills.join(" "),
        ].filter(Boolean).join(" ");
        resumeSummary = f.summary ?? `${f.jobTitle ?? ""} with experience in ${resume.skills.slice(0, 5).join(", ")}`;
      }
    } catch { /* score = 0 */ }

    const matchScore = resumeText
      ? localScore(resumeText, job.description)
      : 0;

    const lowMatchWarning = matchScore > 0 && matchScore < 50;

    // ── e. Create application record (autofilling) ────────────────────────────
    const appData: Omit<ApplicationRecord, "id" | "createdAt"> = {
      userId,
      jobId,
      jobTitle:    job.title,
      company:     job.company,
      location:    job.location,
      jobType:     job.type,
      applyUrl:    job.applyUrl ?? "",
      resumeId:    prefs.resumeId,
      firstName:   prefs.firstName,
      lastName:    prefs.lastName,
      email:       prefs.email,
      phone:       prefs.phone,
      coverLetter: "",
      matchScore,
      status:      "autofilling",
    };

    const applicationId = await createApplication(userId, appData);

    // ── f. Generate cover letter ──────────────────────────────────────────────
    let coverLetter = "";
    try {
      coverLetter = await generateCoverLetter(
        prefs.firstName,
        resumeSummary,
        job.title,
        job.company,
        job.description
      );
    } catch {
      coverLetter = `Dear Hiring Manager,\n\nI am excited to apply for the ${job.title} position at ${job.company}. My background and skills make me an excellent candidate for this role.\n\nI look forward to discussing how I can contribute to your team.\n\nSincerely,\n${prefs.firstName} ${prefs.lastName}`;
    }

    // ── g. Update status ──────────────────────────────────────────────────────
    const finalStatus = prefs.applyMode === "auto-submit" ? "submitting" : "pending_review";
    await updateApplicationStatus(userId, applicationId, finalStatus, { coverLetter });

    // ── h. Return ─────────────────────────────────────────────────────────────
    return NextResponse.json({
      applicationId,
      status:          finalStatus,
      coverLetter,
      matchScore,
      lowMatchWarning,
      job,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[auto-apply]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
