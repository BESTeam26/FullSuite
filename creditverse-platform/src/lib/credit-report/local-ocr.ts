/**
 * Reading a scanned report on the person's own computer.
 *
 * Rung two of the extraction ladder: Tesseract in the browser, so a scan that
 * has no text layer costs nothing and never leaves the machine. Loaded on
 * demand — it pulls a recognition model of several megabytes, and somebody
 * importing a CSV should never pay that download.
 *
 * The output is scored by the ladder before anyone sees it. Tesseract is good
 * on a clean printed scan and poor on a photograph taken at an angle, and the
 * difference between those two is exactly what `scoreExtraction` measures.
 */
import { assess, type LadderResult } from "./extraction-ladder";

export const LOCAL_OCR_PARSER_VERSION = "ocr-tesseract-1";

export interface LocalOcrProgress {
  /** 0 to 1, for a progress bar on a page that will sit there for a while. */
  ratio: number;
  label: string;
}

/**
 * Recognise text in an image. Pages are done one at a time on purpose: several
 * workers at once will lock up a phone, which is where a photographed report
 * usually comes from.
 */
export async function readImagesLocally(
  images: Blob[],
  onProgress?: (p: LocalOcrProgress) => void,
): Promise<LadderResult> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const pages: string[] = [];
    for (let i = 0; i < images.length; i++) {
      onProgress?.({
        ratio: i / images.length,
        label: `Reading page ${i + 1} of ${images.length} on your computer…`,
      });
      const { data } = await worker.recognize(images[i]);
      pages.push(data.text ?? "");
    }
    onProgress?.({ ratio: 1, label: "Checking what came back…" });
    return assess("local_ocr", pages.join("\n"));
  } finally {
    /* Always: a leaked worker holds a lot of memory on a phone. */
    await worker.terminate();
  }
}
