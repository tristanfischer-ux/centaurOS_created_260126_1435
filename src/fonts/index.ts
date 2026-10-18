import localFont from "next/font/local";

/** Self-hosted Fraunces (roman + italic). Preloaded: the homepage hero uses both. */
export const fraunces = localFont({
  src: [
    { path: "./Fraunces-latin.woff2", weight: "400 700", style: "normal" },
    { path: "./Fraunces-Italic-latin.woff2", weight: "400 700", style: "italic" },
  ],
  variable: "--font-fraunces",
  display: "swap",
  preload: true,
});

/** Self-hosted Inter. Preloaded: body copy on the public pages. */
export const inter = localFont({
  src: [{ path: "./Inter-latin.woff2", weight: "400 700", style: "normal" }],
  variable: "--font-inter",
  display: "swap",
  preload: true,
});
