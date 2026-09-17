import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { savedPercent, shrinkImage } from "./shrink-image";

const file = (name: string, type: string, bytes: number) =>
  new File([new Uint8Array(bytes)], name, { type });

/** A browser that can decode and re-encode, returning `out` bytes. */
const browserThatProduces = (out: number) => {
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({
    width: 4000, height: 3000, close: vi.fn(),
  })));
  const toBlob = vi.fn((cb: (b: Blob | null) => void) =>
    cb(new Blob([new Uint8Array(out)], { type: "image/webp" })));
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    if (tag !== "canvas") return document.createElementNS("http://www.w3.org/1999/xhtml", tag);
    return { width: 0, height: 0, getContext: () => ({ drawImage: vi.fn() }), toBlob } as unknown as HTMLElement;
  }) as typeof document.createElement);
  return { toBlob };
};

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("what is never touched", () => {
  beforeEach(() => browserThatProduces(1000));

  it("leaves a GIF completely alone", async () => {
    /* Drawing one to a canvas keeps a single frame. This is the bug Dee hit
       when a pasted GIF arrived as a still, and it must not come back through
       the compressor. */
    const gif = file("funny.gif", "image/gif", 8 * 1024 * 1024);
    expect(await shrinkImage(gif)).toBe(gif);
  });

  it("leaves a GIF alone even when its type is missing", async () => {
    const gif = file("funny.gif", "", 8 * 1024 * 1024);
    expect(await shrinkImage(gif)).toBe(gif);
  });

  it("leaves an SVG alone — it is text, and rasterising loses the point", async () => {
    const svg = file("logo.svg", "image/svg+xml", 900 * 1024);
    expect(await shrinkImage(svg)).toBe(svg);
  });

  it("leaves a PDF alone", async () => {
    const pdf = file("report.pdf", "application/pdf", 9 * 1024 * 1024);
    expect(await shrinkImage(pdf)).toBe(pdf);
  });

  it("leaves a small image alone rather than re-encoding for 3KB", async () => {
    const small = file("icon.png", "image/png", 40 * 1024);
    expect(await shrinkImage(small)).toBe(small);
  });
});

describe("what it does to a big screenshot", () => {
  it("returns a smaller WebP with the same base name", async () => {
    browserThatProduces(300 * 1024);
    const shot = file("Screenshot 2026-09-17.png", "image/png", 6 * 1024 * 1024);
    const out = await shrinkImage(shot);
    expect(out).not.toBe(shot);
    expect(out.name).toBe("Screenshot 2026-09-17.webp");
    expect(out.type).toBe("image/webp");
    expect(out.size).toBeLessThan(shot.size);
  });

  it("caps the long edge rather than the short one", async () => {
    const { toBlob } = browserThatProduces(300 * 1024);
    await shrinkImage(file("wide.png", "image/png", 6 * 1024 * 1024));
    /* 4000x3000 scaled so the LONG edge is 2000 — 2000x1500, not 2000x2667. */
    expect(toBlob).toHaveBeenCalled();
  });

  it("keeps the ORIGINAL when the re-encode came out bigger", async () => {
    /* A re-encode that grows the file has lost information and saved nothing. */
    browserThatProduces(9 * 1024 * 1024);
    const shot = file("noisy.png", "image/png", 6 * 1024 * 1024);
    expect(await shrinkImage(shot)).toBe(shot);
  });
});

describe("when the browser cannot help", () => {
  it("returns the original rather than throwing at somebody sending a picture", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => { throw new Error("undecodable"); }));
    const shot = file("broken.png", "image/png", 6 * 1024 * 1024);
    expect(await shrinkImage(shot)).toBe(shot);
  });

  it("returns the original where createImageBitmap does not exist", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    const shot = file("shot.png", "image/png", 6 * 1024 * 1024);
    expect(await shrinkImage(shot)).toBe(shot);
  });
});

describe("how much was saved", () => {
  it("is a whole percent", () => {
    expect(savedPercent(6_000_000, 300_000)).toBe(95);
  });
  it("is zero when nothing was saved", () => {
    expect(savedPercent(1000, 1000)).toBe(0);
    expect(savedPercent(1000, 2000)).toBe(0);
    expect(savedPercent(0, 0)).toBe(0);
  });
});
