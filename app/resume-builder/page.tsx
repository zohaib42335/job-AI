"use client";

import { useEffect, useState, useRef, KeyboardEvent, forwardRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { useAuth } from "@/hooks/useAuth";
import toast from "react-hot-toast";
import {
  Plus, Trash2, Download, Save, ChevronLeft, ChevronRight,
  Check, X, Printer, FilePlus, ChevronDown, AlertTriangle, Loader2,
} from "lucide-react";
import { clsx } from "clsx";
import { ResumePreview } from "./ResumePreview";
import type { ResumeFormData } from "./types";
import { saveResume, getUserResumes, deleteResume } from "@/lib/resume";
import type { ResumeRecord } from "@/lib/resume";
import { ResumeUpload } from "@/components/features/ResumeUpload";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Profile"     },
  { id: 2, label: "Experience"  },
  { id: 3, label: "Education"   },
  { id: 4, label: "Skills"      },
  { id: 5, label: "Additional"  },
] as const;

const PROFICIENCY_LEVELS = ["Native", "Fluent", "Advanced", "Intermediate", "Basic"];

const SKILL_SUGGESTIONS: Record<string, string[]> = {
  "software engineer":  ["JavaScript", "TypeScript", "React", "Node.js", "Python", "Git", "AWS", "Docker", "SQL"],
  "frontend":           ["React", "Next.js", "HTML5", "CSS3", "JavaScript", "TypeScript", "Tailwind CSS", "Figma"],
  "backend":            ["Node.js", "Python", "Java", "PostgreSQL", "MongoDB", "Redis", "Docker", "REST APIs"],
  "full stack":         ["React", "Node.js", "TypeScript", "PostgreSQL", "Docker", "AWS", "Git", "GraphQL"],
  "data scientist":     ["Python", "TensorFlow", "PyTorch", "Pandas", "SQL", "Scikit-learn", "R", "Tableau"],
  "data analyst":       ["SQL", "Python", "Excel", "Tableau", "Power BI", "R", "Statistics", "Data Visualization"],
  "product manager":    ["Agile", "Scrum", "JIRA", "Confluence", "SQL", "A/B Testing", "Figma", "Roadmapping"],
  "designer":           ["Figma", "Adobe XD", "Sketch", "Photoshop", "Illustrator", "Prototyping", "User Research"],
  "devops":             ["Docker", "Kubernetes", "AWS", "CI/CD", "Terraform", "Jenkins", "Linux", "Bash"],
  "marketing":          ["SEO", "Google Analytics", "Content Marketing", "HubSpot", "Social Media", "Copywriting"],
  "project manager":    ["PMP", "Agile", "Scrum", "MS Project", "Risk Management", "Stakeholder Management"],
};

function getSuggestions(jobTitle: string): string[] {
  const lower = jobTitle.toLowerCase();
  for (const [key, suggestions] of Object.entries(SKILL_SUGGESTIONS)) {
    if (lower.includes(key)) return suggestions;
  }
  return ["Communication", "Problem Solving", "Critical Thinking", "Teamwork", "Time Management", "Leadership"];
}

const DEFAULT_VALUES: ResumeFormData = {
  fullName: "", jobTitle: "", email: "", phone: "",
  location: "", linkedin: "", website: "",
  summary: "",
  experience: [{ jobTitle: "", employer: "", location: "", startDate: "", endDate: "", currentlyWorking: false, description: "" }],
  education: [{ degree: "", school: "", fieldOfStudy: "", startYear: "", endYear: "", gpa: "" }],
  certifications: [],
  languages: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Reusable field components
// ─────────────────────────────────────────────────────────────────────────────

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-gray-700 mb-1">
      {children}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

// forwardRef is required so react-hook-form's register() ref reaches the DOM element.
const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      {...props}
      className={clsx(
        "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400",
        "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
        "disabled:bg-gray-50 disabled:text-gray-400 transition-colors",
        className
      )}
    />
  )
);
Input.displayName = "Input";

