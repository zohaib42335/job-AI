import type { Metadata } from "next";
import { AppLayout } from "@/components/layout/AppLayout";

export const metadata: Metadata = {
  title: "Job Match — JobAI",
  description: "Discover AI-curated job listings ranked by how well they match your resume and skills.",
};

export default function JobMatchLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}
