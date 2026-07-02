"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileSearch,
  Sparkles,
  Briefcase,
  Link2,
  Send,
  FileText,
  KanbanSquare,
  LogOut,
  ChevronRight,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Nav items
// ---------------------------------------------------------------------------

const NAV_ITEMS = [
  { label: "Dashboard",            href: "/dashboard",       icon: LayoutDashboard },
  { label: "Match Report",         href: "/match-report",    icon: FileSearch      },
  { label: "AI Optimize",          href: "/ai-optimize",     icon: Sparkles        },
  { label: "Job Match",            href: "/job-match",       icon: Briefcase       },
  { label: "LinkedIn Optimization",href: "/linkedin",        icon: Link2        },
  { label: "Auto Apply",           href: "/auto-apply",      icon: Send            },
  { label: "Resume Builder",       href: "/resume-builder",  icon: FileText        },
  { label: "Job Tracker",          href: "/job-tracker",     icon: KanbanSquare    },
] as const;

// ---------------------------------------------------------------------------
// Avatar helper
// ---------------------------------------------------------------------------

function Avatar({ name, photoURL }: { name: string | null; photoURL: string | null }) {
  if (photoURL) {
    return (
      <img
        src={photoURL}
        alt={name ?? "User"}
        className="h-9 w-9 rounded-full object-cover ring-2 ring-blue-100 flex-shrink-0"
      />
    );
  }
  const initials = (name ?? "U")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="h-9 w-9 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 ring-2 ring-blue-100">
      <span className="text-xs font-bold text-white">{initials}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner sidebar content (shared between desktop + mobile drawer)
// ---------------------------------------------------------------------------

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
      router.replace("/auth/login");
      toast.success("Signed out successfully");
    } catch {
      toast.error("Failed to sign out. Please try again.");
    }
  }, [signOut, router]);

  return (
    <div className="flex flex-col h-full">
      {/* Logo + close (mobile) */}
      <div className="flex items-center justify-between px-5 h-16 border-b border-gray-100 flex-shrink-0">
        <Link href="/dashboard" onClick={onClose} className="flex items-center gap-1.5">
          <span className="text-2xl font-extrabold tracking-tight text-blue-600">
            Job<span className="text-gray-900">AI</span>
          </span>
        </Link>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const isActive =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              id={`nav-${href.replace("/", "")}`}
              className={clsx(
                "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <Icon
                className={clsx(
                  "h-[18px] w-[18px] flex-shrink-0 transition-colors",
                  isActive
                    ? "text-blue-600"
                    : "text-gray-400 group-hover:text-gray-600"
                )}
              />
              <span className="flex-1 truncate">{label}</span>
              {isActive && (
                <ChevronRight className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="flex-shrink-0 border-t border-gray-100 p-3">
        {/* User info */}
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl mb-1">
          <Avatar
            name={user?.displayName ?? null}
            photoURL={user?.photoURL ?? null}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {user?.displayName ?? "User"}
            </p>
            <p className="text-xs text-gray-400 truncate">{user?.email ?? ""}</p>
          </div>
        </div>

        {/* Sign out */}
        <button
          id="btn-signout"
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors group"
        >
          <LogOut className="h-[18px] w-[18px] flex-shrink-0 text-gray-400 group-hover:text-red-500 transition-colors" />
          Sign out
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar component
// ---------------------------------------------------------------------------

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileOpen) onMobileClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mobileOpen, onMobileClose]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-60 lg:z-30 bg-white border-r border-gray-100">
        <SidebarContent />
      </aside>

      {/* ── Mobile overlay backdrop ───────────────────────────────────────── */}
      <div
        ref={overlayRef}
        onClick={onMobileClose}
        className={clsx(
          "fixed inset-0 z-40 bg-gray-900/40 backdrop-blur-sm lg:hidden transition-opacity duration-300",
          mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        aria-hidden="true"
      />

      {/* ── Mobile slide-over drawer ──────────────────────────────────────── */}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-2xl lg:hidden transform transition-transform duration-300 ease-in-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-modal="true"
        role="dialog"
        aria-label="Navigation"
      >
        <SidebarContent onClose={onMobileClose} />
      </aside>
    </>
  );
}
