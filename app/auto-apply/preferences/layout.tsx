import type { Metadata } from "next";
import { AppLayout } from "@/components/layout/AppLayout";

export const metadata: Metadata = {
  title: "Auto Apply Preferences — JobAI",
  description: "Configure your Auto Apply preferences including apply mode, basic details, employment status, job preferences, and eligibility.",
};

export default function PreferencesLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}
