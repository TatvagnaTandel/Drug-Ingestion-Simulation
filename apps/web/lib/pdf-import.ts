"use client";

import { appendPdfText, extractPdfMatches, type PdfImportResult } from "./pdf-parse";

const WORKER_PATH = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/pdf.worker.min.mjs`;
export const PDF_SIZE_LIMIT_MB = 10;
const MAX_PDF_PAGES = 50;
const MAX_TEXT_LENGTH = 250_000;

class PdfReadIssue extends Error {}

export async function readMedicalPdf(file: Blob): Promise<PdfImportResult> {
  if (file.size > PDF_SIZE_LIMIT_MB * 1024 * 1024) {
    throw new PdfReadIssue(`This PDF exceeds ${PDF_SIZE_LIMIT_MB} MB. Choose a smaller report.`);
  }

  const signature = new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer());
  if (!signature.includes("%PDF-")) {
    throw new PdfReadIssue("That file is not a PDF. Choose a report saved as .pdf.");
  }

  const pdfjs = await import("pdfjs-dist").catch(() => {
    throw new PdfReadIssue("The PDF reader could not be loaded. Try again in a moment.");
  });
  pdfjs.GlobalWorkerOptions.workerSrc = WORKER_PATH;
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    disableFontFace: true,
    isEvalSupported: false,
    useWorkerFetch: false,
    stopAtErrors: true,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });

  const output: { text: string; baseline?: number } = { text: "" };
  try {
    const pdf = await task.promise;
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new PdfReadIssue("This PDF exceeds 50 pages. Choose a shorter report.");
    }

    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const reader = page.streamTextContent().getReader();
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        for (const item of chunk.value.items) {
          if ("str" in item) appendPdfText(output, item);
          if (output.text.length > MAX_TEXT_LENGTH) {
            throw new PdfReadIssue("This PDF contains too much text. Choose a shorter report.");
          }
        }
      }
      output.text += "\n";
      output.baseline = undefined;
      page.cleanup();
    }
  } catch (cause) {
    if (cause instanceof PdfReadIssue) throw cause;
    if (cause instanceof Error && cause.name === "PasswordException") {
      throw new PdfReadIssue("This PDF is password-protected. Unlock a copy before importing it.");
    }
    if (cause instanceof Error && /worker/i.test(cause.message)) {
      throw new PdfReadIssue("The PDF reader could not be started. Reload the page and try again.");
    }
    throw new PdfReadIssue("This PDF appears to be damaged. Export a fresh copy and try again.");
  } finally {
    await task.destroy().catch(() => {});
  }

  if (!output.text.trim()) {
    throw new PdfReadIssue("This looks like a scanned PDF with no text layer. Choose a text-based PDF.");
  }
  const matches = extractPdfMatches(output.text);
  if (!matches.length) {
    throw new PdfReadIssue("The PDF opened, but no labelled numeric values could be found.");
  }
  return { matches };
}
