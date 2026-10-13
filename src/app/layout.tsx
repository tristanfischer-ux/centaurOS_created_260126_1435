import { SITE_GRAPH } from "@/lib/seo";
import type { Metadata, Viewport } from "next";
import { Outfit, Playfair_Display, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/ThemeProvider";
import { CookieConsent } from "@/components/cookie-consent";
import { Analytics } from "@vercel/analytics/next";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 3,  // Reduced from 5 to prevent layout issues at extreme zoom
  userScalable: true,
  themeColor: "#FFFFFF",
  // Enable viewport-fit for proper safe area handling on iOS
  viewportFit: "cover",
}

export const metadata: Metadata = {
  title: {
    default: "Fractional Forge | Planning, ecology, tender and engineering reports",
    template: "%s | Fractional Forge",
  },
  description: "Fixed-price specialist reports: planning conditions registers, ecology desk studies, public tender checks and costed engineering designs for hardware founders. Ordered by email or web form, with no sales calls.",
  metadataBase: new URL("https://fractionalforge.app"),
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192x192.png",
    shortcut: "/icons/icon-192x192.png",
    apple: "/icons/icon-192x192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Fractional Forge",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_GB",
    siteName: "Fractional Forge",
    title: "Fractional Forge | Planning, ecology, tender and engineering reports",
    description: "Fixed-price specialist reports: planning conditions registers, ecology desk studies, public tender checks and costed engineering designs for hardware founders. Ordered by email or web form, with no sales calls.",
    url: "https://fractionalforge.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "Fractional Forge | Planning, ecology, tender and engineering reports",
    description: "Fixed-price specialist reports: planning conditions registers, ecology desk studies, public tender checks and costed engineering designs for hardware founders. Ordered by email or web form, with no sales calls.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

// Sitewide structured data (GEO/AEO): make "Fractional Forge" and
// "Tristan Fischer" resolvable entities for search + AI answer-engines.
const JSON_LD = SITE_GRAPH;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
      </head>
      <body
        className={`${outfit.variable} ${playfair.variable} ${inter.variable} ${jetbrains.variable} antialiased font-sans`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Analytics />
          <Toaster />
          <CookieConsent />
        </ThemeProvider>
      </body>
    </html>
  );
}
