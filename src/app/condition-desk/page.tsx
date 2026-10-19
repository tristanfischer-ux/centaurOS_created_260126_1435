import type { Metadata } from "next";
import { buildHtml } from "@/lib/lumicity/html";
import { DemoMount } from "@/components/lumicity/demo-mount";
import { ldScript, serviceLd } from "@/lib/seo";

const TITLE = "Planning Conditions Register and Review | £400";
const DESC = "Send your decision notice and get a plain-English condition register, start-on-site blockers and draft covering letters, usually within a day. £400.";
const URL = "https://fractionalforge.app/condition-desk";
const IMG = "https://fractionalforge.app/lumicity/img/cd-hero.jpg";

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldScript(serviceLd("condition-desk")) }} />
      <div dangerouslySetInnerHTML={{ __html: buildHtml("condition-desk") }} />
      <DemoMount />
    </>
  );
}
