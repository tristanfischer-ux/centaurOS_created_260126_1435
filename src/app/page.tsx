import type { Metadata } from "next";
import { buildHomeHtml } from "@/lib/home/html";
import { homeLd, ldScript } from "@/lib/seo";

const TITLE = "Fractional Forge | Planning, Ecology, Tender & Engineering Reports";
const DESC = "Fixed-price planning, ecology and tender reports from £150, plus costed engineering designs. Plain English, usually within a day, with no sales calls.";
const IMG = "https://fractionalforge.app/ff/img/home-hero.jpg";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESC,
  alternates: { canonical: "https://fractionalforge.app/" },
  openGraph: { title: TITLE, description: DESC, url: "https://fractionalforge.app/", type: "website", locale: "en_GB", siteName: "Fractional Forge", images: [{ url: IMG, width: 1360, height: 768 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC, images: [IMG] },
};

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldScript(homeLd()) }} />
      <div dangerouslySetInnerHTML={{ __html: buildHomeHtml() }} />
    </>
  );
}
