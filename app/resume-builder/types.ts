export interface ExperienceEntry {
  jobTitle: string;
  employer: string;
  location: string;
  startDate: string;
  endDate: string;
  currentlyWorking: boolean;
  description: string;
}

export interface EducationEntry {
  degree: string;
  school: string;
  fieldOfStudy: string;
  startYear: string;
  endYear: string;
  gpa: string;
}

export interface CertificationEntry {
  name: string;
  issuer: string;
  year: string;
}

export interface LanguageEntry {
  language: string;
  proficiency: string;
}

export interface ResumeFormData {
  // Step 1 — Profile
  fullName: string;
  jobTitle: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  website: string;

  // Step 2 — Experience
  experience: ExperienceEntry[];

  // Step 3 — Education
  education: EducationEntry[];

  // Step 5 — Additional
  summary: string;
  certifications: CertificationEntry[];
  languages: LanguageEntry[];
}
