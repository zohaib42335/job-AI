"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { getUserResumes, saveResume } from "@/lib/resume";
import type { ResumeRecord } from "@/lib/resume";
import type { ResumeFormData } from "@/app/resume-builder/types";
import {
  Info, Eye, Upload, ChevronLeft, ChevronRight,
  CheckCircle2, Loader2,
} from "lucide-react";
import { clsx } from "clsx";
import toast from "react-hot-toast";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface WizardData {
  // Step 1 — Basic Details
  resumeId:    string;
  firstName:   string;
  lastName:    string;
  email:       string;
  phone:       string;
  // Step 2 — Employment
  employmentStatus: string;
  experienceLevel:  string;
  // Step 3 — Job Preferences
  jobTypes:         string[];
  industries:       string[];
  expectedSalary:   string;
  startDate:        string;
  // Step 4 — Compliance
  willingToRelocate: string;
  usWorkAuth:        string;
  usDriversLicense:  string;
  visaSponsorship:   string;
  disabilityStatus:  string;
  veteran:           string;
  gender:            string;
  // Step 5 — Mode
  applyMode: "manual" | "auto";
  agreedToTerms: boolean;
}

const EMPTY: WizardData = {
  resumeId: "", firstName: "", lastName: "", email: "", phone: "",
  employmentStatus: "", experienceLevel: "",
  jobTypes: [], industries: [], expectedSalary: "", startDate: "",
  willingToRelocate: "", usWorkAuth: "", usDriversLicense: "",
  visaSponsorship: "", disabilityStatus: "", veteran: "", gender: "",
  applyMode: "manual", agreedToTerms: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// Option lists
// ─────────────────────────────────────────────────────────────────────────────

const EMPLOYMENT_STATUSES = [
  "Unemployed – actively looking",
  "Unemployed – browsing",
  "Employed – looking to switch",
  "Employed – open to opportunities",
  "Student",
  "Freelancer / Self-employed",
];
const EXPERIENCE_LEVELS = [
  "Entry Level",
  "Junior / Associate",
  "Mid-Level",
  "Senior / Lead",
  "Director / Manager",
  "Executive / C-Suite",
];
const JOB_TYPES           = ["Full-time", "Part-time", "Contract/Freelance"];
const INDUSTRIES          = [
  "Technology", "Finance", "Healthcare", "Marketing", "Education",
  "Engineering", "Design", "Sales", "Legal", "Human Resources",
  "Media & Entertainment", "Retail", "Manufacturing", "Consulting",
];
const SALARY_RANGES = [
  "Under $30K USD",
  "$30K–40K USD",
  "$40K–50K USD",
  "$50K–60K USD",
  "$60K–70K USD",
  "$70K–80K USD",
  "$80K–100K USD",
  "$100K–120K USD",
  "$120K–150K USD",
  "$150K+ USD",
];
const START_DATES   = ["Immediately", "2 weeks", "1 month", "2-3 months", "3+ months"];
const YES_NO        = ["Yes", "No"];
const YES_NO_PNS    = ["Yes", "No", "Prefer not to say"];
const GENDER_OPTS   = ["Male", "Female", "Non-binary", "Prefer not to say"];

const TOTAL_STEPS = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Shared: Step header
// ─────────────────────────────────────────────────────────────────────────────

function StepHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="text-center mb-8">
      <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 mb-3">
        <Info className="h-3.5 w-3.5" />
        Set up your Auto Apply preferences
      </div>
      <h1 className="text-2xl font-black text-gray-900 mb-2 leading-tight">{title}</h1>
      {subtitle && <p className="text-sm text-gray-500 leading-relaxed">{subtitle}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: Pill toggle button
// ─────────────────────────────────────────────────────────────────────────────

function PillToggle({
  label, selected, onClick,
}: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "px-4 py-2 rounded-full text-sm font-semibold border-2 transition-all",
        selected
          ? "bg-blue-600 border-blue-600 text-white shadow-sm"
          : "bg-white border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600"
      )}
    >
      {selected && <CheckCircle2 className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />}
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: Field label
// ─────────────────────────────────────────────────────────────────────────────

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: Select input
// ─────────────────────────────────────────────────────────────────────────────

function Select({
  value, onChange, options, placeholder,
}: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: Text input
// ─────────────────────────────────────────────────────────────────────────────

function TextInput({
  value, onChange, placeholder, type = "text",
}: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation buttons
// ─────────────────────────────────────────────────────────────────────────────

function NavButtons({
  step, onBack, onNext, nextLabel = "Save & Continue",
  nextDisabled = false, saving = false,
}: {
  step: number; onBack: () => void; onNext: () => void;
  nextLabel?: string; nextDisabled?: boolean; saving?: boolean;
}) {
  return (
    <div className="flex items-center justify-between mt-8">
      {step > 1 ? (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
      ) : <div />}

      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled || saving}
        className={clsx(
          "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
          nextDisabled || saving
            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
            : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md"
        )}
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {nextLabel}
        {!saving && <ChevronRight className="h-4 w-4" />}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Basic Details
// ─────────────────────────────────────────────────────────────────────────────

function Step1({
  data, onChange, resumes, onNext, onResumeUploaded, userId,
}: {
  data: WizardData;
  onChange: (patch: Partial<WizardData>) => void;
  resumes: ResumeRecord[];
  onNext: () => void;
  onResumeUploaded: (r: ResumeRecord) => void;
  userId: string;
}) {
  const canContinue = !!data.firstName.trim() && !!data.lastName.trim() && !!data.email.trim();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleResumeChange = (id: string) => {
    onChange({ resumeId: id });
    const r = resumes.find(r => r.id === id);
    if (!r) return;
    const f = r.formData;
    const parts = (f.fullName ?? "").split(" ");
    onChange({
      resumeId:  id,
      firstName: parts[0] ?? "",
      lastName:  parts.slice(1).join(" "),
      email:     f.email   ?? data.email,
      phone:     f.phone   ?? data.phone,
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    try {
      // Send the file as multipart FormData — the API expects formData.get("file")
      const formPayload = new FormData();
      formPayload.append("file", file);

      const parseRes = await fetch("/api/parse-resume", {
        method: "POST",
        body:   formPayload,
      });

      const json = (await parseRes.json()) as {
        success?: boolean;
        data?: { fullName?: string; email?: string; phone?: string; jobTitle?: string; summary?: string };
        error?: string;
      };

      if (!parseRes.ok || !json.success || !json.data) {
        throw new Error(json.error ?? "Failed to parse resume.");
      }

      const parsed = json.data;

      // Build formData matching ResumeFormData shape (all required fields)
      const formData: ResumeFormData = {
        fullName:   parsed.fullName ?? "",
        email:      parsed.email    ?? "",
        phone:      parsed.phone    ?? "",
        jobTitle:   parsed.jobTitle ?? "",
        summary:    parsed.summary  ?? "",
        location:   "",
        linkedin:   "",
        website:    "",
        experience: [],
        education:  [],
        certifications: [],
        languages:  [],
      };

      // Save to Firestore — saveResume returns the new document ID
      const newId = await saveResume(userId, formData, []);

      // Build a local ResumeRecord from the returned ID
      const saved: ResumeRecord = {
        id:        newId,
        name:      file.name.replace(/\.[^.]+$/, ""),
        skills:    [],
        formData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      onResumeUploaded(saved);

      // Auto-select and pre-fill from the parsed fields
      const parts = (parsed.fullName ?? "").split(" ");
      onChange({
        resumeId:  newId,
        firstName: parts[0] || data.firstName,
        lastName:  parts.slice(1).join(" ") || data.lastName,
        email:     parsed.email || data.email,
        phone:     parsed.phone || data.phone,
      });
      toast.success(`"${saved.name}" uploaded and selected!`);
    } catch {
      toast.error("Failed to parse resume. Try a plain-text or Word file.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <StepHeader
        title="Let's start with your basic details"
        subtitle="Set this up once and we'll auto-fill applications for you."
      />

      <div className="space-y-5">
        {/* Resume selector */}
        <div>
          <FieldLabel label="Choose a resume or upload one" required />
        <div className="flex items-center gap-2">
            <select
              value={data.resumeId}
              onChange={e => handleResumeChange(e.target.value)}
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Select a resume…</option>
              {resumes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            {data.resumeId && (
              <button
                type="button"
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Eye className="h-4 w-4" /> Preview
              </button>
            )}
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              className="hidden"
              onChange={handleUpload}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-blue-200 text-xs font-bold text-blue-600 hover:bg-blue-50 disabled:opacity-50 transition-colors"
            >
              {uploading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Upload className="h-4 w-4" />}
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">We&apos;ll use your resume to fill out applications.</p>
        </div>

        {/* Name row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel label="First Name" required />
            <TextInput value={data.firstName} onChange={v => onChange({ firstName: v })} placeholder="John" />
          </div>
          <div>
            <FieldLabel label="Last Name" required />
            <TextInput value={data.lastName}  onChange={v => onChange({ lastName: v })}  placeholder="Smith" />
          </div>
        </div>

        {/* Email */}
        <div>
          <FieldLabel label="Email" required />
          <TextInput type="email" value={data.email} onChange={v => onChange({ email: v })} placeholder="john@example.com" />
        </div>

        {/* Phone */}
        <div>
          <FieldLabel label="Phone" />
          <TextInput type="tel" value={data.phone} onChange={v => onChange({ phone: v })} placeholder="+1 (555) 000-0000" />
        </div>
      </div>

      <NavButtons step={1} onBack={() => {}} onNext={onNext} nextDisabled={!canContinue} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Employment Status
// ─────────────────────────────────────────────────────────────────────────────

function Step2({
  data, onChange, onBack, onNext,
}: { data: WizardData; onChange: (p: Partial<WizardData>) => void; onBack: () => void; onNext: () => void }) {
  const canContinue = !!data.employmentStatus && !!data.experienceLevel;

  return (
    <>
      <StepHeader
        title="What is your current employment status?"
        subtitle="Tell us about where you are in your career right now."
      />

      <div className="space-y-5">
        <div>
          <FieldLabel label="Employment Status" required />
          <Select
            value={data.employmentStatus}
            onChange={v => onChange({ employmentStatus: v })}
            options={EMPLOYMENT_STATUSES}
            placeholder="Select status…"
          />
        </div>
        <div>
          <FieldLabel label="Experience Level" required />
          <Select
            value={data.experienceLevel}
            onChange={v => onChange({ experienceLevel: v })}
            options={EXPERIENCE_LEVELS}
            placeholder="Select level…"
          />
        </div>
      </div>

      <NavButtons step={2} onBack={onBack} onNext={onNext} nextDisabled={!canContinue} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — Job Preferences
// ─────────────────────────────────────────────────────────────────────────────

function Step3({
  data, onChange, onBack, onNext,
}: { data: WizardData; onChange: (p: Partial<WizardData>) => void; onBack: () => void; onNext: () => void }) {
  const toggleJobType = (t: string) =>
    onChange({ jobTypes: data.jobTypes.includes(t) ? data.jobTypes.filter(x => x !== t) : [...data.jobTypes, t] });
  const toggleIndustry = (ind: string) =>
    onChange({ industries: data.industries.includes(ind) ? data.industries.filter(x => x !== ind) : [...data.industries, ind] });

  const canContinue = data.jobTypes.length > 0 && data.industries.length > 0 && !!data.expectedSalary && !!data.startDate;

  return (
    <>
      <StepHeader
        title="What are your job preferences?"
        subtitle="Tell us what kind of work and compensation you're looking for."
      />

      <div className="space-y-6">
        {/* Job type */}
        <div>
          <FieldLabel label="Job type" required />
          <p className="text-xs text-gray-400 mb-2">Select one or more</p>
          <div className="flex flex-wrap gap-2">
            {JOB_TYPES.map(t => (
              <PillToggle key={t} label={t} selected={data.jobTypes.includes(t)} onClick={() => toggleJobType(t)} />
            ))}
          </div>
        </div>

        {/* Industries */}
        <div>
          <FieldLabel label="Preferred Industries" required />
          <div className="flex flex-wrap gap-1.5">
            {INDUSTRIES.map(ind => (
              <PillToggle key={ind} label={ind} selected={data.industries.includes(ind)} onClick={() => toggleIndustry(ind)} />
            ))}
          </div>
        </div>

        {/* Salary */}
        <div>
          <FieldLabel label="Expected Salary (Annual)" required />
          <Select
            value={data.expectedSalary}
            onChange={v => onChange({ expectedSalary: v })}
            options={SALARY_RANGES}
            placeholder="Select range…"
          />
        </div>

        {/* Start date */}
        <div>
          <FieldLabel label="Earliest Start Date" required />
          <Select
            value={data.startDate}
            onChange={v => onChange({ startDate: v })}
            options={START_DATES}
            placeholder="Select…"
          />
        </div>
      </div>

      <NavButtons step={3} onBack={onBack} onNext={onNext} nextDisabled={!canContinue} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — Compliance / Extra Details
// ─────────────────────────────────────────────────────────────────────────────

type PillGroupProps = { label: string; options: string[]; value: string; onChange: (v: string) => void };
function PillGroup({ label, options, value, onChange }: PillGroupProps) {
  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(o => (
          <PillToggle key={o} label={o} selected={value === o} onClick={() => onChange(value === o ? "" : o)} />
        ))}
      </div>
    </div>
  );
}

function Step4({
  data, onChange, onBack, onNext,
}: { data: WizardData; onChange: (p: Partial<WizardData>) => void; onBack: () => void; onNext: () => void }) {
  return (
    <>
      <StepHeader title="A few more things about you" />

      <div className="space-y-5">
        <PillGroup label="Willing to Relocate"       options={YES_NO}    value={data.willingToRelocate} onChange={v => onChange({ willingToRelocate: v })} />
        <PillGroup label="U.S. Work Authorization"   options={YES_NO_PNS} value={data.usWorkAuth}        onChange={v => onChange({ usWorkAuth: v })} />
        <PillGroup label="US Driver's License"       options={YES_NO_PNS} value={data.usDriversLicense}  onChange={v => onChange({ usDriversLicense: v })} />
        <PillGroup label="Need U.S. Visa Sponsorship" options={YES_NO_PNS} value={data.visaSponsorship}   onChange={v => onChange({ visaSponsorship: v })} />
        <PillGroup label="Disability Status"         options={YES_NO_PNS} value={data.disabilityStatus}  onChange={v => onChange({ disabilityStatus: v })} />
        <PillGroup label="Veteran"                   options={YES_NO_PNS} value={data.veteran}            onChange={v => onChange({ veteran: v })} />

        <div>
          <FieldLabel label="Gender" />
          <Select
            value={data.gender}
            onChange={v => onChange({ gender: v })}
            options={GENDER_OPTS}
            placeholder="Select…"
          />
        </div>
      </div>

      <NavButtons step={4} onBack={onBack} onNext={onNext} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5 — Apply Mode
// ─────────────────────────────────────────────────────────────────────────────

function ModeCard({
  mode, selected, onSelect, recommended,
}: { mode: "manual" | "auto"; selected: boolean; onSelect: () => void; recommended?: boolean }) {
  const isManual = mode === "manual";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        "relative flex-1 text-left rounded-2xl border-2 p-5 transition-all",
        selected ? "border-blue-600 bg-blue-50/40 shadow-md" : "border-gray-200 bg-white hover:border-blue-300"
      )}
    >
      {recommended && (
        <span className="absolute top-3 right-3 text-[10px] font-black bg-green-500 text-white px-2 py-0.5 rounded-full">
          RECOMMENDED
        </span>
      )}

      {/* Illustration */}
      <div className="w-16 h-16 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-4 relative">
        {isManual ? (
          <>
            <div className="w-8 h-10 rounded border border-gray-300 bg-white flex flex-col gap-1 p-1">
              {[1,2,3].map(i => <div key={i} className="h-1 bg-gray-200 rounded-full w-full" />)}
            </div>
            <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
              <CheckCircle2 className="h-3.5 w-3.5 text-white" />
            </div>
          </>
        ) : (
          <>
            <div className="w-8 h-10 rounded border border-gray-300 bg-white flex flex-col gap-1 p-1">
              {[1,2,3].map(i => <div key={i} className="h-1 bg-gray-200 rounded-full w-full" />)}
            </div>
            <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
              <span className="text-white text-[10px] font-black">⚡</span>
            </div>
          </>
        )}
      </div>

      {/* Radio + label */}
      <div className="flex items-center gap-2 mb-2">
        <div className={clsx(
          "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
          selected ? "border-blue-600" : "border-gray-300"
        )}>
          {selected && <div className="w-2 h-2 rounded-full bg-blue-600" />}
        </div>
        <p className="text-sm font-bold text-gray-900">
          {isManual ? "Manual review mode" : "Auto-submit mode"}
        </p>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">
        {isManual
          ? "Review and approve each application before it goes out — you stay in full control."
          : "Skip the review and apply faster. Just keep in mind that AI-filled details may occasionally need a correction."}
      </p>
    </button>
  );
}

function Step5({
  data, onChange, onBack, onSubmit, saving,
}: { data: WizardData; onChange: (p: Partial<WizardData>) => void; onBack: () => void; onSubmit: () => void; saving: boolean }) {
  return (
    <>
      <StepHeader title="Lastly, select your Auto Apply mode" />

      <div className="flex gap-4 mb-5">
        <ModeCard mode="manual" selected={data.applyMode === "manual"} onSelect={() => onChange({ applyMode: "manual" })} recommended />
        <ModeCard mode="auto"   selected={data.applyMode === "auto"}   onSelect={() => onChange({ applyMode: "auto" })} />
      </div>

      <p className="text-xs text-center text-gray-400 mb-6">You can change this anytime in preferences.</p>

      {/* Terms checkbox */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={data.agreedToTerms}
            onChange={e => onChange({ agreedToTerms: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded accent-blue-600 flex-shrink-0"
          />
          <span className="text-xs text-gray-600 leading-relaxed">
            I agree to the{" "}
            <a href="/privacy-policy" target="_blank" className="text-blue-600 underline font-semibold">Privacy Policy</a>
            {" "}and{" "}
            <a href="/terms" target="_blank" className="text-blue-600 underline font-semibold">Terms</a>,
            and consent to the use of my information for this application.
          </span>
        </label>
      </div>

      <NavButtons
        step={5}
        onBack={onBack}
        onNext={onSubmit}
        nextLabel="Save & start applying"
        nextDisabled={!data.agreedToTerms}
        saving={saving}
      />

      {!data.agreedToTerms && (
        <p className="text-xs text-center text-gray-400 mt-2">Please agree to the terms to continue</p>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress bar
// ─────────────────────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  const pct = Math.round((step / TOTAL_STEPS) * 100);
  return (
    <div className="fixed top-0 left-0 right-0 h-1 z-50 bg-gray-200">
      <div
        className="h-full bg-blue-600 transition-all duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Background blobs
// ─────────────────────────────────────────────────────────────────────────────

function BgBlobs() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-blue-100/50 blur-3xl" />
      <div className="absolute top-1/3 -right-32 w-80 h-80 rounded-full bg-teal-100/40 blur-3xl" />
      <div className="absolute bottom-0 left-1/3 w-72 h-72 rounded-full bg-indigo-100/40 blur-3xl" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step dots indicator
// ─────────────────────────────────────────────────────────────────────────────

function StepDots({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <div key={i} className={clsx(
          "rounded-full transition-all duration-300",
          i + 1 === current ? "w-6 h-2 bg-blue-600" :
          i + 1 < current   ? "w-2 h-2 bg-blue-400" :
                              "w-2 h-2 bg-gray-200"
        )} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function AutoApplyOnboardingPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { user }     = useAuth();

  const [step,    setStep]    = useState(1);
  const [data,    setData]    = useState<WizardData>(EMPTY);
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [saving,  setSaving]  = useState(false);
  const [loaded,  setLoaded]  = useState(false);

  // Get the jobId the user originally clicked "Auto Apply" on
  const pendingJobId = searchParams.get("jobId") ?? sessionStorage.getItem("pending_auto_apply_job") ?? "";

  // Load resumes
  useEffect(() => {
    if (!user) return;
    getUserResumes(user.uid).then(rs => {
      setResumes(rs);
      // Pre-fill from first resume if nothing selected
      if (rs[0] && !data.resumeId) {
        const r = rs[0];
        const f = r.formData;
        const parts = (f.fullName ?? "").split(" ");
        setData(d => ({
          ...d,
          resumeId:  r.id,
          firstName: parts[0] ?? "",
          lastName:  parts.slice(1).join(" "),
          email:     f.email ?? "",
          phone:     f.phone ?? "",
        }));
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync step from query param
  useEffect(() => {
    const s = parseInt(searchParams.get("step") ?? "1", 10);
    if (s >= 1 && s <= TOTAL_STEPS) setStep(s);
  }, [searchParams]);

  const patch = useCallback((p: Partial<WizardData>) => setData(d => ({ ...d, ...p })), []);

  const goTo = (s: number) => {
    setStep(s);
    const params = new URLSearchParams(searchParams.toString());
    params.set("step", String(s));
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const next = () => goTo(Math.min(TOTAL_STEPS, step + 1));
  const back = () => goTo(Math.max(1, step - 1));

  // ── Final submit ─────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!user) { toast.error("Please sign in to continue."); return; }
    setSaving(true);
    try {
      // 1. Save preferences
      await setDoc(doc(db, "autoApplyPreferences", user.uid), {
        ...data,
        onboardingCompleted: true,
        updatedAt: serverTimestamp(),
      });
      toast.success("Preferences saved!");

      // 2. If there's a pending job, kick off the application now
      if (pendingJobId) {
        sessionStorage.removeItem("pending_auto_apply_job");
        // Re-call the API — onboarding is now complete so it will proceed
        const res = await fetch("/api/auto-apply", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ jobId: pendingJobId, userId: user.uid }),
        });
        const json = (await res.json()) as {
          applicationId?: string;
          code?:          string;
          error?:         string;
        };

        if (json.applicationId) {
          // Auto mode → show autofilling status screen
          // Manual mode → go straight to review page
          if (data.applyMode === "auto") {
            router.push(`/auto-apply/applying/${json.applicationId}`);
          } else {
            router.push(`/auto-apply/review/${json.applicationId}`);
          }
          return;
        }
        if (json.code === "NO_CREDITS") {
          router.push("/auto-apply");
          toast("You need credits to apply. Please top up!", { icon: "💳" });
          return;
        }
        // Fallback — go back to the main page
        router.push("/auto-apply");
      } else {
        router.push("/auto-apply");
      }
    } catch {
      toast.error("Failed to save preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <BgBlobs />
      <ProgressBar step={step} />

      <div className="min-h-screen flex items-center justify-center py-16 px-4">
        <div className="w-full max-w-xl">
          {/* Card */}
          <div className="bg-white/90 backdrop-blur-sm rounded-3xl border border-gray-100 shadow-xl p-8">
            <StepDots current={step} />

                        {step === 1 && (
              <Step1
                data={data}
                onChange={patch}
                resumes={resumes}
                onNext={next}
                userId={user?.uid ?? ""}
                onResumeUploaded={r => setResumes(prev => [r, ...prev.filter(x => x.id !== r.id)])}
              />
            )}
            {step === 2 && <Step2 data={data} onChange={patch} onBack={back} onNext={next} />}
            {step === 3 && <Step3 data={data} onChange={patch} onBack={back} onNext={next} />}
            {step === 4 && <Step4 data={data} onChange={patch} onBack={back} onNext={next} />}
            {step === 5 && <Step5 data={data} onChange={patch} onBack={back} onSubmit={handleSubmit} saving={saving} />}
          </div>

          {/* Step counter */}
          <p className="text-center text-xs text-gray-400 mt-4">Step {step} of {TOTAL_STEPS}</p>
        </div>
      </div>
    </>
  );
}
