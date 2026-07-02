"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { Loader2, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

// ---------------------------------------------------------------------------
// Google SVG icon
// ---------------------------------------------------------------------------

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading, signInWithEmail, signInWithGoogle } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) });

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && user) {
      const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
      router.replace(callbackUrl);
    }
  }, [user, authLoading, router, searchParams]);

  // ── Email / Password submit ──────────────────────────────────────────────
  const onSubmit = async (data: LoginFormData) => {
    try {
      await signInWithEmail(data.email, data.password);
      toast.success("Welcome back!");
      const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
      // Use hard navigation to guarantee the redirect clears any cached state
      window.location.href = callbackUrl;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Sign in failed. Please try again.";
      const friendly = message.includes("user-not-found")
        ? "No account found with this email."
        : message.includes("wrong-password")
        ? "Incorrect password. Please try again."
        : message.includes("too-many-requests")
        ? "Too many attempts. Please wait before trying again."
        : "Sign in failed. Please check your credentials.";
      toast.error(friendly);
    }
  };

  // ── Google sign-in ───────────────────────────────────────────────────────
  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      toast.success("Welcome back!");
      const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
      window.location.href = callbackUrl;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (!message.includes("popup-closed-by-user")) {
        toast.error("Google sign-in failed. Please try again.");
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  // Show nothing while checking auth state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const isFormLoading = isSubmitting || googleLoading;

  return (
    <>
      <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
        {/* Card */}
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 px-8 py-10">

          {/* Logo */}
          <div className="text-center mb-8">
            <Link href="/" className="inline-block">
              <span className="text-3xl font-extrabold tracking-tight text-blue-600">
                Job<span className="text-gray-900">AI</span>
              </span>
            </Link>
            <h1 className="mt-4 text-xl font-semibold text-gray-900">
              Sign in to your account
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Don&apos;t have an account?{" "}
              <Link
                href="/auth/signup"
                className="text-blue-600 font-medium hover:underline"
              >
                Sign up for free
              </Link>
            </p>
          </div>

          {/* Google button */}
          <button
            id="btn-google-login"
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isFormLoading}
            className="w-full flex items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {googleLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
            ) : (
              <GoogleIcon />
            )}
            Continue with Google
          </button>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs text-gray-400 uppercase tracking-wide">
              <span className="bg-white px-3">or sign in with email</span>
            </div>
          </div>

          {/* Email / Password form */}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">

            {/* Email */}
            <div>
              <label
                htmlFor="login-email"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                Email address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  disabled={isFormLoading}
                  {...register("email")}
                  className={`w-full rounded-lg border pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-60 disabled:bg-gray-50 ${
                    errors.email
                      ? "border-red-400 focus:ring-red-400"
                      : "border-gray-200"
                  }`}
                />
              </div>
              {errors.email && (
                <p className="mt-1.5 text-xs text-red-500">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="login-password"
                  className="block text-sm font-medium text-gray-700"
                >
                  Password
                </label>
                <Link
                  href="/auth/forgot-password"
                  className="text-xs text-blue-600 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  disabled={isFormLoading}
                  {...register("password")}
                  className={`w-full rounded-lg border pl-10 pr-10 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-60 disabled:bg-gray-50 ${
                    errors.password
                      ? "border-red-400 focus:ring-red-400"
                      : "border-gray-200"
                  }`}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-xs text-red-500">{errors.password.message}</p>
              )}
            </div>

            {/* Submit */}
            <button
              id="btn-email-login"
              type="submit"
              disabled={isFormLoading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </button>
          </form>

          {/* Footer note */}
          <p className="mt-6 text-center text-xs text-gray-400">
            By signing in you agree to our{" "}
            <Link href="/terms" className="underline hover:text-gray-600">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline hover:text-gray-600">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </main>
    </>
  );
}
