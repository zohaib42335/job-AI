import type { Metadata } from "next";
import { AppLayout } from "@/components/layout/AppLayout";

export const metadata: Metadata = {
  title: "AI Optimize — JobAI",
  description: "Let AI rewrite your resume summary, bullets, and skills section to perfectly match any job description.",
};

export default function AiOptimizeLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}
