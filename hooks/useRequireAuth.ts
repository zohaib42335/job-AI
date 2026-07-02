"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import type { User } from "firebase/auth";

/**
 * Guards a client component behind authentication.
 *
 * - While auth state is loading → returns null (renders nothing).
 * - If no user → redirects to /auth/login.
 * - If authenticated → returns the Firebase User object.
 *
 * Usage:
 * ```tsx
 * const user = useRequireAuth();
 * if (!user) return null; // loading / redirecting
 * ```
 */
export function useRequireAuth(): User | null {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/login");
    }
  }, [user, loading, router]);

  // Still loading — don't return a user yet
  if (loading) return null;

  // Not authenticated — redirect is in flight
  if (!user) return null;

  return user;
}
