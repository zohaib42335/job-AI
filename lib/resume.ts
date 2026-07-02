import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "./firebase";
import type { ResumeFormData } from "@/app/resume-builder/types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ResumeRecord {
  id: string;
  name: string;
  skills: string[];
  formData: ResumeFormData;
  createdAt: Date | null;
  updatedAt: Date | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Firestore helpers
// ─────────────────────────────────────────────────────────────────────────────

function toDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === "object" && val !== null && "toDate" in val) {
    return (val as { toDate(): Date }).toDate();
  }
  return null;
}

function buildResumeName(data: Partial<ResumeFormData>): string {
  const parts: string[] = [];
  if (data.fullName) parts.push(data.fullName);
  if (data.jobTitle) parts.push(data.jobTitle);
  if (parts.length > 0) return parts.join(" — ");
  return `Resume · ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function saveResume(
  userId: string,
  data: ResumeFormData,
  skills: string[],
  resumeId?: string | null
): Promise<string> {
  const ref = collection(db, "users", userId, "resumes");
  const name = buildResumeName(data);

  if (resumeId) {
    const docRef = doc(ref, resumeId);
    await updateDoc(docRef, {
      ...data,
      skills,
      name,
      updatedAt: serverTimestamp(),
    });
    return resumeId;
  }

  const docRef = await addDoc(ref, {
    ...data,
    skills,
    name,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getUserResumes(userId: string): Promise<ResumeRecord[]> {
  const ref  = collection(db, "users", userId, "resumes");
  const snap = await getDocs(query(ref, orderBy("updatedAt", "desc")));

  return snap.docs.map((d) => {
    const raw = d.data();
    return {
      id:        d.id,
      name:      raw.name ?? "Untitled Resume",
      skills:    Array.isArray(raw.skills) ? raw.skills : [],
      formData:  raw as ResumeFormData,
      createdAt: toDate(raw.createdAt),
      updatedAt: toDate(raw.updatedAt),
    };
  });
}

export async function deleteResume(userId: string, resumeId: string): Promise<void> {
  await deleteDoc(doc(db, "users", userId, "resumes", resumeId));
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser — internal regex constants
// ─────────────────────────────────────────────────────────────────────────────

// Matches: "Jan 2020 – Present", "2020 – 2023", "Jan 2020 - Dec 2023", "2020–Present"
const DATE_RANGE_RE =
  /\b(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s*)?\d{4}\s*[-–—]+\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s*)?\d{4}|\b(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s*)?\d{4}\s*[-–—]+\s*(?:Present|Current|Now)\b/gi;

// Matches a standalone year like 2022 or 1998
const YEAR_RE = /\b(19|20)\d{2}\b/;

// Bullet-point line starters
const BULLET_RE = /^[\u2022\u25AA\u25B8\-\*]\s*/;

// Month abbreviation → zero-padded number
const MONTH_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

// Job-title indicator words
const TITLE_RE =
  /\b(engineer|manager|developer|designer|analyst|director|lead|senior|junior|associate|specialist|coordinator|consultant|officer|architect|administrator|executive|qa|tester|devops|full[\s-]?stack|frontend|backend|intern|head|vp|president)\b/i;

// Company name indicator words
const COMPANY_RE =
  /\b(inc\.?|llc|ltd\.?|corp\.?|solutions|technologies|agency|group|services|consulting|software|systems|labs?|studio|enterprises|pvt\.?|limited)\b/i;

// Section header detection
const SECTION_KEYWORDS: Record<string, string> = {
  "SUMMARY":              "SUMMARY",
  "PROFESSIONAL SUMMARY": "SUMMARY",
  "CAREER SUMMARY":       "SUMMARY",
  "OBJECTIVE":            "SUMMARY",
  "PROFILE":              "SUMMARY",
  "EXPERIENCE":           "EXPERIENCE",
  "WORK EXPERIENCE":      "EXPERIENCE",
  "PROFESSIONAL EXPERIENCE": "EXPERIENCE",
  "EMPLOYMENT HISTORY":   "EXPERIENCE",
  "EMPLOYMENT":           "EXPERIENCE",
  "WORK HISTORY":         "EXPERIENCE",
  "EDUCATION":            "EDUCATION",
  "ACADEMIC BACKGROUND":  "EDUCATION",
  "SKILLS":               "SKILLS",
  "TECHNICAL SKILLS":     "SKILLS",
  "CORE COMPETENCIES":    "SKILLS",
  "CERTIFICATIONS":       "CERTIFICATIONS",
  "CERTIFICATES":         "CERTIFICATIONS",
  "LANGUAGES":            "LANGUAGES",
  "PROJECTS":             "PROJECTS",
};

// ─────────────────────────────────────────────────────────────────────────────
// Parser — date helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Converts "Jan 2023" → "2023-01", "2023" → "2023-01", passes through ISO strings */
function normalizeDate(raw: string): string {
  const s = raw.trim();
  if (!s || /present|current|now/i.test(s)) return "";

  // "Jan 2023" or "January 2023"
  const monthYearMatch = s.match(
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s+(\d{4})$/i
  );
  if (monthYearMatch) {
    const month = MONTH_MAP[monthYearMatch[1].toLowerCase().slice(0, 3)];
    return `${monthYearMatch[2]}-${month}`;
  }

  // Bare year "2023"
  const yearOnly = s.match(/^(\d{4})$/);
  if (yearOnly) return `${yearOnly[1]}-01`;

  return s;
}

/** Extracts start/end dates from a string containing a date range */
function extractDates(raw: string): {
  startDate: string;
  endDate: string;
  currentlyWorking: boolean;
} {
  DATE_RANGE_RE.lastIndex = 0;
  const m = DATE_RANGE_RE.exec(raw);
  if (!m) return { startDate: "", endDate: "", currentlyWorking: false };

  const matched = m[0];
  // Split on the dash/dash-like separator
  const parts = matched.split(/\s*[-–—]+\s*/);
  const startRaw = parts[0]?.trim() ?? "";
  const endRaw   = parts[1]?.trim() ?? "";

  const currentlyWorking = /present|current|now/i.test(endRaw);
  return {
    startDate:       normalizeDate(startRaw),
    endDate:         currentlyWorking ? "" : normalizeDate(endRaw),
    currentlyWorking,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser — section splitting
// ─────────────────────────────────────────────────────────────────────────────

function detectSectionHeader(line: string): string | null {
  const upper = line.toUpperCase().trim().replace(/[:\-_]+$/, "").trim();
  if (upper.length > 60) return null; // too long to be a header

  // Exact or starts-with match
  for (const [key, mapped] of Object.entries(SECTION_KEYWORDS)) {
    if (upper === key || upper.startsWith(key + " ")) return mapped;
  }
  return null;
}

function extractSections(lines: string[]): Record<string, string[]> {
  const sections: Record<string, string[]> = {};
  let current = "";

  for (const line of lines) {
    const section = detectSectionHeader(line);
    if (section) {
      current = section;
      sections[current] ??= [];
    } else if (current) {
      sections[current].push(line);
    }
  }

  return sections;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser — experience
// ─────────────────────────────────────────────────────────────────────────────

type ExpEntry = {
  jobTitle: string;
  employer: string;
  location: string;
  startDate: string;
  endDate: string;
  currentlyWorking: boolean;
  description: string;
};

/**
 * Split experience lines into entry blocks.
 * A new block begins when we encounter a non-bullet line that contains a year,
 * AND the current block already has at least one year-bearing line.
 */
function splitIntoExpBlocks(lines: string[]): string[][] {
  const blocks: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    const isBullet  = BULLET_RE.test(line);
    const hasYear   = YEAR_RE.test(line);
    const hasDate   = (DATE_RANGE_RE.lastIndex = 0, DATE_RANGE_RE.test(line));

    if (!isBullet && (hasDate || hasYear) && current.length > 0) {
      // Does the current block already have a dated line?
      const blockHasDate = current.some((l) => {
        DATE_RANGE_RE.lastIndex = 0;
        return DATE_RANGE_RE.test(l) || (YEAR_RE.test(l) && !BULLET_RE.test(l));
      });
      if (blockHasDate) {
        blocks.push(current);
        current = [];
      }
    }

    current.push(line);
  }

  if (current.length > 0) blocks.push(current);
  return blocks;
}

function parseExperienceBlock(block: string[]): ExpEntry | null {
  const headerLines: string[] = [];
  const descLines:   string[] = [];
  let startDate       = "";
  let endDate         = "";
  let currentlyWorking = false;
  let location        = "";

  for (const line of block) {
    // Bullet → description
    if (BULLET_RE.test(line)) {
      descLines.push("• " + line.replace(BULLET_RE, "").trim());
      continue;
    }

    // Check for date range
    DATE_RANGE_RE.lastIndex = 0;
    const dateMatch = DATE_RANGE_RE.exec(line);
    if (dateMatch) {
      const dates = extractDates(line);
      startDate        = dates.startDate;
      endDate          = dates.endDate;
      currentlyWorking = dates.currentlyWorking;

      // Keep any text on the same line that isn't the date
      const before = line.slice(0, dateMatch.index).replace(/[|,·\-–—]+\s*$/, "").trim();
      const after  = line.slice(dateMatch.index + dateMatch[0].length).replace(/^\s*[|,·\-–—]+/, "").trim();
      const rest   = [before, after].filter(Boolean).join(" ").trim();
      if (rest.length > 2) headerLines.push(rest);
      continue;
    }

    // Check for a lone "– Present" or "- Present" line (seen when date wraps)
    if (/^[-–—]\s*(Present|Current|Now)\s*$/i.test(line)) {
      currentlyWorking = true;
      continue;
    }

    // Location pattern: "City, ST" or "City, Country"
    const locMatch = line.match(/^([A-Z][a-zA-Z\s]+),\s*([A-Z]{2,})\s*$/);
    if (locMatch && line.length < 50) {
      location = line.trim();
      continue;
    }

    // Otherwise: candidate for header (company/job title)
    if (line.length > 1 && line.length < 100) {
      headerLines.push(line.trim());
    }
  }

  if (headerLines.length === 0 && descLines.length === 0) return null;

  // ── Assign header lines to jobTitle / employer ─────────────────────────────
  // Heuristic: a line that matches TITLE_RE is a job title; one matching
  // COMPANY_RE is an employer.  If ambiguous we use positional convention:
  // most US resumes list Company then Role, or Role then Company.
  let jobTitle = "";
  let employer = "";

  if (headerLines.length === 1) {
    const l = headerLines[0];
    if (TITLE_RE.test(l)) jobTitle = l;
    else                  employer = l;
  } else if (headerLines.length >= 2) {
    const [l0, l1, ...rest] = headerLines;

    const l0IsTitle   = TITLE_RE.test(l0);
    const l1IsTitle   = TITLE_RE.test(l1);
    const l0IsCompany = COMPANY_RE.test(l0);
    const l1IsCompany = COMPANY_RE.test(l1);

    if (l0IsTitle && !l1IsTitle) {
      jobTitle = l0; employer = l1;
    } else if (l1IsTitle && !l0IsTitle) {
      employer = l0; jobTitle = l1;
    } else if (l0IsCompany && !l1IsCompany) {
      employer = l0; jobTitle = l1;
    } else if (l1IsCompany && !l0IsCompany) {
      jobTitle = l0; employer = l1;
    } else {
      // Default: first line is employer, second is job title
      employer = l0; jobTitle = l1;
    }

    // Extra header lines go into description as context
    if (rest.length > 0) {
      descLines.unshift(...rest);
    }
  }

  return {
    jobTitle:        jobTitle.trim(),
    employer:        employer.trim(),
    location,
    startDate,
    endDate,
    currentlyWorking,
    description:     descLines.join("\n"),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser — education
// ─────────────────────────────────────────────────────────────────────────────

const DEGREE_RE =
  /\b(bachelor|master|phd|ph\.d|doctorate|associate|diploma|certificate|b\.s\.?|m\.s\.?|b\.a\.?|m\.a\.?|b\.e\.?|m\.e\.?|b\.?tech|m\.?tech|mba|hnd)\b/i;

type EduEntry = {
  degree: string;
  school: string;
  fieldOfStudy: string;
  startYear: string;
  endYear: string;
  gpa: string;
};

function parseEducation(lines: string[]): EduEntry[] {
  // Group lines into blocks (one per degree)
  const blocks: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    const hasDegree = DEGREE_RE.test(line);
    const hasYear   = YEAR_RE.test(line);

    if ((hasDegree || hasYear) && current.length > 0) {
      const blockHasDegreeOrYear = current.some(
        (l) => DEGREE_RE.test(l) || YEAR_RE.test(l)
      );
      if (blockHasDegreeOrYear) {
        blocks.push(current);
        current = [];
      }
    }
    current.push(line);
  }
  if (current.length > 0) blocks.push(current);

  const entries: EduEntry[] = blocks.slice(0, 3).map((block) => {
    let degree      = "";
    let school      = "";
    let fieldOfStudy = "";
    let startYear   = "";
    let endYear     = "";
    let gpa         = "";

    for (const line of block) {
      // Extract years
      const years = line.match(/\b(19|20)\d{2}\b/g);
      if (years) {
        if (years.length >= 2) { startYear = years[0]; endYear = years[1]; }
        else                    endYear = years[0];
      }

      // GPA
      const gpaMatch = line.match(/\bgpa[:\s]+(\d+\.?\d*)/i);
      if (gpaMatch) { gpa = gpaMatch[1]; }

      if (DEGREE_RE.test(line)) {
        // Extract degree and possibly field
        const stripped = line.replace(/\b(19|20)\d{2}\b.*$/, "").trim();
        degree = stripped;

        const fieldMatch = stripped.match(/\bin\s+([^,\n]+)/i);
        if (fieldMatch) {
          fieldOfStudy = fieldMatch[1].trim();
          degree       = stripped.slice(0, fieldMatch.index).trim();
        }
      } else if (!school && line.length > 3 && !YEAR_RE.test(line)) {
        school = line.trim();
      }
    }

    return { degree, school, fieldOfStudy, startYear, endYear, gpa };
  });

  return entries.length > 0
    ? entries
    : [{ degree: "", school: "", fieldOfStudy: "", startYear: "", endYear: "", gpa: "" }];
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — parseResumeText
// ─────────────────────────────────────────────────────────────────────────────

export function parseResumeText(
  text: string
): Partial<ResumeFormData> & { skills: string[] } {
  const lines  = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const result: Partial<ResumeFormData> & { skills: string[] } = { skills: [] };

  // ── Contact fields (regex over the whole text) ───────────────────────────

  const emailMatch = text.match(/[\w._%+-]+@[\w.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) result.email = emailMatch[0];

  const phoneMatch = text.match(
    /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/
  );
  if (phoneMatch) result.phone = phoneMatch[0].trim();

  const linkedinMatch = text.match(/linkedin\.com\/in\/[\w-]+/i);
  if (linkedinMatch) result.linkedin = `https://www.${linkedinMatch[0]}`;

  const urlMatch = text.match(
    /https?:\/\/(?!.*linkedin)[\w.-]+\.[a-zA-Z]{2,}[\w./?=#%-]*/i
  );
  if (urlMatch) result.website = urlMatch[0];

  // ── Name (first short, non-contact line near the top) ───────────────────
  for (const line of lines.slice(0, 6)) {
    if (
      !line.match(/@|\d{3}|http|linkedin|github|twitter/i) &&
      line.length > 3 &&
      line.length < 60 &&
      !detectSectionHeader(line)
    ) {
      result.fullName = line.replace(/[^\w\s'"-]/g, "").trim();
      break;
    }
  }

  // ── Location (City, ST) ──────────────────────────────────────────────────
  const locMatch = text.match(/\b([A-Z][a-zA-Z\s]+),\s*([A-Z]{2})\b/);
  if (locMatch) result.location = locMatch[0];

  // ── Split text into named sections ──────────────────────────────────────
  const sections = extractSections(lines);

  // ── Summary ──────────────────────────────────────────────────────────────
  const summaryLines = sections["SUMMARY"] ?? [];
  if (summaryLines.length) result.summary = summaryLines.join(" ").trim();

  // ── Skills ───────────────────────────────────────────────────────────────
  const skillsLines = sections["SKILLS"] ?? [];
  if (skillsLines.length) {
    result.skills = skillsLines
      .join("\n")
      .split(/[,•\n|·\/]/)
      .map((s) => s.replace(BULLET_RE, "").trim())
      .filter((s) => s.length > 1 && s.length < 50);
  }

  // ── Experience ────────────────────────────────────────────────────────────
  const expLines = sections["EXPERIENCE"] ?? [];
  if (expLines.length) {
    const blocks  = splitIntoExpBlocks(expLines);
    const entries = blocks
      .map(parseExperienceBlock)
      .filter((e): e is ExpEntry => e !== null && (!!e.jobTitle || !!e.employer));

    if (entries.length > 0) {
      result.experience = entries.slice(0, 6);
    }
  }

  // ── Education ─────────────────────────────────────────────────────────────
  const eduLines = sections["EDUCATION"] ?? [];
  if (eduLines.length) {
    result.education = parseEducation(eduLines);
  }

  // ── Job title from first experience entry (if not already known) ─────────
  if (!result.jobTitle && result.experience?.[0]?.jobTitle) {
    result.jobTitle = result.experience[0].jobTitle;
  }

  return result;
}
