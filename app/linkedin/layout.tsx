import type { Metadata } from "next";
import { AppLayout } from "@/components/layout/AppLayout";

export const metadata: Metadata = {
  title: "LinkedIn Optimization — JobAI",
  description: "AI rewrites your LinkedIn headline, about section, experience, and skills to attract more recruiters.",
};

export default function LinkedInLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}
