/**
 * lib/linkedin-wizard.ts
 *
 * Shared wizard state helpers for the LinkedIn Optimization flow.
 * State is stored in sessionStorage so it survives Next.js client-side
 * navigation between /linkedin → /linkedin/jobs → /linkedin/report
 * without needing a context provider or server state.
 */

export interface WizardJob {
  id:          string;
  title:       string;
  company:     string;
  description: string;
  source:      "manual" | "saved" | "matchReport";
  selected:    boolean;
}

export interface LinkedInWizardState {
  linkedInUrl:  string;
  jobs:         WizardJob[];
}

const KEY = "linkedin_wizard_state";

export function getWizardState(): LinkedInWizardState {
  if (typeof window === "undefined") return { linkedInUrl: "", jobs: [] };
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LinkedInWizardState) : { linkedInUrl: "", jobs: [] };
  } catch {
    return { linkedInUrl: "", jobs: [] };
  }
}

export function setWizardState(state: Partial<LinkedInWizardState>): void {
  if (typeof window === "undefined") return;
  const current = getWizardState();
  sessionStorage.setItem(KEY, JSON.stringify({ ...current, ...state }));
}

export function clearWizardState(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(KEY);
}

export function isValidLinkedInUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_%]+\/?/.test(url.trim());
}
