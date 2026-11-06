import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lincoz General POS",
    short_name: "General POS",
    description: "Enterprise Multi-Tenant Retail & General Store POS Mobile Application",
    start_url: "/dashboard/pos",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f8fafc",
    theme_color: "#2563eb",
    categories: ["business", "finance", "productivity", "shopping"],
    icons: [
      {
        src: "/logo.jpeg",
        sizes: "192x192",
        type: "image/jpeg",
        purpose: "any",
      },
      {
        src: "/logo.jpeg",
        sizes: "512x512",
        type: "image/jpeg",
        purpose: "maskable",
      },
    ],
  };
}

