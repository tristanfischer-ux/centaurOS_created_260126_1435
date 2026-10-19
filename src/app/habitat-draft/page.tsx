import type { Metadata } from "next";
import { buildHtml } from "@/lib/lumicity/html";
import { DemoMount } from "@/components/lumicity/demo-mount";
import { ldScript, serviceLd } from "@/lib/seo";

const TITLE = "Ecology Desk Study and Habitat Map | £150";
const DESC = "Send a site boundary or planning reference. Get a two-page desk study, habitat map and laser-survey tree and hedge heights, usually within a day. £150.";
const URL = "https://fractionalforge.app/habitat-draft";
const IMG = "https://fractionalforge.app/lumicity/img/hd-hero.jpg";

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldScript(serviceLd("habitat-draft")) }} />
      <div dangerouslySetInnerHTML={{ __html: buildHtml("habitat-draft") }} />
      <DemoMount />
    </>
  );
}
