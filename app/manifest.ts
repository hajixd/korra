import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Korra",
    short_name: "Korra",
    description: "XAUUSD trading terminal with Databento gold futures charting, assistant tools, and backtesting.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#080b10",
    theme_color: "#080b10",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable"
      }
    ]
  };
}
