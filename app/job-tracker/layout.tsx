import type { Metadata } from "next";
import { AppLayout } from "@/components/layout/AppLayout";

export const metadata: Metadata = {
  title: "Job Tracker — JobAI",
  description: "Track every job application on a visual kanban board. Move cards through Wishlist, Applied, Interview, Offer, and Rejected.",
};

export default function JobTrackerLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}
