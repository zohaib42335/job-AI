import type { Metadata } from "next";
import { AppLayout } from "@/components/layout/AppLayout";

export const metadata: Metadata = {
  title: "Auto Apply — JobAI",
  description: "Automatically apply to hundreds of matching jobs across LinkedIn, Indeed, Glassdoor, and more.",
};

export default function AutoApplyLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}
