import type { Metadata } from "next";
import { buildDdHtml } from "@/lib/home/dd";
import { ldScript, serviceLd } from "@/lib/seo";

const TITLE = "Costed Engineering Design | First Dossier Free";
const DESC = "Send a short brief and get a buildable engineering design, costed bill of materials, drawings and financial model in a few days. First Dossier free.";
const URL = "https://fractionalforge.app/design-dossier";
const IMG = "https://fractionalforge.app/ff/img/barge-sea.jpg";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: URL },
  openGraph: { title: TITLE, description: DESC, url: URL, type: "website", locale: "en_GB", siteName: "Fractional Forge", images: [{ url: IMG, width: 1600, height: 900 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC, images: [IMG] },
};

export default function DesignDossierPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldScript(serviceLd("design-dossier")) }} />
      <div dangerouslySetInnerHTML={{ __html: buildDdHtml() }} />
    </>
  );
}
