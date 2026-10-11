import type { Metadata } from "next";
import { buildHtml } from "@/lib/lumicity/html";
import { DemoMount } from "@/components/lumicity/demo-mount";
import copy from "@/lib/lumicity/copy.json";

const C = copy["habitat-draft"];

export const metadata: Metadata = {
  title: `${C.name}, a Lumicity service`,
  description: C.subhead,
  openGraph: { title: `${C.name}, a Lumicity service`, description: C.subhead },
  twitter: { title: `${C.name}, a Lumicity service`, description: C.subhead },
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: buildHtml("habitat-draft") }} />
      <DemoMount page="habitat-draft" />
    </>
  );
}
