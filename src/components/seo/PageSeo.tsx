"use client";

import { useEffect } from "react";

interface PageSeoProps {
  title: string;
  description: string;
  path: string;
}

const BASE_URL = "https://ai.admeasy.in";

export default function PageSeo({ title, description, path }: PageSeoProps) {
  useEffect(() => {
    document.title = title;
    const url = `${BASE_URL}${path}`;
    const tags: Array<[string, string, string]> = [
      ["name", "description", description],
      ["property", "og:title", title],
      ["property", "og:description", description],
      ["property", "og:url", url],
      ["name", "twitter:title", title],
      ["name", "twitter:description", description],
    ];

    tags.forEach(([attr, key, content]) => {
      let node = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (!node) {
        node = document.createElement("meta");
        node.setAttribute(attr, key);
        document.head.appendChild(node);
      }
      node.content = content;
    });

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = url;
  }, [description, path, title]);

  return null;
}
