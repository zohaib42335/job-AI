"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  ChevronLeft,
  Pencil,
  CheckCircle2,
  MonitorPlay,
  Zap,
  User,
  Briefcase,
  Shield,
  SlidersHorizontal,
  Loader2,
  X,
  Save,
} from "lucide-react";
import { clsx } from "clsx";
import toast from "react-hot-toast";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface BasicDetails {
  resume: string;
  fullName: string;
  email: string;
  phone: string;
}

interface EmploymentStatus {
  employmentStatus: string;
  experienceLevel: string;
}

interface JobPreferences {
  jobType: string;
  preferredIndustries: string;
  expectedSalaryRange: string;
  earliestStartDate: string;
}

interface EligibilityPrefs {
  willingToRelocate: string;
  usWorkAuthorization: string;
  usDriversLicense: string;
  needUSVisaSponsorship: string;
  disabilityStatus: string;
  veteran: string;
  gender: string;
}

interface AdditionalPreferences {
  coverLetterStyle: string;
  linkedinUrl: string;
  portfolioUrl: string;
  notes: string;
}

interface PrefsData {
  applyMode: "manual" | "auto";
  basicDetails: BasicDetails;
  employmentStatus: EmploymentStatus;
  jobPreferences: JobPreferences;
  eligibility: EligibilityPrefs;
  additional: AdditionalPreferences;
  onboardingCompleted: boolean;
}

