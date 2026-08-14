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
    default: "Fractional Forge — the front end for hardware",
    template: "%s | Fractional Forge",
  },
  description: "Fractional Forge helps deep-tech and hardware founders get funded — and built. We bring the commercial strategy, the capital (introducer/success-fee), and a curated network of Europe's best engineering and manufacturing partners. Every Design Dossier is reviewed by a senior engineer before you see it. Your first is free.",
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
    title: "Fractional Forge — the front end for hardware",
    description: "Fractional Forge helps deep-tech and hardware founders get funded — and built. We bring the commercial strategy, the capital (introducer/success-fee), and a curated network of Europe's best engineering and manufacturing partners. Every Design Dossier is reviewed by a senior engineer before you see it. Your first is free.",
    url: "https://fractionalforge.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "Fractional Forge — the front end for hardware",
    description: "Fractional Forge helps deep-tech and hardware founders get funded — and built. We bring the commercial strategy, the capital (introducer/success-fee), and a curated network of Europe's best engineering and manufacturing partners. Every Design Dossier is reviewed by a senior engineer before you see it. Your first is free.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

// Sitewide structured data (GEO/AEO): make "Fractional Forge" and
// "Tristan Fischer" resolvable entities for search + AI answer-engines.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://fractionalforge.app/#organization",
      name: "Fractional Forge",
      legalName: "Fractional Forge Ltd",
      url: "https://fractionalforge.app",
      logo: "https://fractionalforge.app/icons/icon-192x192.png",
      description:
        "The front end for hardware. Fractional Forge helps deep-tech and hardware founders get funded and built: commercial strategy, capital (introducer/success-fee), and a curated network of Europe's best engineering and manufacturing partners. Every Design Dossier is reviewed by a senior engineer.",
      slogan: "The front end for hardware",
      areaServed: ["United Kingdom", "Europe"],
      founder: { "@id": "https://fractionalforge.app/#tristan-fischer" },
    },
    {
      "@type": "Person",
      "@id": "https://fractionalforge.app/#tristan-fischer",
      name: "Tristan Fischer",
      jobTitle: "Founder",
      url: "https://fractionalforge.app/about",
      worksFor: { "@id": "https://fractionalforge.app/#organization" },
      description:
        "Founder of Fractional Forge. 25+ years founding, financing and scaling capital-intensive technology businesses across solar, wind, tidal, batteries, vertical farming and carbon capture. Project finance at Citigroup, corporate venture capital at Shell Technology Ventures, an AIM IPO, around £200m raised, and a decade building Fischer Farms.",
      sameAs: [
        "https://www.linkedin.com/in/tristanfischer/",
        "https://www.historyfuturenow.com/",
      ],
    },
    {
      "@type": "WebSite",
      "@id": "https://fractionalforge.app/#website",
      url: "https://fractionalforge.app",
      name: "Fractional Forge",
      publisher: { "@id": "https://fractionalforge.app/#organization" },
    },
    {
      "@type": "Service",
      "@id": "https://fractionalforge.app/#design-dossier",
      name: "Design Dossier",
      serviceType: "Engineering design and costing study",
      description:
        "A costed, physics-checked engineering design for a hardware product: a buildable design, a costed bill-of-materials ledger, engineering drawings, a financial model and a risk register — delivered as an auditable Excel workbook within a few business days, reviewed by senior engineers from Fractional Forge's partner network. The first Dossier is free.",
      provider: { "@id": "https://fractionalforge.app/#organization" },
      areaServed: ["United Kingdom", "Europe"],
      offers: {
        "@type": "Offer",
        price: 0,
        priceCurrency: "GBP",
        description: "The first Design Dossier is free.",
        url: "https://fractionalforge.app/brief",
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
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
