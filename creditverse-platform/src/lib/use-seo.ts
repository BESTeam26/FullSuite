import { useEffect } from "react";

interface SeoOptions {
  title: string;
  description: string;
  canonical?: string;
  ogImage?: string;
  ogType?: "website" | "article";
  jsonLd?: object | object[];
  keywords?: string;
  noindex?: boolean;
}

const BASE_URL = "https://creditverse-platform.vibepreview.com";
const DEFAULT_OG =
  "https://vibe.filesafe.space/1787987653423982390/assets/f01ccac2-8970-4cb1-a0c9-25fc9c3e069a.png";

function absolutize(path: string): string {
  if (path.startsWith("http")) return path;
  return `${BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${key}"]`,
  );
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function removeMeta(attr: "name" | "property", key: string) {
  document.head
    .querySelectorAll<HTMLMetaElement>(`meta[${attr}="${key}"]`)
    .forEach((el) => el.remove());
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function setJsonLd(id: string, data: object | object[]) {
  const scriptId = `jsonld-${id}`;
  let el = document.getElementById(scriptId) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = scriptId;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

function clearJsonLd() {
  document.head
    .querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')
    .forEach((el) => el.remove());
}

export function useSeo({
  title,
  description,
  canonical = "/",
  ogImage = DEFAULT_OG,
  ogType = "website",
  jsonLd,
  keywords,
  noindex = false,
}: SeoOptions) {
  useEffect(() => {
    const absCanonical = absolutize(canonical);
    const absImage = absolutize(ogImage);

    document.title = title;
    setMeta("name", "description", description);
    if (keywords) setMeta("name", "keywords", keywords);
    setLink("canonical", absCanonical);

    if (noindex) {
      setMeta("name", "robots", "noindex, nofollow");
    } else {
      setMeta(
        "name",
        "robots",
        "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
      );
    }

    // Open Graph
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:type", ogType);
    setMeta("property", "og:url", absCanonical);
    setMeta("property", "og:image", absImage);
    setMeta("property", "og:image:width", "1200");
    setMeta("property", "og:image:height", "630");
    setMeta("property", "og:site_name", "BES Platform");
    setMeta("property", "og:locale", "en_US");

    // Twitter
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", absImage);

    // Article-specific (safe to set even for website type)
    setMeta(
      "property",
      "article:section",
      "Credit & Funding Operations Software",
    );

    // JSON-LD — always include the WebSite + Organization graph for AI discoverability
    clearJsonLd();
    const baseGraphs: object[] = [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "BES Platform",
        url: BASE_URL,
        potentialAction: {
          "@type": "SearchAction",
          target: `${BASE_URL}/#selector`,
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "BES",
        url: BASE_URL,
        logo: `${BASE_URL}/favicon.svg`,
        description:
          "One connected operating ecosystem for credit repair and funding businesses.",
        sameAs: [],
      },
    ];

    if (jsonLd) {
      if (Array.isArray(jsonLd)) baseGraphs.push(...jsonLd);
      else baseGraphs.push(jsonLd);
    }

    baseGraphs.forEach((d, i) => setJsonLd(`${canonical}-${i}`, d));

    return () => {
      removeMeta("name", "robots");
    };
  }, [
    title,
    description,
    canonical,
    ogImage,
    ogType,
    jsonLd,
    keywords,
    noindex,
  ]);
}

export { BASE_URL, DEFAULT_OG };
