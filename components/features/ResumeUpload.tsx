"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, FileText, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import type { ResumeFormData } from "@/app/resume-builder/types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type UploadStatus = "idle" | "uploading" | "success" | "error";

interface ResumeUploadProps {
  /** Called when parsing succeeds — populate the form with the returned data */
  onParsed: (data: Partial<ResumeFormData>, skills: string[]) => void;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ResumeUpload({ onParsed, className }: ResumeUploadProps) {
  const [status,   setStatus]   = useState<UploadStatus>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const reset = () => {
    setStatus("idle");
    setFileName(null);
    setErrorMsg(null);
  };

  const processFile = useCallback(
    async (file: File) => {
      setFileName(file.name);
      setStatus("uploading");
      setErrorMsg(null);

      try {
        const body = new FormData();
        body.append("file", file);

        const res = await fetch("/api/parse-resume", { method: "POST", body });

        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error ?? `Server error ${res.status}`);
        }

        const json = await res.json();
        const { data, skills } = json as {
          data: Partial<ResumeFormData> & { skills?: string[] };
          skills?: string[];
        };

        // skills may live inside data or top-level
        const parsedSkills: string[] = data.skills ?? skills ?? [];
        const { skills: _removed, ...formData } = data as typeof data & { skills?: string[] };
        void _removed;

        onParsed(formData, parsedSkills);
        setStatus("success");
        toast.success("Resume parsed! Review and edit the fields below.", { duration: 5000 });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Parse failed";
        setStatus("error");
        setErrorMsg(message);
        toast.error(message);
      }
    },
    [onParsed]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted) => { if (accepted[0]) processFile(accepted[0]); },
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    maxFiles: 1,
    disabled: status === "uploading",
  });

  // ── Success state ────────────────────────────────────────────────────────
  if (status === "success") {
    return (
      <div className={clsx("rounded-xl border border-green-200 bg-green-50 p-4 flex items-start gap-3", className)}>
        <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-green-800">Parsed successfully</p>
          <p className="text-xs text-green-700 truncate mt-0.5">{fileName}</p>
          <p className="text-xs text-green-600 mt-1">
            Fields have been pre-filled. Review each step and make any corrections.
          </p>
        </div>
        <button onClick={reset} className="text-green-500 hover:text-green-700 flex-shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────
  if (status === "error") {
    return (
      <div className={clsx("rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3", className)}>
        <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-red-700">Parse failed</p>
          <p className="text-xs text-red-600 mt-0.5">{errorMsg}</p>
        </div>
        <button onClick={reset} className="text-red-400 hover:text-red-600 flex-shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // ── Uploading state ──────────────────────────────────────────────────────
  if (status === "uploading") {
    return (
      <div className={clsx("rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-center gap-3", className)}>
        <Loader2 className="h-5 w-5 text-blue-600 animate-spin flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-blue-800">Parsing resume…</p>
          <p className="text-xs text-blue-600 truncate mt-0.5">{fileName}</p>
        </div>
      </div>
    );
  }

  // ── Idle / drop zone ─────────────────────────────────────────────────────
  return (
    <div
      {...getRootProps()}
      className={clsx(
        "rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-all duration-200",
        isDragActive
          ? "border-blue-500 bg-blue-50 scale-[1.01]"
          : "border-gray-200 hover:border-blue-300 hover:bg-gray-50",
        className
      )}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-2">
        {isDragActive ? (
          <FileText className="h-8 w-8 text-blue-500" />
        ) : (
          <UploadCloud className="h-8 w-8 text-gray-400" />
        )}
        <div>
          <p className="text-sm font-semibold text-gray-700">
            {isDragActive ? "Drop your resume here" : "Upload existing resume"}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Drag & drop or{" "}
            <span className="text-blue-600 underline underline-offset-2">browse</span>
            {" "}· PDF or DOCX
          </p>
        </div>
        <p className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-3 py-1">
          AI will auto-fill your form fields
        </p>
      </div>
    </div>
  );
}
