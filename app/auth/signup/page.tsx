"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { Loader2, Mail, Lock, User, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const signupSchema = z
  .object({
    fullName: z
      .string()
      .min(2, "Full name must be at least 2 characters")
      .max(80, "Full name is too long"),
    email: z.string().email("Please enter a valid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type SignupFormData = z.infer<typeof signupSchema>;

// ---------------------------------------------------------------------------
// Google SVG icon (shared inline to avoid extra file)
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
// Password strength indicator
// ---------------------------------------------------------------------------

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;

  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;

  const label = ["Too weak", "Weak", "Fair", "Good", "Strong"][score];
  const colors = [
    "bg-red-400",
    "bg-red-400",
    "bg-yellow-400",
    "bg-blue-400",
    "bg-green-500",
  ];

  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              i < score ? colors[score] : "bg-gray-200"
            }`}
          />
        ))}
      </div>
      <p
        className={`text-xs font-medium ${
          score <= 1
            ? "text-red-500"
            : score === 2
            ? "text-yellow-600"
            : score === 3
            ? "text-blue-600"
            : "text-green-600"
        }`}
      >
        {label}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SignupPage() {
  const router = useRouter();
  const { user, loading: authLoading, signUp, signInWithGoogle } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormData>({ resolver: zodResolver(signupSchema) });

  const passwordValue = watch("password", "");

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/dashboard");
    }
  }, [user, authLoading, router]);

  // ── Email / Password signup ──────────────────────────────────────────────
  const onSubmit = async (data: SignupFormData) => {
    try {
      await signUp(data.email, data.password, data.fullName);
      toast.success("Account created! Welcome to JobAI 🎉");
      window.location.href = "/dashboard";
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      const friendly = message.includes("email-already-in-use")
        ? "An account with this email already exists."
        : message.includes("weak-password")
        ? "Please choose a stronger password."
        : "Sign up failed. Please try again.";
      toast.error(friendly);
    }
  };

  // ── Google sign-up ───────────────────────────────────────────────────────
  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      toast.success("Account created! Welcome to JobAI 🎉");
      window.location.href = "/dashboard";
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (!message.includes("popup-closed-by-user")) {
        toast.error("Google sign-up failed. Please try again.");
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  // Loading screen while auth state resolves
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
              Create your free account
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Already have an account?{" "}
              <Link
                href="/auth/login"
                className="text-blue-600 font-medium hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>

          {/* Google button */}
          <button
            id="btn-google-signup"
            type="button"
            onClick={handleGoogleSignUp}
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
              <span className="bg-white px-3">or sign up with email</span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">

            {/* Full name */}
            <div>
              <label
                htmlFor="signup-fullname"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                Full name
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="signup-fullname"
                  type="text"
                  autoComplete="name"
                  placeholder="Jane Smith"
                  disabled={isFormLoading}
                  {...register("fullName")}
                  className={`w-full rounded-lg border pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-60 disabled:bg-gray-50 ${
                    errors.fullName
                      ? "border-red-400 focus:ring-red-400"
                      : "border-gray-200"
                  }`}
                />
              </div>
              {errors.fullName && (
                <p className="mt-1.5 text-xs text-red-500">{errors.fullName.message}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label
                htmlFor="signup-email"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                Email address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="signup-email"
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
              <label
                htmlFor="signup-password"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Min. 8 characters"
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
              <PasswordStrength password={passwordValue} />
              {errors.password && (
                <p className="mt-1.5 text-xs text-red-500">{errors.password.message}</p>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label
                htmlFor="signup-confirm-password"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                Confirm password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="signup-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  disabled={isFormLoading}
                  {...register("confirmPassword")}
                  className={`w-full rounded-lg border pl-10 pr-10 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-60 disabled:bg-gray-50 ${
                    errors.confirmPassword
                      ? "border-red-400 focus:ring-red-400"
                      : "border-gray-200"
                  }`}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="mt-1.5 text-xs text-red-500">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              id="btn-email-signup"
              type="submit"
              disabled={isFormLoading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create account
            </button>
          </form>

          {/* Footer note */}
          <p className="mt-6 text-center text-xs text-gray-400">
            By signing up you agree to our{" "}
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
