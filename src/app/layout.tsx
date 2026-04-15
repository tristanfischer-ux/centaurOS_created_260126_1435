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
    default: "ForgeOS — The Operating System for Hardware Startups",
    template: "%s | ForgeOS",
  },
  description: "Expert knowledge, smart tools, investor intelligence, and manufacturing connections — everything a hardware startup needs, in one platform. Free to start.",
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
    title: "ForgeOS",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_GB",
    siteName: "ForgeOS by Fractional Forge",
    title: "ForgeOS — The Operating System for Hardware Startups",
    description: "Expert knowledge, smart tools, investor intelligence, and manufacturing connections — everything a hardware startup needs, in one platform. Free to start.",
    url: "https://fractionalforge.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "ForgeOS — The Operating System for Hardware Startups",
    description: "Expert knowledge, smart tools, investor intelligence, and manufacturing connections — everything a hardware startup needs, in one platform. Free to start.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
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
