"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { clsx } from "clsx";
import { setWizardState, getWizardState, isValidLinkedInUrl } from "@/lib/linkedin-wizard";
import { WizardStepIndicator } from "@/components/linkedin/WizardStepIndicator";

// ─────────────────────────────────────────────────────────────────────────────
// LinkedIn SVG
// ─────────────────────────────────────────────────────────────────────────────
function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LinkedIn profile dropdown mockup illustration
// ─────────────────────────────────────────────────────────────────────────────
function LinkedInDropdownMockup() {
  return (
    <div className="inline-flex flex-col bg-white border border-gray-200 rounded-lg shadow-md text-[11px] w-44 overflow-hidden select-none">
      {/* Header bar */}
      <div className="bg-[#0077B5] h-1.5 w-full" />
      <div className="px-3 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
          YN
        </div>
        <div>
          <p className="font-semibold text-gray-800 leading-tight">Your Name</p>
          <p className="text-gray-500 leading-tight">Job Title</p>
        </div>
      </div>
      <button className="mx-3 my-2 py-1 border border-gray-400 rounded text-gray-700 font-semibold text-[10px] hover:bg-gray-50">
        View Profile
      </button>
      <div className="h-px bg-gray-100 mx-0" />
      {["Settings & Privacy", "Help", "Language", "Sign Out"].map(item => (
        <div key={item} className="px-3 py-1.5 text-gray-600 hover:bg-gray-50 cursor-pointer">{item}</div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function LinkedInStep1Page() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const valid = isValidLinkedInUrl(url);

  // Restore any previous URL from wizard state
  useEffect(() => {
    const state = getWizardState();
    if (state.linkedInUrl) setUrl(state.linkedInUrl);
  }, []);

  const handleContinue = () => {
    if (!valid) return;
    setWizardState({ linkedInUrl: url.trim() });
    router.push("/linkedin/jobs");
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center py-10">
      <div className="w-full max-w-xl">

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 rounded bg-[#0077B5] flex items-center justify-center flex-shrink-0">
            <LinkedinIcon className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-2xl font-black text-gray-900">LinkedIn Optimization</h1>
        </div>
        <p className="text-sm text-gray-500 mb-8 ml-11">
          Get noticed on LinkedIn. Your LinkedIn profile score is just 2 steps away.
        </p>

        {/* Step indicator */}
        <WizardStepIndicator currentStep={1} />

        {/* URL input card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-5">
          <label className="block text-sm font-bold text-gray-800 mb-2">
            Add LinkedIn Profile URL
          </label>
          <input
            id="linkedin-url-input"
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && valid) handleContinue(); }}
            placeholder="https://www.linkedin.com/in/your-name"
            className={clsx(
              "w-full rounded-xl border px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 transition-colors",
              url && !valid
                ? "border-red-300 focus:ring-red-400 bg-red-50"
                : "border-gray-200 focus:ring-blue-500 bg-white"
            )}
          />
          {url && !valid && (
            <p className="mt-1.5 text-xs text-red-500">
              Please enter a valid LinkedIn profile URL (e.g. https://linkedin.com/in/your-name)
            </p>
          )}
          <button
            id="linkedin-continue-btn"
            onClick={handleContinue}
            disabled={!valid}
            className={clsx(
              "mt-4 w-full py-3 rounded-xl text-sm font-bold transition-all",
              valid
                ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            )}
          >
            Continue
          </button>
        </div>

        {/* How to get your LinkedIn URL */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
          <p className="text-sm font-bold text-blue-800 mb-4">How to Get Your LinkedIn URL</p>
          <div className="space-y-4">
            {/* Step 1 */}
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-[11px] font-black flex items-center justify-center flex-shrink-0">1</span>
              <p className="text-sm text-blue-900 pt-0.5">
                Log into <span className="font-semibold">LinkedIn</span> at{" "}
                <a href="https://linkedin.com" target="_blank" rel="noreferrer" className="underline text-blue-600">linkedin.com</a>
              </p>
            </div>

            {/* Step 2 with mockup */}
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-[11px] font-black flex items-center justify-center flex-shrink-0">2</span>
              <div className="flex-1">
                <p className="text-sm text-blue-900 mb-3">
                  Click <span className="font-semibold">"Me"</span> at the top of your LinkedIn homepage
                </p>
                <div className="flex justify-start">
                  <LinkedInDropdownMockup />
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-[11px] font-black flex items-center justify-center flex-shrink-0">3</span>
              <div className="flex-1">
                <p className="text-sm text-blue-900 mb-2">Copy the URL from your browser's address bar</p>
                {/* Address bar mockup */}
                <div className="flex items-center gap-2 bg-white border border-blue-200 rounded-lg px-3 py-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                  <span className="text-[11px] text-gray-500 font-mono truncate">
                    linkedin.com/in/<span className="text-blue-600 font-semibold">your-name</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