const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      {...props}
      className={clsx(
        "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400",
        "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-colors",
        className
      )}
    />
  )
);
Textarea.displayName = "Textarea";

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function EntryCard({ children, onRemove, canRemove }: {
  children: React.ReactNode; onRemove: () => void; canRemove: boolean;
}) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 relative bg-gray-50/50">
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-3 right-3 p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="space-y-3">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Profile
// ─────────────────────────────────────────────────────────────────────────────

function Step1Profile({
  register, onParsed,
}: {
  register: ReturnType<typeof useForm<ResumeFormData>>["register"];
  onParsed: (data: Partial<ResumeFormData>, skills: string[]) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Upload existing resume */}
      <ResumeUpload onParsed={onParsed} />
      <div className="relative">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100" /></div>
        <div className="relative flex justify-center"><span className="bg-white px-2 text-[10px] text-gray-400 uppercase tracking-wide">or fill in manually</span></div>
      </div>
      <div className="space-y-3">
        <div>
          <Label>Professional Summary / Objective</Label>
          <Textarea
            rows={3}
            placeholder="Results-driven software engineer with 5+ years of experience building scalable web applications…"
            {...register("summary")}
          />
          <p className="text-xs text-gray-400 mt-1">Tip: Keep it to 2–4 sentences. Lead with your strongest achievement.</p>
        </div>
        <FieldRow>
          <div><Label required>Full Name</Label>
            <Input placeholder="Jane Smith" {...register("fullName")} /></div>
          <div><Label>Job Title</Label>
            <Input placeholder="Software Engineer" {...register("jobTitle")} /></div>
        </FieldRow>
        <FieldRow>
          <div><Label>Email</Label>
            <Input type="email" placeholder="jane@example.com" {...register("email")} /></div>
          <div><Label>Phone</Label>
            <Input placeholder="+1 (555) 000-0000" {...register("phone")} /></div>
        </FieldRow>
        <div><Label>Location</Label>
          <Input placeholder="San Francisco, CA" {...register("location")} /></div>
        <div><Label>LinkedIn URL</Label>
          <Input placeholder="linkedin.com/in/janesmith" {...register("linkedin")} /></div>
        <div><Label>Website / Portfolio</Label>
          <Input placeholder="janesmith.dev" {...register("website")} /></div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Experience
// ─────────────────────────────────────────────────────────────────────────────

function Step2Experience({
  fields, append, remove, register, watch, setValue,
}: {
  fields: ReturnType<typeof useFieldArray<ResumeFormData, "experience">>["fields"];
  append: ReturnType<typeof useFieldArray<ResumeFormData, "experience">>["append"];
  remove: ReturnType<typeof useFieldArray<ResumeFormData, "experience">>["remove"];
  register: ReturnType<typeof useForm<ResumeFormData>>["register"];
  watch: ReturnType<typeof useForm<ResumeFormData>>["watch"];
  setValue: ReturnType<typeof useForm<ResumeFormData>>["setValue"];
}) {
  const handleDescriptionKeyDown = (
    e: KeyboardEvent<HTMLTextAreaElement>,
    index: number
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const el = e.currentTarget;
      const pos = el.selectionStart ?? 0;
      const cur = (watch(`experience.${index}.description`) as string) ?? "";
      const next = cur.slice(0, pos) + "\n• " + cur.slice(pos);
      setValue(`experience.${index}.description`, next, { shouldDirty: true });
      setTimeout(() => {
        el.selectionStart = pos + 3;
        el.selectionEnd = pos + 3;
      }, 0);
    }
  };

  return (
    <div className="space-y-4">
      {fields.map((field, index) => {
        const currentlyWorking = watch(`experience.${index}.currentlyWorking`);
        return (
          <EntryCard key={field.id} onRemove={() => remove(index)} canRemove={fields.length > 1}>
            <FieldRow>
              <div><Label>Job Title</Label>
                <Input placeholder="Software Engineer" {...register(`experience.${index}.jobTitle`)} /></div>
              <div><Label>Employer</Label>
                <Input placeholder="Acme Corp" {...register(`experience.${index}.employer`)} /></div>
            </FieldRow>
            <div><Label>Location</Label>
              <Input placeholder="Remote / New York, NY" {...register(`experience.${index}.location`)} /></div>
            <FieldRow>
              <div><Label>Start Date</Label>
                <Input type="month" {...register(`experience.${index}.startDate`)} /></div>
              <div>
                <Label>End Date</Label>
                <Input
                  type="month"
                  disabled={!!currentlyWorking}
                  {...register(`experience.${index}.endDate`)}
                />
              </div>
            </FieldRow>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                {...register(`experience.${index}.currentlyWorking`)}
              />
              <span className="text-xs text-gray-600 font-medium">Currently working here</span>
            </label>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Description</Label>
                <span className="text-[10px] text-gray-400">Press Enter for bullet points</span>
              </div>
              <Textarea
                rows={4}
                placeholder={"• Developed and maintained...\n• Collaborated with...\n• Improved performance by 30%..."}
                onKeyDown={(e) => handleDescriptionKeyDown(e, index)}
                {...register(`experience.${index}.description`)}
              />
            </div>
          </EntryCard>
        );
      })}
      <button
        type="button"
        onClick={() =>
          append({ jobTitle: "", employer: "", location: "", startDate: "", endDate: "", currentlyWorking: false, description: "" })
        }
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
      >
        <Plus className="h-4 w-4" /> Add Experience
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Education
// ─────────────────────────────────────────────────────────────────────────────

function Step3Education({
  fields, append, remove, register,
}: {
  fields: ReturnType<typeof useFieldArray<ResumeFormData, "education">>["fields"];
  append: ReturnType<typeof useFieldArray<ResumeFormData, "education">>["append"];
  remove: ReturnType<typeof useFieldArray<ResumeFormData, "education">>["remove"];
  register: ReturnType<typeof useForm<ResumeFormData>>["register"];
}) {
  return (
    <div className="space-y-4">
      {fields.map((field, index) => (
        <EntryCard key={field.id} onRemove={() => remove(index)} canRemove={fields.length > 1}>
          <FieldRow>
            <div><Label>Degree</Label>
              <Input placeholder="Bachelor of Science" {...register(`education.${index}.degree`)} /></div>
            <div><Label>Field of Study</Label>
              <Input placeholder="Computer Science" {...register(`education.${index}.fieldOfStudy`)} /></div>
          </FieldRow>
          <div><Label>School / University</Label>
            <Input placeholder="MIT" {...register(`education.${index}.school`)} /></div>
          <FieldRow>
            <div><Label>Start Year</Label>
              <Input type="number" placeholder="2018" min="1950" max="2030" {...register(`education.${index}.startYear`)} /></div>
            <div><Label>End Year</Label>
              <Input type="number" placeholder="2022" min="1950" max="2030" {...register(`education.${index}.endYear`)} /></div>
          </FieldRow>
          <div><Label>GPA (optional)</Label>
            <Input placeholder="3.8 / 4.0" {...register(`education.${index}.gpa`)} /></div>
        </EntryCard>
      ))}
      <button
        type="button"
        onClick={() => append({ degree: "", school: "", fieldOfStudy: "", startYear: "", endYear: "", gpa: "" })}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
      >
        <Plus className="h-4 w-4" /> Add Education
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Skills
// ─────────────────────────────────────────────────────────────────────────────

function Step4Skills({
  skills, setSkills, jobTitle,
}: {
  skills: string[];
  setSkills: React.Dispatch<React.SetStateAction<string[]>>;
  jobTitle: string;
}) {
  const [input, setInput] = useState("");
  const suggestions = getSuggestions(jobTitle).filter((s) => !skills.includes(s));

  const add = (skill: string) => {
    const t = skill.trim();
    if (t && !skills.includes(t)) setSkills((p) => [...p, t]);
  };
  const remove = (i: number) => setSkills((p) => p.filter((_, idx) => idx !== i));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(input);
      setInput("");
    }
    if (e.key === "Backspace" && !input && skills.length) {
      setSkills((p) => p.slice(0, -1));
    }
  };

  return (
    <div className="space-y-4">
      {/* Tag input */}
      <div>
        <Label>Skills</Label>
        <div
          className="min-h-[80px] flex flex-wrap gap-2 p-2 rounded-xl border border-gray-200 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent bg-white cursor-text"
          onClick={() => document.getElementById("skill-input")?.focus()}
        >
          {skills.map((skill, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full"
            >
              {skill}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(i); }}
                className="hover:text-blue-900"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            id="skill-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={skills.length === 0 ? "Type a skill and press Enter…" : ""}
            className="flex-1 min-w-[120px] text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent py-1 px-1"
          />
        </div>
        <p className="text-xs text-gray-400 mt-1.5">Press <kbd className="px-1 py-0.5 rounded bg-gray-100 border border-gray-200 text-[10px] font-mono">Enter</kbd> or <kbd className="px-1 py-0.5 rounded bg-gray-100 border border-gray-200 text-[10px] font-mono">,</kbd> to add · Backspace to remove</p>
      </div>

      {/* Suggested skills */}
      {suggestions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">
            Suggested for <span className="text-gray-700">{jobTitle || "your role"}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                className="px-2.5 py-1 text-xs rounded-full border border-gray-200 text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 — Additional
// ─────────────────────────────────────────────────────────────────────────────

function Step5Additional({
  register,
  certFields, appendCert, removeCert,
  langFields, appendLang, removeLang,
}: {
  register: ReturnType<typeof useForm<ResumeFormData>>["register"];
  certFields: ReturnType<typeof useFieldArray<ResumeFormData, "certifications">>["fields"];
  appendCert: ReturnType<typeof useFieldArray<ResumeFormData, "certifications">>["append"];
  removeCert: ReturnType<typeof useFieldArray<ResumeFormData, "certifications">>["remove"];
  langFields: ReturnType<typeof useFieldArray<ResumeFormData, "languages">>["fields"];
  appendLang: ReturnType<typeof useFieldArray<ResumeFormData, "languages">>["append"];
  removeLang: ReturnType<typeof useFieldArray<ResumeFormData, "languages">>["remove"];
}) {
  return (
    <div className="space-y-6">
      {/* Certifications */}
      <div>
        <p className="text-sm font-semibold text-gray-800 mb-3">Certifications</p>
        <div className="space-y-3">
          {certFields.map((field, index) => (
            <EntryCard key={field.id} onRemove={() => removeCert(index)} canRemove>
              <div><Label>Certification Name</Label>
                <Input placeholder="AWS Solutions Architect" {...register(`certifications.${index}.name`)} /></div>
              <FieldRow>
                <div><Label>Issuer</Label>
                  <Input placeholder="Amazon Web Services" {...register(`certifications.${index}.issuer`)} /></div>
                <div><Label>Year</Label>
                  <Input type="number" placeholder="2023" min="1990" max="2030" {...register(`certifications.${index}.year`)} /></div>
              </FieldRow>
            </EntryCard>
          ))}
          <button
            type="button"
            onClick={() => appendCert({ name: "", issuer: "", year: "" })}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Certification
          </button>
        </div>
      </div>

      {/* Languages */}
      <div>
        <p className="text-sm font-semibold text-gray-800 mb-3">Languages</p>
        <div className="space-y-3">
          {langFields.map((field, index) => (
            <EntryCard key={field.id} onRemove={() => removeLang(index)} canRemove>
              <FieldRow>
                <div><Label>Language</Label>
                  <Input placeholder="Spanish" {...register(`languages.${index}.language`)} /></div>
                <div>
                  <Label>Proficiency</Label>
                  <select
                    {...register(`languages.${index}.proficiency`)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  >
                    <option value="">Select level</option>
                    {PROFICIENCY_LEVELS.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
              </FieldRow>
            </EntryCard>
          ))}
          <button
            type="button"
            onClick={() => appendLang({ language: "", proficiency: "" })}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Language
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step navigator
// ─────────────────────────────────────────────────────────────────────────────

function StepNav({ current, onSelect }: { current: number; onSelect: (n: number) => void }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((step, idx) => {
        const done   = current > step.id;
        const active = current === step.id;
        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <button
              type="button"
              onClick={() => onSelect(step.id)}
              className="flex flex-col items-center gap-1 group"
            >
              <span
                className={clsx(
                  "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                  done   ? "bg-blue-600 text-white"           :
                  active ? "bg-blue-600 text-white ring-4 ring-blue-100" :
                           "bg-gray-100 text-gray-400 group-hover:bg-gray-200"
                )}
              >
                {done ? <Check className="h-4 w-4" /> : step.id}
              </span>
              <span className={clsx(
                "text-[10px] font-medium hidden sm:block",
                active ? "text-blue-600" : done ? "text-gray-600" : "text-gray-400"
              )}>
                {step.label}
              </span>
            </button>
            {idx < STEPS.length - 1 && (
              <div className={clsx(
                "flex-1 h-0.5 mx-1 rounded transition-colors",
                current > step.id ? "bg-blue-600" : "bg-gray-200"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function ResumeBuilderPage() {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [skills, setSkills]           = useState<string[]>([]);
  const [saving, setSaving]           = useState(false);
  const [activeTab, setActiveTab]     = useState<"form" | "preview">("form");

  // Resume management
  const [resumes, setResumes]                   = useState<ResumeRecord[]>([]);
  const [currentResumeId, setCurrentResumeId]   = useState<string | null>(null);
  const [resumesLoading, setResumesLoading]     = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting]                 = useState(false);

  const { register, control, watch, setValue, getValues, reset } =
    useForm<ResumeFormData>({ defaultValues: DEFAULT_VALUES });

  const { fields: expFields, append: appendExp, remove: removeExp } =
    useFieldArray({ control, name: "experience" });
  const { fields: eduFields, append: appendEdu, remove: removeEdu } =
    useFieldArray({ control, name: "education" });
  const { fields: certFields, append: appendCert, remove: removeCert } =
    useFieldArray({ control, name: "certifications" });
  const { fields: langFields, append: appendLang, remove: removeLang } =
    useFieldArray({ control, name: "languages" });

  // Drive the live preview via an explicit watch subscription.
  // This is the most reliable react-hook-form pattern: onChange fires for every
  // field change and we push the full snapshot into local React state.
  const [previewData, setPreviewData] = useState<ResumeFormData>(DEFAULT_VALUES);
  const watchRef = useRef(watch);
  watchRef.current = watch;

  useEffect(() => {
    const subscription = watchRef.current((values) => {
      setPreviewData({ ...DEFAULT_VALUES, ...(values as ResumeFormData) });
    });
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jobTitle = watch("jobTitle") ?? "";

  // ── Load resumes on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const data = await getUserResumes(user.uid);
        setResumes(data);
      } catch {
        // Firestore not yet available (empty keys) — silently ignore
      } finally {
        setResumesLoading(false);
      }
    })();
  }, [user]);

  // ── Resume selector handlers ─────────────────────────────────────────────
  const handleSelectResume = (id: string) => {
    const resume = resumes.find((r) => r.id === id);
    if (!resume) return;
    setCurrentResumeId(id);
    reset({ ...DEFAULT_VALUES, ...resume.formData });
    setSkills(resume.skills);
    setCurrentStep(1);
    setShowDeleteConfirm(false);
  };

  const handleNewResume = () => {
    setCurrentResumeId(null);
    reset(DEFAULT_VALUES);
    setSkills([]);
    setCurrentStep(1);
    setShowDeleteConfirm(false);
  };

  const handleDeleteResume = async () => {
    if (!user || !currentResumeId) return;
    setDeleting(true);
    try {
      await deleteResume(user.uid, currentResumeId);
      setResumes((prev) => prev.filter((r) => r.id !== currentResumeId));
      handleNewResume();
      toast.success("Resume deleted.");
    } catch {
      toast.error("Failed to delete resume.");
    } finally {
      setDeleting(false);
    }
  };

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!user) { toast.error("Please sign in first."); return; }
    setSaving(true);
    try {
      const data = getValues();
      const id   = await saveResume(user.uid, data, skills, currentResumeId);
      setCurrentResumeId(id);
      const updated = await getUserResumes(user.uid);
      setResumes(updated);
      toast.success("Resume saved!");
    } catch {
      toast.error("Failed to save resume. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Download PDF ──────────────────────────────────────────────────────────
  const [downloading, setDownloading] = useState(false);

  const handlePrint = async () => {
    const el = document.getElementById("resume-print-area");
    if (!el) return;
    setDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF }   = await import("jspdf");

      // Capture the resume element at 2× resolution for crisp text
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const imgData   = canvas.toDataURL("image/png");
      const pdf       = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
      const pageW     = pdf.internal.pageSize.getWidth();
      const pageH     = pdf.internal.pageSize.getHeight();
      const margin    = 36; // 0.5in
      const printW    = pageW - margin * 2;
      const printH    = (canvas.height / canvas.width) * printW;

      // Multi-page support — slice the canvas image across pages
      if (printH <= pageH - margin * 2) {
        pdf.addImage(imgData, "PNG", margin, margin, printW, printH);
      } else {
        const totalPages = Math.ceil(printH / (pageH - margin * 2));
        for (let p = 0; p < totalPages; p++) {
          if (p > 0) pdf.addPage();
          pdf.addImage(
            imgData, "PNG",
            margin,
            margin - p * (pageH - margin * 2),
            printW,
            printH
          );
        }
      }

      const name = (previewData.fullName || "resume").replace(/\s+/g, "_");
      pdf.save(`${name}_resume.pdf`);
    } catch (err) {
      console.error("PDF export failed:", err);
      toast.error("PDF export failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  // ── Fill form from parsed upload ──────────────────────────────────────────
  const handleParsed = (data: Partial<ResumeFormData>, parsedSkills: string[]) => {
    reset({ ...DEFAULT_VALUES, ...data });
    setSkills(parsedSkills);
  };

  // ── Step renderer ─────────────────────────────────────────────────────────
  const renderStep = () => {
    switch (currentStep) {
      case 1: return <Step1Profile register={register} onParsed={handleParsed} />;
      case 2: return (
        <Step2Experience
          fields={expFields} append={appendExp} remove={removeExp}
          register={register} watch={watch} setValue={setValue}
        />
      );
      case 3: return (
        <Step3Education
          fields={eduFields} append={appendEdu} remove={removeEdu}
          register={register}
        />
      );
      case 4: return (
        <Step4Skills skills={skills} setSkills={setSkills} jobTitle={jobTitle} />
      );
      case 5: return (
        <Step5Additional
          register={register}
          certFields={certFields} appendCert={appendCert} removeCert={removeCert}
          langFields={langFields} appendLang={appendLang} removeLang={removeLang}
        />
      );
    }
  };

  const currentResumeName = resumes.find((r) => r.id === currentResumeId)?.name ?? "";

  return (
    <>


      {/* ── Delete confirmation modal ──────────────────────────────────── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm no-print">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 max-w-sm w-full mx-4">
            <div className="flex items-start gap-4 mb-5">
              <div className="p-2.5 rounded-xl bg-red-50 flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Delete resume?</p>
                <p className="text-xs text-gray-500 mt-1">
                  <span className="font-medium">&ldquo;{currentResumeName}&rdquo;</span> will be
                  permanently deleted from Firestore. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteResume}
                disabled={deleting}
                className="flex-1 py-2 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-1.5"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile tabs ────────────────────────────────────────────────── */}
      <div className="flex lg:hidden border-b border-gray-200 mb-4 -mt-4 -mx-4 px-4 no-print">
        {(["form", "preview"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={clsx(
              "flex-1 py-3 text-sm font-medium capitalize transition-colors border-b-2 -mb-px",
              activeTab === tab ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500"
            )}
          >
            {tab === "form" ? "📝 Edit" : "👁 Preview"}
          </button>
        ))}
      </div>

      {/* ── Main layout ────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-6 min-h-[calc(100vh-10rem)]">

        {/* ── LEFT PANEL ────────────────────────────────────────────────── */}
        <div className={clsx(
          "lg:w-[460px] flex-shrink-0 no-print",
          activeTab === "preview" ? "hidden lg:flex lg:flex-col" : "flex flex-col"
        )}>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col flex-1">

            {/* ── Header: title + resume selector ───────────────────────── */}
            <div className="px-6 pt-5 pb-4 border-b border-gray-100 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-gray-900 flex-shrink-0">Resume Builder</h2>

                {/* New resume button */}
                <button
                  type="button"
                  onClick={handleNewResume}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition-colors flex-shrink-0"
                >
                  <FilePlus className="h-3.5 w-3.5" /> New
                </button>
              </div>

              {/* Resume dropdown + delete */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <select
                    value={currentResumeId ?? ""}
                    onChange={(e) => e.target.value && handleSelectResume(e.target.value)}
                    disabled={resumesLoading}
                    className="w-full appearance-none rounded-lg border border-gray-200 pl-3 pr-8 py-2 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 cursor-pointer"
                  >
                    <option value="">
                      {resumesLoading
                        ? "Loading resumes…"
                        : resumes.length === 0
                        ? "No saved resumes"
                        : currentResumeId
                        ? resumes.find((r) => r.id === currentResumeId)?.name ?? "Select resume"
                        : "Unsaved resume"}
                    </option>
                    {resumes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                </div>

                {/* Delete button */}
                {currentResumeId && (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex-shrink-0 p-2 rounded-lg border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors"
                    title="Delete this resume"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Step nav */}
              <StepNav current={currentStep} onSelect={setCurrentStep} />
            </div>

            {/* Step content */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">
                Step {currentStep} — {STEPS[currentStep - 1].label}
              </h3>
              {renderStep()}
            </div>

            {/* Footer nav */}
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
                disabled={currentStep === 1}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" /> Back
              </button>

              <div className="flex gap-1.5">
                {STEPS.map((s) => (
                  <div key={s.id} className={clsx(
                    "h-1.5 rounded-full transition-all",
                    s.id === currentStep ? "w-5 bg-blue-600" :
                    s.id < currentStep   ? "w-1.5 bg-blue-300" : "w-1.5 bg-gray-200"
                  )} />
                ))}
              </div>

              {currentStep < 5 ? (
                <button
                  type="button"
                  onClick={() => setCurrentStep((s) => Math.min(5, s + 1))}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrint}
                    disabled={downloading}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} PDF
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL — Preview ──────────────────────────────────────── */}
        <div className={clsx(
          "flex-1 flex flex-col",
          activeTab === "form" ? "hidden lg:flex" : "flex"
        )}>
          <div className="flex items-center justify-between mb-3 no-print">
            <div>
              <p className="text-sm font-semibold text-gray-800">Live Preview</p>
              <p className="text-xs text-gray-400">Updates as you type</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={handlePrint}
                disabled={downloading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {downloading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Download className="h-3.5 w-3.5" />}
                {downloading ? "Generating…" : "Download PDF"}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex-1 overflow-y-auto p-8 lg:p-10">
            <ResumePreview data={previewData} skills={skills} />
          </div>
        </div>
      </div>
    </>
  );
}
