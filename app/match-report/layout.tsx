import type { Metadata } from "next";
import { AppLayout } from "@/components/layout/AppLayout";

export const metadata: Metadata = {
  title: "Match Report — JobAI",
  description: "Scan your resume against any job description and get an instant ATS match score with detailed keyword analysis.",
};

export default function MatchReportLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}
