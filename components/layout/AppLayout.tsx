"use client";

import { useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Menu, Bell, Search } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { clsx } from "clsx";

// ---------------------------------------------------------------------------
// Map route prefixes → human-readable page titles
// ---------------------------------------------------------------------------

const PAGE_TITLES: Record<string, string> = {
  "/dashboard":                  "Dashboard",
  "/match-report":               "Match Report",
  "/ai-optimize":                "AI Optimize",
  "/job-match":                  "Job Match",
  "/linkedin":                   "LinkedIn Optimization",
  "/auto-apply/preferences":     "Auto Apply Preferences",
  "/auto-apply":                 "Auto Apply",
  "/resume-builder":             "Resume Builder",
  "/job-tracker":                "Job Tracker",
};

function usePageTitle(pathname: string): string {
  for (const [prefix, title] of Object.entries(PAGE_TITLES)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return title;
  }
  return "JobAI";
}

// ---------------------------------------------------------------------------
// Top bar
// ---------------------------------------------------------------------------

function TopBar({
  onMenuClick,
  title,
}: {
  onMenuClick: () => void;
  title: string;
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-4 h-16 px-4 sm:px-6 bg-white/90 backdrop-blur-sm border-b border-gray-100">
      {/* Hamburger — mobile only */}
      <button
        id="btn-mobile-menu"
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Page title */}
      <h1 className="text-lg font-semibold text-gray-900 flex-1">{title}</h1>

      {/* Right-side actions */}
      <div className="flex items-center gap-2">
        {/* Search shortcut */}
        <button
          id="btn-global-search"
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-400 hover:border-blue-300 hover:text-gray-600 transition-colors bg-gray-50"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
          <span className="text-xs">Search…</span>
          <kbd className="ml-1 text-[10px] font-mono bg-gray-100 border border-gray-200 rounded px-1 py-0.5 text-gray-400">
            ⌘K
          </kbd>
        </button>

        {/* Notifications */}
        <button
          id="btn-notifications"
          className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {/* Badge */}
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-blue-600 ring-2 ring-white" />
        </button>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// AppLayout
// ---------------------------------------------------------------------------

export function AppLayout({ children }: { children: React.ReactNode }) {
  const user = useRequireAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const openMobile  = useCallback(() => setMobileOpen(true),  []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const pageTitle = usePageTitle(pathname);

  // Render nothing while auth resolves / redirect is in flight
  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar mobileOpen={mobileOpen} onMobileClose={closeMobile} />

      {/* Main area — offset by sidebar width on desktop */}
      <div
        className={clsx(
          "flex flex-col min-h-screen transition-all duration-300",
          "lg:pl-60"           // 240px = 60 * 4
        )}
      >
        <TopBar onMenuClick={openMobile} title={pageTitle} />

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
