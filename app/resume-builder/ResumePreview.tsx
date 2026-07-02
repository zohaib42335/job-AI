import type { ResumeFormData } from "./types";
import { Mail, Phone, MapPin, Globe, Link2 as LinkedInIcon } from "lucide-react";

interface ResumePreviewProps {
  data: ResumeFormData;
  skills: string[];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-900 pb-1 mb-2.5 border-b-2 border-gray-900">
        {title}
      </h2>
      {children}
    </div>
  );
}

export function ResumePreview({ data, skills }: ResumePreviewProps) {
  const hasExperience = data.experience?.some((e) => e.employer || e.jobTitle);
  const hasEducation  = data.education?.some((e) => e.school || e.degree);
  const hasCerts      = data.certifications?.some((c) => c.name);
  const hasLanguages  = data.languages?.some((l) => l.language);

  return (
    <div
      id="resume-print-area"
      className="bg-white w-full font-sans text-gray-900 text-[11px] leading-relaxed"
      style={{ fontFamily: "'Times New Roman', Times, serif" }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="mb-5 pb-3 border-b-2 border-gray-900 text-center">
        {data.fullName ? (
          <h1 className="text-2xl font-bold uppercase tracking-widest text-gray-900 leading-tight">
            {data.fullName}
          </h1>
        ) : (
          <h1 className="text-2xl font-bold uppercase tracking-widest text-gray-300 leading-tight">
            Your Name
          </h1>
        )}

        {data.jobTitle && (
          <p className="text-sm text-gray-600 mt-0.5 font-medium">{data.jobTitle}</p>
        )}

        {/* Contact row */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2 text-[10px] text-gray-600">
          {data.email && (
            <span className="flex items-center gap-1">
              <Mail className="h-2.5 w-2.5" />{data.email}
            </span>
          )}
          {data.phone && (
            <span className="flex items-center gap-1">
              <Phone className="h-2.5 w-2.5" />{data.phone}
            </span>
          )}
          {data.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-2.5 w-2.5" />{data.location}
            </span>
          )}
          {data.linkedin && (
            <span className="flex items-center gap-1">
              <LinkedInIcon className="h-2.5 w-2.5" />
              {data.linkedin.replace(/^https?:\/\/(www\.)?/i, "")}
            </span>
          )}
          {data.website && (
            <span className="flex items-center gap-1">
              <Globe className="h-2.5 w-2.5" />
              {data.website.replace(/^https?:\/\/(www\.)?/i, "")}
            </span>
          )}
        </div>
      </div>

      {/* ── Summary ────────────────────────────────────────────────────── */}
      {data.summary && (
        <Section title="Professional Summary">
          <p className="text-[11px] text-gray-700 leading-relaxed">{data.summary}</p>
        </Section>
      )}

      {/* ── Experience ─────────────────────────────────────────────────── */}
      {hasExperience && (
        <Section title="Experience">
          <div className="space-y-3.5">
            {data.experience.map((exp, i) => {
              if (!exp.employer && !exp.jobTitle) return null;
              const dateRange = [
                exp.startDate,
                exp.currentlyWorking ? "Present" : exp.endDate,
              ]
                .filter(Boolean)
                .join(" – ");
              return (
                <div key={i}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-[11px] text-gray-900">{exp.jobTitle}</p>
                      <p className="text-[10px] text-gray-600">
                        {exp.employer}
                        {exp.location && ` · ${exp.location}`}
                      </p>
                    </div>
                    {dateRange && (
                      <p className="text-[10px] text-gray-500 whitespace-nowrap flex-shrink-0">
                        {dateRange}
                      </p>
                    )}
                  </div>
                  {exp.description && (
                    <div className="mt-1 text-[10px] text-gray-700 whitespace-pre-line leading-relaxed">
                      {exp.description}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ── Education ──────────────────────────────────────────────────── */}
      {hasEducation && (
        <Section title="Education">
          <div className="space-y-2.5">
            {data.education.map((edu, i) => {
              if (!edu.school && !edu.degree) return null;
              const years = [edu.startYear, edu.endYear].filter(Boolean).join(" – ");
              return (
                <div key={i} className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-[11px] text-gray-900">
                      {edu.degree}
                      {edu.fieldOfStudy && ` in ${edu.fieldOfStudy}`}
                    </p>
                    <p className="text-[10px] text-gray-600">{edu.school}</p>
                    {edu.gpa && (
                      <p className="text-[10px] text-gray-500">GPA: {edu.gpa}</p>
                    )}
                  </div>
                  {years && (
                    <p className="text-[10px] text-gray-500 whitespace-nowrap flex-shrink-0">
                      {years}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ── Skills ─────────────────────────────────────────────────────── */}
      {skills.length > 0 && (
        <Section title="Skills">
          <p className="text-[11px] text-gray-700 leading-relaxed">
            {skills.join("  ·  ")}
          </p>
        </Section>
      )}

      {/* ── Certifications ─────────────────────────────────────────────── */}
      {hasCerts && (
        <Section title="Certifications">
          <div className="space-y-1">
            {data.certifications.map((cert, i) => {
              if (!cert.name) return null;
              return (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-800">
                    <span className="font-semibold">{cert.name}</span>
                    {cert.issuer && ` — ${cert.issuer}`}
                  </span>
                  {cert.year && (
                    <span className="text-[10px] text-gray-500">{cert.year}</span>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ── Languages ──────────────────────────────────────────────────── */}
      {hasLanguages && (
        <Section title="Languages">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            {data.languages.map((lang, i) => {
              if (!lang.language) return null;
              return (
                <span key={i} className="text-[11px] text-gray-700">
                  <span className="font-semibold">{lang.language}</span>
                  {lang.proficiency && (
                    <span className="text-gray-500"> ({lang.proficiency})</span>
                  )}
                </span>
              );
            })}
          </div>
        </Section>
      )}

      {/* Empty state */}
      {!data.fullName &&
        !hasExperience &&
        !hasEducation &&
        skills.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-300">
            <p className="text-sm font-medium">Your resume preview will appear here</p>
            <p className="text-xs mt-1">Fill in the form on the left to get started</p>
          </div>
        )}
    </div>
  );
}
