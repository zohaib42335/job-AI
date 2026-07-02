import type { Metadata } from "next";
import { AppLayout } from "@/components/layout/AppLayout";

export const metadata: Metadata = {
  title: "Resume Builder — JobAI",
  description: "Build an ATS-optimised resume from scratch with a 5-step form, live preview, and AI-powered suggestions.",
};

export default function ResumeBuilderLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}
