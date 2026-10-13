import type { Metadata } from "next";
import { buildHomeHtml } from "@/lib/home/html";

export const metadata: Metadata = {
  title: "Fractional Forge | Planning, ecology, tender and engineering reports",
  description:
    "Planning condition registers, ecology desk studies, public tender checks and costed engineering designs. Built from public documents, checked by a person, fixed prices and no sales calls.",
  alternates: { canonical: "https://fractionalforge.app/" },
};

export default function HomePage() {
  return <div dangerouslySetInnerHTML={{ __html: buildHomeHtml() }} />;
}