const DEFAULT_PREFS: PrefsData = {
  applyMode: "manual",
  basicDetails: {
    resume: "Mohammed_Default_Resume_resume",
    fullName: "Mohammed Hassan",
    email: "zahab2500@gmail.com",
    phone: "0610407507",
  },
  employmentStatus: {
    employmentStatus: "Unemployed - actively looking",
    experienceLevel: "Entry Level",
  },
  jobPreferences: {
    jobType: "Full-time",
    preferredIndustries: "Information Technology & Telecommunications",
    expectedSalaryRange: "Under $35k USD",
    earliestStartDate: "Immediately",
  },
  eligibility: {
    willingToRelocate: "Yes",
    usWorkAuthorization: "No",
    usDriversLicense: "No",
    needUSVisaSponsorship: "No",
    disabilityStatus: "No",
    veteran: "Yes",
    gender: "Male",
  },
  additional: {
    coverLetterStyle: "Professional",
    linkedinUrl: "",
    portfolioUrl: "",
    notes: "",
  },
  onboardingCompleted: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// Edit Modal Wrapper
// ─────────────────────────────────────────────────────────────────────────────

function EditModal({
  title,
  onClose,
  onSave,
  saving,
  children,
}: {
  title: string;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg z-10 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {children}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Form helpers
// ─────────────────────────────────────────────────────────────────────────────

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-white placeholder-gray-400";

const selectCls =
  "w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-white appearance-none";

// ─────────────────────────────────────────────────────────────────────────────
// Section card
// ─────────────────────────────────────────────────────────────────────────────

function SectionCard({
  icon: Icon,
  title,
  required,
  onEdit,
  rows,
}: {
  icon: React.ElementType;
  title: string;
  required?: boolean;
  onEdit: () => void;
  rows: { label: string; value: string }[];
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Icon className="h-4 w-4 text-blue-600" />
          </div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-bold text-gray-900">{title}</h2>
            {required && (
              <span className="text-[10px] font-bold text-red-500 uppercase tracking-wide">*</span>
            )}
          </div>
        </div>
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-blue-600 border border-blue-100 hover:bg-blue-50 transition-colors"
        >
          <Pencil className="h-3 w-3" /> Edit
        </button>
      </div>

      {/* Rows */}
      <div className="divide-y divide-gray-50">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex items-center gap-4 px-5 py-3">
            <span className="text-xs text-gray-400 w-44 flex-shrink-0 font-medium">{label}</span>
            <span className="text-xs font-semibold text-gray-800 flex-1">{value || "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Apply Mode Card
// ─────────────────────────────────────────────────────────────────────────────

function ApplyModeCard({
  mode,
  onChange,
  saving,
}: {
  mode: "manual" | "auto";
  onChange: (m: "manual" | "auto") => void;
  saving: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50">
        <h2 className="text-sm font-bold text-gray-900">Auto apply mode</h2>
      </div>
      <div className="p-5 flex gap-4">
        {/* Manual */}
        <button
          id="mode-manual"
          onClick={() => onChange("manual")}
          disabled={saving}
          className={clsx(
            "flex-1 rounded-2xl border-2 p-4 text-left transition-all group",
            mode === "manual"
              ? "border-blue-600 bg-blue-50"
              : "border-gray-200 hover:border-gray-300 bg-gray-50"
          )}
        >
          <div className="flex items-start justify-between mb-3">
            <div className={clsx(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              mode === "manual" ? "bg-white shadow-sm" : "bg-white"
            )}>
              <MonitorPlay className={clsx("h-5 w-5", mode === "manual" ? "text-blue-600" : "text-gray-400")} />
            </div>
            {mode === "manual" && (
              <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0" />
            )}
          </div>
          <p className={clsx("text-sm font-bold mb-1", mode === "manual" ? "text-blue-900" : "text-gray-700")}>
            Manual review mode
          </p>
          <p className={clsx("text-xs leading-relaxed", mode === "manual" ? "text-blue-700" : "text-gray-400")}>
            Review each application before it goes out. You get full control of what we send on your behalf by going through each application.
          </p>
        </button>

        {/* Auto */}
        <button
          id="mode-auto"
          onClick={() => onChange("auto")}
          disabled={saving}
          className={clsx(
            "flex-1 rounded-2xl border-2 p-4 text-left transition-all group",
            mode === "auto"
              ? "border-blue-600 bg-blue-50"
              : "border-gray-200 hover:border-gray-300 bg-gray-50"
          )}
        >
          <div className="flex items-start justify-between mb-3">
            <div className={clsx(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              mode === "auto" ? "bg-white shadow-sm" : "bg-white"
            )}>
              <Zap className={clsx("h-5 w-5", mode === "auto" ? "text-blue-600" : "text-gray-400")} />
            </div>
            {mode === "auto" && (
              <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0" />
            )}
          </div>
          <p className={clsx("text-sm font-bold mb-1", mode === "auto" ? "text-blue-900" : "text-gray-700")}>
            Auto-submit mode
          </p>
          <p className={clsx("text-xs leading-relaxed", mode === "auto" ? "text-blue-700" : "text-gray-400")}>
            Once everything is set up correctly, you can keep clicking Auto Apply on any job listing and we&apos;ll automatically keep sending out applications for you.
          </p>
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Yes / No select helper
// ─────────────────────────────────────────────────────────────────────────────

function YesNoSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select className={selectCls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="Yes">Yes</option>
      <option value="No">No</option>
    </select>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

type ModalKey =
  | "basicDetails"
  | "employmentStatus"
  | "jobPreferences"
  | "eligibility"
  | "additional"
  | null;

export default function PreferencesPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<PrefsData>(DEFAULT_PREFS);
  const [openModal, setOpenModal] = useState<ModalKey>(null);

  // Draft states for each modal
  const [draftBasic, setDraftBasic] = useState<BasicDetails>(DEFAULT_PREFS.basicDetails);
  const [draftEmployment, setDraftEmployment] = useState<EmploymentStatus>(DEFAULT_PREFS.employmentStatus);
  const [draftJobPrefs, setDraftJobPrefs] = useState<JobPreferences>(DEFAULT_PREFS.jobPreferences);
  const [draftEligibility, setDraftEligibility] = useState<EligibilityPrefs>(DEFAULT_PREFS.eligibility);
  const [draftAdditional, setDraftAdditional] = useState<AdditionalPreferences>(DEFAULT_PREFS.additional);

  // ── Load prefs from Firestore ────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "autoApplyPreferences", user.uid))
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<PrefsData>;
          setPrefs((prev) => ({ ...prev, ...data }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  // ── Save helper ──────────────────────────────────────────────────────────────
  const savePrefs = useCallback(
    async (patch: Partial<PrefsData>) => {
      if (!user) return;
      setSaving(true);
      try {
        const updated = { ...prefs, ...patch, onboardingCompleted: true };
        await setDoc(doc(db, "autoApplyPreferences", user.uid), updated, { merge: true });
        setPrefs(updated);
        toast.success("Preferences saved!");
        setOpenModal(null);
      } catch {
        toast.error("Failed to save. Please try again.");
      } finally {
        setSaving(false);
      }
    },
    [prefs, user]
  );

  // ── Apply mode toggle (no modal) ─────────────────────────────────────────────
  const handleModeChange = async (mode: "manual" | "auto") => {
    setSaving(true);
    try {
      await setDoc(
        doc(db, "autoApplyPreferences", user!.uid),
        { applyMode: mode },
        { merge: true }
      );
      setPrefs((p) => ({ ...p, applyMode: mode }));
      toast.success(`Switched to ${mode === "manual" ? "Manual Review" : "Auto-Submit"} mode`);
    } catch {
      toast.error("Failed to update mode.");
    } finally {
      setSaving(false);
    }
  };

  // ── Open modal with fresh draft ──────────────────────────────────────────────
  const openEdit = (key: ModalKey) => {
    if (key === "basicDetails") setDraftBasic({ ...prefs.basicDetails });
    if (key === "employmentStatus") setDraftEmployment({ ...prefs.employmentStatus });
    if (key === "jobPreferences") setDraftJobPrefs({ ...prefs.jobPreferences });
    if (key === "eligibility") setDraftEligibility({ ...prefs.eligibility });
    if (key === "additional") setDraftAdditional({ ...prefs.additional });
    setOpenModal(key);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
          aria-label="Go back"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-xl font-black text-gray-900">Auto Apply preferences</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Configure how JobAI applies to jobs on your behalf
          </p>
        </div>
      </div>

      {/* ── Apply Mode ── */}
      <ApplyModeCard
        mode={prefs.applyMode}
        onChange={handleModeChange}
        saving={saving}
      />

      {/* ── Basic Details ── */}
      <SectionCard
        icon={User}
        title="Basic details"
        required
        onEdit={() => openEdit("basicDetails")}
        rows={[
          { label: "Resume", value: prefs.basicDetails.resume },
          { label: "Full Name", value: prefs.basicDetails.fullName },
          { label: "Email", value: prefs.basicDetails.email },
          { label: "Phone", value: prefs.basicDetails.phone },
        ]}
      />

      {/* ── Employment Status ── */}
      <SectionCard
        icon={Briefcase}
        title="Employment status"
        required
        onEdit={() => openEdit("employmentStatus")}
        rows={[
          { label: "Employment Status", value: prefs.employmentStatus.employmentStatus },
          { label: "Experience Level", value: prefs.employmentStatus.experienceLevel },
        ]}
      />

      {/* ── Job Preferences ── */}
      <SectionCard
        icon={SlidersHorizontal}
        title="Job preferences"
        required
        onEdit={() => openEdit("jobPreferences")}
        rows={[
          { label: "Job Type", value: prefs.jobPreferences.jobType },
          { label: "Preferred Industries", value: prefs.jobPreferences.preferredIndustries },
          { label: "Expected Salary (Annual)", value: prefs.jobPreferences.expectedSalaryRange },
          { label: "Earliest Start Date", value: prefs.jobPreferences.earliestStartDate },
        ]}
      />

      {/* ── Eligibility & Preferences ── */}
      <SectionCard
        icon={Shield}
        title="Eligibility & Preferences"
        required
        onEdit={() => openEdit("eligibility")}
        rows={[
          { label: "Willing to Relocate", value: prefs.eligibility.willingToRelocate },
          { label: "U.S. Work Authorization", value: prefs.eligibility.usWorkAuthorization },
          { label: "U.S. Driver's License", value: prefs.eligibility.usDriversLicense },
          { label: "Need U.S. Visa Sponsorship", value: prefs.eligibility.needUSVisaSponsorship },
          { label: "Disability Status", value: prefs.eligibility.disabilityStatus },
          { label: "Veteran", value: prefs.eligibility.veteran },
          { label: "Gender", value: prefs.eligibility.gender },
        ]}
      />

      {/* ── Additional Preferences ── */}
      <SectionCard
        icon={SlidersHorizontal}
        title="Additional preferences"
        onEdit={() => openEdit("additional")}
        rows={[
          { label: "Cover Letter Style", value: prefs.additional.coverLetterStyle },
          { label: "LinkedIn URL", value: prefs.additional.linkedinUrl },
          { label: "Portfolio URL", value: prefs.additional.portfolioUrl },
          { label: "Notes / Special Instructions", value: prefs.additional.notes },
        ]}
      />

      {/* ════════════════════════════════════ MODALS ════════════════════════════════════ */}

      {/* ── Basic Details Modal ── */}
      {openModal === "basicDetails" && (
        <EditModal
          title="Edit Basic Details"
          onClose={() => setOpenModal(null)}
          onSave={() => savePrefs({ basicDetails: draftBasic })}
          saving={saving}
        >
          <FormField label="Resume Label">
            <input
              className={inputCls}
              value={draftBasic.resume}
              onChange={(e) => setDraftBasic((d) => ({ ...d, resume: e.target.value }))}
              placeholder="e.g. Mohammed_Default_Resume"
            />
          </FormField>
          <FormField label="Full Name">
            <input
              className={inputCls}
              value={draftBasic.fullName}
              onChange={(e) => setDraftBasic((d) => ({ ...d, fullName: e.target.value }))}
              placeholder="Your full name"
            />
          </FormField>
          <FormField label="Email">
            <input
              type="email"
              className={inputCls}
              value={draftBasic.email}
              onChange={(e) => setDraftBasic((d) => ({ ...d, email: e.target.value }))}
              placeholder="you@example.com"
            />
          </FormField>
          <FormField label="Phone">
            <input
              type="tel"
              className={inputCls}
              value={draftBasic.phone}
              onChange={(e) => setDraftBasic((d) => ({ ...d, phone: e.target.value }))}
              placeholder="+1 555 000 0000"
            />
          </FormField>
        </EditModal>
      )}

      {/* ── Employment Status Modal ── */}
      {openModal === "employmentStatus" && (
        <EditModal
          title="Edit Employment Status"
          onClose={() => setOpenModal(null)}
          onSave={() => savePrefs({ employmentStatus: draftEmployment })}
          saving={saving}
        >
          <FormField label="Employment Status">
            <select
              className={selectCls}
              value={draftEmployment.employmentStatus}
              onChange={(e) => setDraftEmployment((d) => ({ ...d, employmentStatus: e.target.value }))}
            >
              <option>Employed - actively looking</option>
              <option>Employed - open to opportunities</option>
              <option>Unemployed - actively looking</option>
              <option>Student - seeking internship</option>
              <option>Student - seeking full-time</option>
              <option>Freelancer / Contractor</option>
            </select>
          </FormField>
          <FormField label="Experience Level">
            <select
              className={selectCls}
              value={draftEmployment.experienceLevel}
              onChange={(e) => setDraftEmployment((d) => ({ ...d, experienceLevel: e.target.value }))}
            >
              <option>Entry Level</option>
              <option>Junior (1-2 years)</option>
              <option>Mid-Level (3-5 years)</option>
              <option>Senior (6-9 years)</option>
              <option>Lead / Principal (10+ years)</option>
              <option>Manager / Director</option>
              <option>Executive / C-Suite</option>
            </select>
          </FormField>
        </EditModal>
      )}

      {/* ── Job Preferences Modal ── */}
      {openModal === "jobPreferences" && (
        <EditModal
          title="Edit Job Preferences"
          onClose={() => setOpenModal(null)}
          onSave={() => savePrefs({ jobPreferences: draftJobPrefs })}
          saving={saving}
        >
          <FormField label="Job Type">
            <select
              className={selectCls}
              value={draftJobPrefs.jobType}
              onChange={(e) => setDraftJobPrefs((d) => ({ ...d, jobType: e.target.value }))}
            >
              <option>Full-time</option>
              <option>Part-time</option>
              <option>Contract</option>
              <option>Internship</option>
              <option>Temporary</option>
              <option>Volunteer</option>
            </select>
          </FormField>
          <FormField label="Preferred Industries">
            <input
              className={inputCls}
              value={draftJobPrefs.preferredIndustries}
              onChange={(e) => setDraftJobPrefs((d) => ({ ...d, preferredIndustries: e.target.value }))}
              placeholder="e.g. Information Technology, Finance"
            />
          </FormField>
          <FormField label="Expected Salary Range (Annual)">
            <select
              className={selectCls}
              value={draftJobPrefs.expectedSalaryRange}
              onChange={(e) => setDraftJobPrefs((d) => ({ ...d, expectedSalaryRange: e.target.value }))}
            >
              <option>Under $35k USD</option>
              <option>$35k – $50k USD</option>
              <option>$50k – $75k USD</option>
              <option>$75k – $100k USD</option>
              <option>$100k – $150k USD</option>
              <option>$150k+ USD</option>
              <option>Negotiable</option>
            </select>
          </FormField>
          <FormField label="Earliest Start Date">
            <select
              className={selectCls}
              value={draftJobPrefs.earliestStartDate}
              onChange={(e) => setDraftJobPrefs((d) => ({ ...d, earliestStartDate: e.target.value }))}
            >
              <option>Immediately</option>
              <option>Within 2 weeks</option>
              <option>Within 1 month</option>
              <option>Within 3 months</option>
              <option>Flexible</option>
            </select>
          </FormField>
        </EditModal>
      )}

      {/* ── Eligibility Modal ── */}
      {openModal === "eligibility" && (
        <EditModal
          title="Edit Eligibility & Preferences"
          onClose={() => setOpenModal(null)}
          onSave={() => savePrefs({ eligibility: draftEligibility })}
          saving={saving}
        >
          <FormField label="Willing to Relocate">
            <YesNoSelect
              value={draftEligibility.willingToRelocate}
              onChange={(v) => setDraftEligibility((d) => ({ ...d, willingToRelocate: v }))}
            />
          </FormField>
          <FormField label="U.S. Work Authorization">
            <YesNoSelect
              value={draftEligibility.usWorkAuthorization}
              onChange={(v) => setDraftEligibility((d) => ({ ...d, usWorkAuthorization: v }))}
            />
          </FormField>
          <FormField label="U.S. Driver&apos;s License">
            <YesNoSelect
              value={draftEligibility.usDriversLicense}
              onChange={(v) => setDraftEligibility((d) => ({ ...d, usDriversLicense: v }))}
            />
          </FormField>
          <FormField label="Need U.S. Visa Sponsorship">
            <YesNoSelect
              value={draftEligibility.needUSVisaSponsorship}
              onChange={(v) => setDraftEligibility((d) => ({ ...d, needUSVisaSponsorship: v }))}
            />
          </FormField>
          <FormField label="Disability Status">
            <YesNoSelect
              value={draftEligibility.disabilityStatus}
              onChange={(v) => setDraftEligibility((d) => ({ ...d, disabilityStatus: v }))}
            />
          </FormField>
          <FormField label="Veteran">
            <YesNoSelect
              value={draftEligibility.veteran}
              onChange={(v) => setDraftEligibility((d) => ({ ...d, veteran: v }))}
            />
          </FormField>
          <FormField label="Gender">
            <select
              className={selectCls}
              value={draftEligibility.gender}
              onChange={(e) => setDraftEligibility((d) => ({ ...d, gender: e.target.value }))}
            >
              <option>Male</option>
              <option>Female</option>
              <option>Non-binary</option>
              <option>Prefer not to say</option>
            </select>
          </FormField>
        </EditModal>
      )}

      {/* ── Additional Preferences Modal ── */}
      {openModal === "additional" && (
        <EditModal
          title="Edit Additional Preferences"
          onClose={() => setOpenModal(null)}
          onSave={() => savePrefs({ additional: draftAdditional })}
          saving={saving}
        >
          <FormField label="Cover Letter Style">
            <select
              className={selectCls}
              value={draftAdditional.coverLetterStyle}
              onChange={(e) => setDraftAdditional((d) => ({ ...d, coverLetterStyle: e.target.value }))}
            >
              <option>Professional</option>
              <option>Friendly</option>
              <option>Concise</option>
              <option>Creative</option>
            </select>
          </FormField>
          <FormField label="LinkedIn URL">
            <input
              type="url"
              className={inputCls}
              value={draftAdditional.linkedinUrl}
              onChange={(e) => setDraftAdditional((d) => ({ ...d, linkedinUrl: e.target.value }))}
              placeholder="https://linkedin.com/in/yourprofile"
            />
          </FormField>
          <FormField label="Portfolio / Personal Website">
            <input
              type="url"
              className={inputCls}
              value={draftAdditional.portfolioUrl}
              onChange={(e) => setDraftAdditional((d) => ({ ...d, portfolioUrl: e.target.value }))}
              placeholder="https://yourportfolio.com"
            />
          </FormField>
          <FormField label="Notes / Special Instructions">
            <textarea
              className={clsx(inputCls, "resize-none")}
              rows={3}
              value={draftAdditional.notes}
              onChange={(e) => setDraftAdditional((d) => ({ ...d, notes: e.target.value }))}
              placeholder="Any extra context for your applications…"
            />
          </FormField>
        </EditModal>
      )}
    </div>
  );
}
