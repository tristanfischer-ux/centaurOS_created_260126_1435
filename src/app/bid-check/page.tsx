import type { Metadata } from "next";
import { buildHtml } from "@/lib/lumicity/html";
import { DemoMount } from "@/components/lumicity/demo-mount";
import { ldScript, serviceLd } from "@/lib/seo";

const TITLE = "Public Tender Compliance Check | £600";
const DESC = "Send the tender pack and get every pass-or-fail condition, document, score and key date, each quoted from the tender, usually within a day. £600.";
const URL = "https://fractionalforge.app/bid-check";
const IMG = "https://fractionalforge.app/lumicity/img/bc-hero.jpg";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: URL },
  openGraph: { title: TITLE, description: DESC, url: URL, type: "website", locale: "en_GB", siteName: "Fractional Forge", images: [{ url: IMG, width: 1600, height: 900 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC, images: [IMG] },
};

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldScript(serviceLd("bid-check")) }} />
      <div dangerouslySetInnerHTML={{ __html: buildHtml("bid-check") }} />
      <DemoMount page="bid-check" />
    </>
  );
}
