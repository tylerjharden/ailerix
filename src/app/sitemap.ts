import type { MetadataRoute } from "next";

const BASE = "https://ailerix.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pages = [
    "/",
    "/docs",
    "/models",
    "/playground",
    "/dashboard",
    "/sign-in",
    "/sign-up",
  ];

  return pages.map((path) => ({
    url: path === "/" ? BASE : `${BASE}${path}`,
    lastModified: now,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
