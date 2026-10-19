// Structured data (schema.org JSON-LD) for search engines and AI agents.
// Facts only: keep in step with the page copy; no partner-network or count claims.
import lumi from "@/lib/lumicity/copy.json";
import dd from "@/lib/home/dd-copy.json";
import { FAQS as HOME_FAQS } from "@/lib/home/html";

const SITE = "https://fractionalforge.app";
const ORG = { "@id": `${SITE}/#organization` };

type Offer = { price: number; unit: string; desc: string };
type Svc = { key: string; name: string; type: string; audience: string; desc: string; offers: Offer[]; image: string };

export const SERVICES: Svc[] = [
  { key: "condition-desk", name: "Condition Desk", type: "Planning conditions register", audience: "Housebuilders, land promoters and planning consultants",
    desc: "Send a planning decision notice and get a plain-English register of every planning condition, usually within a day: what the council needs, when it is due, who usually prepares it and which documents to gather, with the conditions that block a start on site picked out and covering letters drafted.",
    offers: [{ price: 400, unit: "per planning permission", desc: "One planning permission" }, { price: 1000, unit: "per month", desc: "Up to five live sites a month" }], image: "/lumicity/img/cd-hero.jpg" },
  { key: "habitat-draft", name: "Habitat Draft", type: "Ecology desk study", audience: "Ecology consultancies",
    desc: "A two-page ecology desk study before the walkover, usually within a day: protected sites and priority habitats within 600 metres, a first habitat map from national data, tree and hedge heights from the Environment Agency laser survey, and the parcels to check on site. The client's ecologist checks and signs everything.",
    offers: [{ price: 150, unit: "per desk study", desc: "One desk study" }, { price: 1000, unit: "per month", desc: "Up to eight desk studies a month" }], image: "/lumicity/img/hd-hero.jpg" },
  { key: "bid-check", name: "Bid Check", type: "Public tender compliance check", audience: "Firms that bid for public contracts",
    desc: "Send a public tender pack and get a bid at a glance, usually within a day: every pass-or-fail condition, every document to submit, how bids are scored and the key dates, each quoted from the tender.",
    offers: [{ price: 600, unit: "per tender", desc: "One tender" }, { price: 1500, unit: "per month", desc: "Up to three tenders a month" }], image: "/lumicity/img/bc-hero.jpg" },
  { key: "design-dossier", name: "Design Dossier", type: "Engineering design and costing study", audience: "Hardware and deep-tech founders",
    desc: "Send a short brief and get, in a few days, a buildable design, a costed bill of materials, the true cost and a financial model, engineering drawings, worked calculations and a risk and regulatory register, in a live Excel workbook where every number is a traceable formula.",
    offers: [{ price: 2500, unit: "per Design Dossier", desc: "One Design Dossier" }, { price: 6000, unit: "per month", desc: "Up to three Design Dossiers a month" }], image: "/ff/img/dd-card.jpg" },
];

export const SITE_GRAPH = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${SITE}/#organization`, name: "Fractional Forge", legalName: "Fractional Forge Limited", url: SITE,
      logo: `${SITE}/icons/icon-192x192.png`, email: "tristan.fischer@fractionalforge.app", areaServed: "GB",
      description: "Fractional Forge runs four fixed-price specialist report services: Condition Desk (planning conditions registers), Habitat Draft (ecology desk studies), Bid Check (public tender checks) and Design Dossier (costed engineering designs for hardware founders). Everything is ordered by email or web form; there are no sales calls.",
      founder: { "@id": `${SITE}/#tristan-fischer` },
      makesOffer: SERVICES.map((s) => ({ "@type": "Offer", itemOffered: { "@id": `${SITE}/${s.key}#service` } })) },
    { "@type": "Person", "@id": `${SITE}/#tristan-fischer`, name: "Tristan Fischer", jobTitle: "Director", url: `${SITE}/about`,
      worksFor: ORG, image: `${SITE}/images/site/tristan.webp`,
      description: "Chief executive or board director of fourteen companies, almost all hard technology (wind, solar, wave and tidal, batteries, carbon capture, controlled-environment agriculture). Built three greenfield industrial sites, including a 25,000 m² automated factory at Fischer Farms. Raised around £200m. Started in project finance at Citigroup and ran corporate venture investments at Shell Technology Ventures.",
      sameAs: ["https://www.linkedin.com/in/tristanfischer/", "https://www.historyfuturenow.com/"] },
    { "@type": "WebSite", "@id": `${SITE}/#website`, url: SITE, name: "Fractional Forge", inLanguage: "en-GB", publisher: ORG },
  ],
};

const faqLd = (url: string, faqs: { q: string; a: string }[]) => ({
  "@type": "FAQPage", "@id": `${url}#faq`, url,
  mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
});

export function homeLd() {
  const url = `${SITE}/`;
  return { "@context": "https://schema.org", "@graph": [
    { "@type": "ItemList", "@id": `${url}#services`, name: "Fractional Forge services",
      itemListElement: SERVICES.map((s, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/${s.key}`, name: s.name })) },
    faqLd(url, HOME_FAQS.map(([q, a]) => ({ q, a }))),
  ] };
}

export function serviceLd(key: string) {
  const s = SERVICES.find((x) => x.key === key)!;
  const url = `${SITE}/${key}`;
  const faqs = key === "design-dossier" ? dd.faqs : (lumi as Record<string, { faqs: { q: string; a: string }[] }>)[key].faqs;
  return { "@context": "https://schema.org", "@graph": [
    { "@type": "Service", "@id": `${url}#service`, name: s.name, serviceType: s.type, description: s.desc, url, image: `${SITE}${s.image}`,
      provider: ORG, areaServed: "GB", audience: { "@type": "BusinessAudience", name: s.audience },
      offers: s.offers.map((o) => ({ "@type": "Offer", price: o.price, priceCurrency: "GBP", description: `${o.desc} (${o.unit})`, url, availability: "https://schema.org/InStock" })) },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Fractional Forge", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: s.name, item: url } ] },
    faqLd(url, faqs),
  ] };
}

export const ldScript = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
