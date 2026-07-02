/**
 * POST /api/linkedin-fetch
 *
 * Body: { linkedinUrl: string }
 *
 * Strategy (pluggable):
 *   1. If LINKEDIN_SCRAPER_API_KEY is set → try RapidAPI LinkedIn scraper
 *   2. Otherwise → return { source: 'manual', profileData: <empty shell> }
 *      so the UI can display a manual-entry form
 *
 * Response:
 *   { source: 'scraped'|'manual', profileData: NormalizedProfile }
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// ── Normalised profile shape (matches linkedin-audit body exactly) ─────────────
export interface NormalizedProfile {
  fullName:             string;
  headline:             string;
  about:                string;
  location:             string;
  industry:             string;
  openToWork:           boolean;
  hasProfilePicture:    boolean;
  hasBackgroundPicture: boolean;
  experience: { title: string; company: string; description: string; startDate?: string; endDate?: string }[];
  skills:     string[];
  education:  { degree: string; school: string; year?: string }[];
}

const EMPTY_PROFILE: NormalizedProfile = {
  fullName: "", headline: "", about: "", location: "", industry: "",
  openToWork: false, hasProfilePicture: false, hasBackgroundPicture: false,
  experience: [], skills: [], education: [],
};

// ── RapidAPI scraper mapper (proxycurl-compatible response) ─────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProxycurlResponse(data: Record<string, any>): NormalizedProfile {
  return {
    fullName:             [data.first_name, data.last_name].filter(Boolean).join(" "),
    headline:             data.headline             ?? "",
    about:                data.summary              ?? "",
    location:             data.city ?? data.country ?? "",
    industry:             data.industry             ?? "",
    openToWork:           data.open_to_work         ?? false,
    hasProfilePicture:    !!data.profile_pic_url,
    hasBackgroundPicture: !!data.background_cover_image_url,
    experience: (data.experiences ?? []).slice(0, 5).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e: any) => ({
        title:       e.title        ?? "",
        company:     e.company      ?? "",
        description: e.description  ?? "",
        startDate:   e.starts_at    ? `${e.starts_at.year}-${String(e.starts_at.month).padStart(2, "0")}` : undefined,
        endDate:     e.ends_at      ? `${e.ends_at.year}-${String(e.ends_at.month).padStart(2, "0")}`   : "Present",
      })
    ),
    skills:    (data.skills    ?? []).map((s: { name?: string } | string) => typeof s === "string" ? s : (s.name ?? "")).filter(Boolean),
    education: (data.education ?? []).slice(0, 3).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e: any) => ({
        degree: [e.degree_name, e.field_of_study].filter(Boolean).join(" in ") || "",
        school: e.school ?? "",
        year:   e.ends_at?.year ? String(e.ends_at.year) : undefined,
      })
    ),
  };
}

// ── POST handler ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let linkedinUrl: string;
  try {
    const body = (await req.json()) as { linkedinUrl?: string };
    linkedinUrl = (body.linkedinUrl ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!linkedinUrl) {
    return NextResponse.json({ error: "linkedinUrl is required." }, { status: 400 });
  }

  const scraperKey  = process.env.LINKEDIN_SCRAPER_API_KEY;
  const scraperHost = process.env.LINKEDIN_SCRAPER_HOST ?? "linkedin-profile-data-api.p.rapidapi.com";

  // ── No key → manual mode ────────────────────────────────────────────────────
  if (!scraperKey) {
    return NextResponse.json({
      source:      "manual",
      profileData: EMPTY_PROFILE,
      message:     "No LinkedIn scraper API key configured. Please fill in your profile details manually.",
    });
  }

  // ── Try scraper ─────────────────────────────────────────────────────────────
  try {
    const scraperUrl = `https://${scraperHost}/profile?url=${encodeURIComponent(linkedinUrl)}`;
    const res = await fetch(scraperUrl, {
      headers: {
        "X-RapidAPI-Key":  scraperKey,
        "X-RapidAPI-Host": scraperHost,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      throw new Error(`Scraper returned HTTP ${res.status}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as Record<string, any>;
    const profileData = mapProxycurlResponse(data);

    return NextResponse.json({ source: "scraped", profileData });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[linkedin-fetch] Scraper failed:", msg);
    // Degrade gracefully to manual mode
    return NextResponse.json({
      source:      "manual",
      profileData: EMPTY_PROFILE,
      message:     `Scraper unavailable (${msg}). Please fill in your profile details manually.`,
    });
  }
}
