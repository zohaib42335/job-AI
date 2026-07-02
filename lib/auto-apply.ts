/**
 * lib/auto-apply.ts
 *
 * Firestore helpers for the Auto Apply feature.
 *
 * Collections:
 *   autoApplyPreferences/{userId}
 *   autoApplyCredits/{userId}
 *   applications/{userId}/items/{applicationId}
 */

import {
  doc, getDoc, setDoc, updateDoc,
  collection, addDoc, getDocs,
  query, where, runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AutoApplyMode = "manual" | "auto-submit";
export type ApplicationStatus =
  | "autofilling"
  | "pending_review"
  | "submitting"
  | "applied"
  | "failed";

export interface AutoApplyPreferences {
  // Step 1
  resumeId:   string;
  firstName:  string;
  lastName:   string;
  email:      string;
  phone:      string;
  // Step 2
  employmentStatus: string;
  experienceLevel:  string;
  // Step 3
  jobTypes:      string[];
  industries:    string[];
  expectedSalary: string;
  startDate:      string;
  // Step 4
  willingToRelocate:  string;
  usWorkAuth:         string;
  usDriversLicense:   string;
  visaSponsorship:    string;
  disabilityStatus:   string;
  veteran:            string;
  gender:             string;
  // Step 5
  applyMode:           AutoApplyMode;
  agreedToTerms:       boolean;
  onboardingCompleted: boolean;
  updatedAt?:          unknown;
}

export interface ApplicationRecord {
  id:           string;
  userId:       string;
  jobId:        string;
  jobTitle:     string;
  company:      string;
  location:     string;
  jobType:      string;
  applyUrl:     string;
  resumeId:     string;
  firstName:    string;
  lastName:     string;
  email:        string;
  phone:        string;
  coverLetter:  string;
  matchScore:   number;
  status:       ApplicationStatus;
  createdAt:    unknown;
  submittedAt?: unknown;
  failReason?:  string;
}

export interface ApplicationStats {
  autofilling:    number;
  pending_review: number;
  submitting:     number;
  applied:        number;
  failed:         number;
  total:          number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Preferences
// ─────────────────────────────────────────────────────────────────────────────

export async function getOrCreatePreferences(
  userId: string
): Promise<AutoApplyPreferences | null> {
  const ref  = doc(db, "autoApplyPreferences", userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as AutoApplyPreferences;
}

export async function updatePreferences(
  userId:   string,
  stepData: Partial<AutoApplyPreferences>
): Promise<void> {
  const ref = doc(db, "autoApplyPreferences", userId);
  await setDoc(ref, { ...stepData, updatedAt: serverTimestamp() }, { merge: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Credits
// ─────────────────────────────────────────────────────────────────────────────

export async function getCredits(userId: string): Promise<number> {
  const ref  = doc(db, "autoApplyCredits", userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return 0;
  return (snap.data() as { credits: number }).credits ?? 0;
}

/**
 * Atomically decrement credits. Throws if credits <= 0.
 */
export async function deductCredit(userId: string): Promise<void> {
  const ref = doc(db, "autoApplyCredits", userId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? ((snap.data() as { credits: number }).credits ?? 0) : 0;
    if (current <= 0) throw new Error("Insufficient credits");
    tx.set(ref, { credits: current - 1 }, { merge: true });
  });
}

/**
 * Refund 1 credit when an application fails due to a listing issue.
 * TODO: wire to Stripe webhook when real payments are added.
 */
export async function refundCredit(userId: string): Promise<void> {
  const ref = doc(db, "autoApplyCredits", userId);
  await runTransaction(db, async (tx) => {
    const snap    = await tx.get(ref);
    const current = snap.exists() ? ((snap.data() as { credits: number }).credits ?? 0) : 0;
    tx.set(ref, { credits: current + 1 }, { merge: true });
  });
}

/**
 * Add credits (used by Top Up flow).
 * TODO: replace direct write with a Stripe checkout session.
 */
export async function topUpCredits(userId: string, amount: number): Promise<void> {
  const ref = doc(db, "autoApplyCredits", userId);
  await runTransaction(db, async (tx) => {
    const snap    = await tx.get(ref);
    const current = snap.exists() ? ((snap.data() as { credits: number }).credits ?? 0) : 0;
    tx.set(ref, { credits: current + amount, lastTopUp: serverTimestamp() }, { merge: true });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Applications CRUD
// ─────────────────────────────────────────────────────────────────────────────

function appCol(userId: string) {
  return collection(db, "applications", userId, "items");
}

export async function createApplication(
  userId: string,
  data:   Omit<ApplicationRecord, "id" | "createdAt">
): Promise<string> {
  const ref = await addDoc(appCol(userId), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateApplicationStatus(
  userId:        string,
  applicationId: string,
  status:        ApplicationStatus,
  extra?:        Partial<ApplicationRecord>
): Promise<void> {
  const ref = doc(db, "applications", userId, "items", applicationId);
  await updateDoc(ref, {
    status,
    ...extra,
    ...(status === "applied" ? { submittedAt: serverTimestamp() } : {}),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────────────────────────────────────

export async function getApplicationStats(userId: string): Promise<ApplicationStats> {
  const snap  = await getDocs(appCol(userId));
  const stats: ApplicationStats = {
    autofilling: 0, pending_review: 0,
    submitting: 0, applied: 0, failed: 0, total: 0,
  };
  snap.docs.forEach(d => {
    const s = (d.data() as ApplicationRecord).status;
    if (s in stats) stats[s as keyof ApplicationStats]++;
    stats.total++;
  });
  return stats;
}
