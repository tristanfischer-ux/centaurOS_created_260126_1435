import type { Metadata } from "next";
import { Outfit } from "next/font/google"; // Premium modern font
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "CentaurOS",
  description: "Operating System for Fractional Foundries",
};
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
        <meta name="theme-color" content="#FFFFFF" />
      </head>
      <body
        className={`${outfit.variable} antialiased bg-white text-slate-900 flex h-screen overflow-hidden font-sans`}
      >
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-white p-8 pb-32 lg:pb-8"> {/* pb-32 for mobile nav space */}
          {children}
        </main>
        <MobileNav />
      </body>
    </html>
  );
}
