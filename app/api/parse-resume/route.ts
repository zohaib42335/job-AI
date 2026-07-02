import { NextRequest, NextResponse } from "next/server";
import { parseResumeText } from "@/lib/resume";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const buffer   = Buffer.from(await file.arrayBuffer());
    let   rawText  = "";

    // ── .docx ────────────────────────────────────────────────────────────────
    if (fileName.endsWith(".docx")) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth") as {
        extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
      };
      const result = await mammoth.extractRawText({ buffer });
      rawText = result.value ?? "";

    // ── .pdf ─────────────────────────────────────────────────────────────────
    } else if (fileName.endsWith(".pdf")) {
      // Use the internal module to avoid pdf-parse's test-fixture require() at
      // the top level, which crashes under Next.js webpack bundling.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
        buffer: Buffer
      ) => Promise<{ text: string }>;
      const result = await pdfParse(buffer);
      rawText = result.text ?? "";

    // ── .doc (legacy Word) ────────────────────────────────────────────────────
    } else if (fileName.endsWith(".doc")) {
      return NextResponse.json(
        { error: "Legacy .doc files are not supported. Please save as .docx or .pdf." },
        { status: 415 }
      );

    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a .pdf or .docx file." },
        { status: 415 }
      );
    }

    if (!rawText.trim()) {
      return NextResponse.json(
        { error: "No text could be extracted. The file may be image-based or password-protected." },
        { status: 422 }
      );
    }

    const parsed = parseResumeText(rawText);
    return NextResponse.json({ success: true, data: parsed, rawText: rawText.slice(0, 3000) });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[parse-resume] ERROR:", message);
    return NextResponse.json({ error: `Parse failed: ${message}` }, { status: 500 });
  }
}
