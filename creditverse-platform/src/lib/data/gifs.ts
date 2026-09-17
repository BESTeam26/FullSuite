/**
 * GIF search, through the Edge Function that holds the key.
 *
 * The browser never sees the provider's API key — the same rule as the AI
 * gateway and every other integration here. What it does do is fetch the
 * chosen GIF from the provider's CDN and hand it to the composer as a File,
 * so it is uploaded to BES storage and lives in the conversation like any
 * other image rather than as a hotlink to somebody else's server.
 */
import { requireSupabase } from "@/lib/supabase/client";

export interface GifResult {
  id: string;
  description: string;
  previewUrl: string;
  url: string;
  width: number | null;
  height: number | null;
}

const call = async (body: Record<string, unknown>) => {
  const { data, error } = await requireSupabase().functions.invoke("gif-search", { body });
  if (error) {
    const response = (error as { context?: Response })?.context;
    if (response && typeof response.json === "function") {
      try {
        const payload = await response.json();
        if (typeof payload?.error === "string") throw new Error(payload.error);
      } catch (parsed) {
        if (parsed instanceof Error && parsed.message) throw parsed;
      }
    }
    throw error;
  }
  return data as Record<string, unknown>;
};

export async function gifSearchConnected(): Promise<boolean> {
  const data = await call({ action: "config" });
  return data.connected === true;
}

export async function searchGifs(query: string): Promise<GifResult[]> {
  const data = await call({ query, limit: 24 });
  return (Array.isArray(data.results) ? data.results : []) as GifResult[];
}

/**
 * Turn a chosen GIF into a File the composer can attach.
 *
 * Fetched in the browser because the provider's CDN allows it, and because
 * routing a few hundred kilobytes of animation through an Edge Function to
 * end up in the same place would be paying twice for nothing.
 */
export async function gifAsFile(gif: GifResult): Promise<File> {
  const r = await fetch(gif.url);
  if (!r.ok) throw new Error("That GIF could not be downloaded.");
  const blob = await r.blob();
  /* A name that reads sensibly in the Files tab and in a download folder. */
  const safe = gif.description.replace(/[^\w\s-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60);
  return new File([blob], `${safe || "gif"}.gif`, { type: blob.type || "image/gif" });
}
