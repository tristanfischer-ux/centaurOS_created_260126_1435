#!/usr/bin/env python3
"""Build the Earth-observation screen in the Version 5 business-plan shape.

The shape is taken from the 5 October 2026 Version 5 summary business plan:
Heading 1 in navy, and a Side Heading style whose frame sits in the left
margin in navy (000080). Body text follows each side heading.
"""

from __future__ import annotations

import shutil
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor

TEMPLATE = Path("/tmp/bp/plan.docx")
OUT = Path("/tmp/eo-business-plan.docx")

# (side heading or None, body or None). A heading string starts a Heading 1.
# Tuples: ("H", text) or ("S", side, body) or ("P", body) or ("C", contents line)


def blocks() -> list[tuple]:
    return [
        ("T", "Fractional Forge Limited"),
        ("T", "AI and Earth observation"),
        ("T", "Five businesses one founder could start"),
        ("T", "The opportunity, the product, the first customers, the costs and financial results, the risks, the team and funding needed, and an honest verdict"),
        ("T", "Draft of 6 October 2026"),
        ("T", "Draft. Confidential."),
        ("T", "Tristan Fischer, Fractional Forge Limited"),
        ("C", "Contents"),
        ("C", "1   The opportunity and the customers"),
        ("C", "2   The product"),
        ("C", "3   The first customers"),
        ("C", "4   Costs and the financial results"),
        ("C", "5   What one paid job costs, and which part is ours"),
        ("C", "6   Why the price compares as it does"),
        ("C", "7   Risks, permits and compliance"),
        ("C", "8   Team and funding needed"),
        ("C", "9   Viability verdict"),
        ("C", "10  What is missing and needs more work"),
        ("H", "The opportunity and the customers"),
        ("S", "Someone already pays for the manual version.",
         "The search was for work that a company or a public body already pays for, or is forced to pay for, and that one person can do with models already in hand. A spacecraft, a field crew, and a team before the first invoice were ruled out. Earth-observation data is used where it changes the job. Where a phone or a drone scan is the honest tool, the plan says so."),
        ("S", "Twenty ideas were scored. Ten were killed. Five are written up.",
         "Each survivor was scored from one to five on existing spend, how much current models can do, whether imagery changes the job, how long the sale is, how fast a first invoice can come, the quality of the company already ahead, and whether a founder can start a moat. Hard failures never entered the twenty: no payer, no way for one person to start, no named company with a source, or a United States firm already on the United Kingdom asset."),
        ("S", "Four real ideas failed a filter before the twenty.",
         "Wind-blade inspection failed because SkySpecs, which raised 20 million dollars in March 2025, was already inspecting ScottishPower's East Anglia ONE. Jobsite cameras failed because OpenSpace bought the London firm Disperse on 28 October 2025. Dark-vessel monitoring failed because SynMax's buyer is a United States federal contract. Point-source methane failed because the imagery is commercial tasking and the liability is not a desk product."),
        ("S", "The ten that were killed had a concrete reason.",
         "Utility and corridor vegetation was killed because Schneider Electric agreed in July 2026 to buy AiDASH for 350 million dollars, and National Grid was already an investor. Underwriting scores were killed because Moody's bought Cape Analytics in January 2025 and ZestyAI reported 31 million assessments in 2024. Crop scouting was killed because Taranis already sells in Europe. Pipelines, oil tanks, the Woodland Carbon Code, linear habitat surveys, district fly-tipping and slurry maps were killed for enterprise sales, a buyer already procuring the work, or because they were the same product as a stronger sibling."),
        ("S", "The five that remain are a desk, not a constellation.",
         "Parcel Desk screens land for energy developers. Habitat Draft drafts a biodiversity metric for an ecologist to sign. Loss Line measures a roof for a loss adjuster. Pile Note turns a quarry's own scan into a monthly tonnage. Grade Check checks earthworks before a housebuilder pays. The first two do not need a pilot. Grade Check does, which is why it is last."),
        ("H", "The product"),
        ("S", "Parcel Desk kills a bad parcel before the option fee.",
         "A development manager sends a search area. The product returns a map and two pages. Each constraint is linked to the planning, flood, habitat or connection document that states it. Sentinel and aerial photography answer land cover. The product is the reading of the documents, which is the work the founder already does with models. Paces, in Brooklyn, sells the American version: an 11 million dollar Series A on 24 July 2024, led by Navitas Capital, and 7,439 searches on the platform in 2024."),
        ("S", "Habitat Draft is a workbook, not a signature.",
         "England has required a 10 percent biodiversity net gain since 12 February 2024 for major development and 2 April 2024 for small sites. Consultancies quote from about 399 pounds plus VAT for a simple survey to several thousand pounds for a harder one. The product is a first habitat map and a statutory-metric workbook, plus a list of polygons the model will not stand behind. The ecologist visits those polygons and signs. The company does not sign."),
        ("S", "Loss Line measures the roof and says what it cannot see.",
         "An adjuster still climbs a roof to produce a number a photograph often already contains. The product is a measurement sheet from the aerial archive, with an explicit note of what the image does not show. Nearmap agreed on 20 May 2025 to buy itel, a United States claims-pricing firm, and its news trail records a 31 July 2025 release of roof and exterior measurement tools. Any savings figure in secondary copy is unverified. The sheet is not a settlement."),
        ("S", "Pile Note and Grade Check are quantities, not satellites.",
         "A quarry finance team still books a contractor survey twice a year. Pile Note takes a scan the site sends and returns a monthly tonnage in a PDF. Stockpile Reports publishes a United States self-serve price from 100 dollars a month. Grade Check compares a scan to the design and says how much earth moved, before the contractor is paid. TraceAir raised 25 million dollars on 29 May 2024 for that job in the United States, and says 18 of the top 20 American builders use it. That builder count is the company's own claim. Centimetre volumes are the wrong job for Sentinel. Both products say so."),
        ("H", "The first customers"),
        ("S", "Start with people who can say yes without a tender.",
         "Parcel Desk's first customers are in-house development managers at United Kingdom solar, battery and data-centre developers. Habitat Draft's first customers are ecological consultancies who already publish a small-site fee. Loss Line's first customers are independent loss adjusters, not a carrier transformation programme. Pile Note's first customers are quarry finance controllers. Grade Check's first customers are land directors at housebuilders, and only after two pilots have quoted in writing."),
        ("S", "The buyers who need a tender are not the first year.",
         "Planning enforcement teams already use aerials. Hull City Council uses Bluesky 5 centimetre photography, through the APGB contract, for desktop reviews of unplanned structures. That is a real budget and a slow sale, which is why it stayed in the ten and not the five. The Environment Agency raised its waste-crime budget to 15.6 million pounds and describes waste crime as costing England about 1 billion pounds a year. That is also one buyer. Neither is the first invoice."),
        ("S", "One channel each, and a public teardown first.",
         "Parcel Desk publishes three memos on parcels anyone can check, then asks for a paid screen on a live site. Habitat Draft redrafts five sites a consultancy has already signed, and shows the disagreement. Loss Line runs thirty old claims against imagery. Pile Note compares one scan with the last contractor figure. Grade Check does not start until the pilot price is on paper."),
        ("H", "Costs and the financial results"),
        ("S", "No year-three profit is stated, because none has been observed.",
         "The prices below are assumptions, labelled as such. They are not a forecast a lender should treat as a projection. The sourced facts are the prices and funding of the companies already ahead, and the fees already charged for the manual job. Where a United Kingdom price was not on a public page, it is not invented."),
        ("S", "Parcel Desk: 750 pounds a screen, if the price holds.",
         "Assumption: 750 pounds a screen, and 400 pounds a month to watch twenty parcels already under option. Forty developers buying twenty screens a year would be 600,000 pounds. Every term in that sum is an assumption except the existence of the American buyer. Gross margin stays above 70 percent only while commercial imagery and a subcontracted expert stay off the ordinary search."),
        ("S", "Habitat Draft: 120 pounds a draft, against a survey of hundreds.",
         "Assumption: 120 pounds a draft. Thirty consultancies sending fifteen drafts a month would be about 648,000 pounds a year. The sourced fees are the survey quotes, from 399 pounds plus VAT upward, and Defra's annex figure of about 400 to 1,600 pounds per dwelling for the wider biodiversity-net-gain cost. The conversion of those fees into draft purchases is not sourced."),
        ("S", "Loss Line, Pile Note and Grade Check are smaller books.",
         "Assumption: Loss Line at 40 pounds a sheet, or an 800 pound monthly minimum once a firm is sending files. Twenty firms at thirty claims a month would be about 288,000 pounds a year, and only if the firm supplies the image or the licence is inside the 40 pounds. Pile Note at 400 pounds a site a month for twenty-five sites is 120,000 pounds a year, which is a practice, not a venture round. Grade Check at 600 pounds a flight, of which about 250 pounds is the pilot, is about 346,000 pounds a year at eight builders and six sites. If the pilot wants 450 pounds, the product stops."),
        ("H", "What one paid job costs, and which part is ours"),
        ("S", "The founder's time is the cost. Imagery is the exception.",
         "Parcel Desk and Habitat Draft are time. The documents and the statutory workbook are public. Aerials, where needed, should come through a licence the customer already holds, or through APGB-class photography a council or a consultancy already receives. A commercial scene is bought only for a shortlisted parcel or a claim the archive cannot see."),
        ("S", "Grade Check is the only product with a third-party cost inside the price.",
         "The pilot is paid per flight and named on the order. Professional indemnity for a quantity that moves a payment application was not retrieved and has to be priced before the first paid flight. Pile Note declines the job if the site cannot film. It does not quietly hire a pilot."),
        ("S", "Nothing here is a data-centre hall, and nothing is costed as one.",
         "There is no tenant fit-out, no computer bill, and no fuel case. The waterfall in the Version 5 barge plan does not apply. The equivalent split is simpler: the customer owns the site, the option, the signature or the payment application. We own the memo, the draft, the sheet or the quantity."),
        ("H", "Why the price compares as it does"),
        ("S", "The American products prove a budget, not a United Kingdom price.",
         "Paces compressed a job it describes as months. Stockpile Reports will sell the software for 100 dollars a month, which is why Pile Note has to be a done-for-you number rather than another app. Propeller's Boral story, on the vendor's own page, describes thousands of pounds per survey. TraceAir's Toll Brothers quote is a manager saying the scan is how contractor bills get checked. None of those pages states what a United Kingdom buyer will pay us."),
        ("S", "A fixed price is awkward for the incumbent who bills days.",
         "A land agent who sells days is awkward about a 750 pound screen. An ecologist who sells a survey can still sell Habitat Draft, because the signature stays theirs. An adjuster who bills the visit may refuse a sheet that cancels the visit, which is why Loss Line is sold as the measurement, with the visit kept for what the image cannot see. A survey firm that already flies a drone can add Grade Check's software. That is the comparison, and it is not a moat."),
        ("S", "AiDASH is the warning, not the model to copy.",
         "AiDASH closed a 58.5 million dollar Series C on 30 April 2024, total raised 91.5 million dollars, with Duke Energy, National Grid and Edison International in the round. Schneider's agreement to buy it is why a solo vegetation product is not in this plan. The biodiversity sentence in that same release is why Habitat Draft stays on small English sites, which a California infrastructure platform is not staffed to walk."),
        ("H", "Risks, permits and compliance"),
        ("S", "The signature, the visit and the quantity can each be wrong.",
         "Habitat Draft is labelled a preliminary baseline. A planning authority that will not accept a metric which started in a model, even after a person has signed, ends the product. Loss Line's imagery can be too old for a claims file. Pile Note's bad tonnage ends the relationship, because there is no brand to absorb it. Grade Check's wrong quantity is a professional claim."),
        ("S", "The companies already ahead can add a United Kingdom layer.",
         "Paces said it would look beyond the United States. Nearmap or a United Kingdom aerial firm can ship the measurement. Raptor Maps, which raised 35 million dollars in December 2024 and reported 71 gigawatts under management, is why a solo solar-defect report stayed out of the five. None of these is a permit. They are the competitive risk, and they are the reason the first ninety days are a paid test rather than a company build."),
        ("S", "No environmental permit is required to send a memo.",
         "The products do not discharge water, store fuel, or operate an aircraft in the founder's name. Grade Check's pilots must be legal to fly. That is their licence, checked before they are named. Data protection applies to a claims file and to a planning document that names a person. Files stay on the job they were sent for."),
        ("H", "Team and funding needed"),
        ("S", "Tristan leads. Nobody is hired before a paid job.",
         "One founder. A grid engineer and an ecologist are paid per memo when a signature is required. One adjuster is paid to reject the sheet format in week one. Two pilots are asked for a written price before Grade Check exists. None of them is an employee."),
        ("S", "No raise. The American rounds nationalised data. A desk does not.",
         "Paces' 11 million dollars and TraceAir's 25 million dollars are what those companies raised to cover a country. A United Kingdom desk can invoice without that. A raise before ten paying customers would be spent on a sales person for a buyer who is reached by a letter. Do not raise."),
        ("S", "Control stays with the founder because there is no cap table event.",
         "There is no sweat equity and no investor in this plan. If a raise is discussed later, it is after the paid tests below, and it is a separate decision. This document does not authorise one."),
        ("H", "Viability verdict"),
        ("S", "Viable as a practice. Unproven until someone pays.",
         "The opportunity is real: the duties and the surveys and the American products are sourced. The United Kingdom price, the willingness of an ecologist to use a draft, and the willingness of an adjuster to shrink a visit are not. The verdict is that two of the five are worth ninety days, and that a company should not be built around the other three until those two have an invoice."),
        ("S", "Start Parcel Desk and Habitat Draft. Park the other three.",
         "Both use models the founder already runs. Neither needs a drone, a satellite contract, or a hire. Loss Line is the third test if an adjuster will look at thirty old claims. Pile Note is the test if the preference is a trade buyer and a monthly PDF. Grade Check waits on two pilot quotes. Do not start a sixth idea in the same quarter."),
        ("S", "Three facts would most change the verdict.",
         "A development manager who will not pay 750 pounds, because the land agent already throws the screen in. An ecologist who will not put their name near a model draft. An aerial licence that costs more than the Loss Line fee can carry. Any one of those, observed rather than argued, demotes that idea."),
        ("H", "What is missing and needs more work"),
        ("S", "Every gap below has an owner and a next step.",
         "The owner of each step is Tristan, unless a paid reviewer is named. Nothing below is delegated to a hire that does not exist."),
        ("S", "Eleven open items.",
         "One: publish three Parcel Desk memos on public parcels in three weeks, then ask twenty development managers for a paid screen. Kill if none is paid by day 90. Two: pay an ecologist to mark up twenty historical biodiversity sites. Kill Habitat Draft if the draft is useless on simple sites by day 45, or if three consultancies will not pay by day 90. Three: agree the Loss Line sheet with one adjuster and run thirty historical claims. Four: get Stockpile Reports' published price in front of three quarry finance controllers and ask whether they would still pay 400 pounds for the number. Five: get two pilot quotes in writing before any Grade Check sales call. Six: price professional indemnity for a quantity used in a payment application. Seven: confirm whether a consultancy's existing aerial licence can be used for a draft. Eight: do not treat the Dealroom note of a Taranis Series D in May 2026 as more than a secondary write-up. Nine: the Nearmap measurement-tool headline is taken from the company's news trail; the wire story itself was not re-fetched, so no savings figure from it is used. Ten: re-run the OpenRouter loop in scripts/opportunity-screen.mjs when the API key is present. The catalogue was pinned on 6 October 2026. The chat calls did not run, because the key was not in the environment. Eleven: this document is a screen, not a decision to incorporate."),
    ]


def clear_body(doc: Document) -> None:
    body = doc.element.body
    for child in list(body):
        if child.tag == qn("w:sectPr"):
            continue
        body.remove(child)


def add_navy_line(doc: Document, text: str, *, bold: bool = False, size: int = 22) -> None:
    paragraph = doc.add_paragraph()
    run = paragraph.add_run(text)
    run.bold = bold
    run.font.color.rgb = RGBColor(0x00, 0x00, 0x80)
    run.font.size = Pt(size)
    run.font.name = "Arial"


def replace_header_footer(doc: Document) -> None:
    replacements = {
        "Version 5 summary business plan": "AI and Earth observation — five businesses",
        "5 October  2026": "6 October 2026",
        "5 October 2026": "6 October 2026",
    }
    for section in doc.sections:
        for part in (section.header, section.footer, section.first_page_header, section.first_page_footer):
            if part is None:
                continue
            for paragraph in part.paragraphs:
                for key, value in replacements.items():
                    if key in paragraph.text:
                        for run in paragraph.runs:
                            if key in run.text:
                                run.text = run.text.replace(key, value)


def main() -> None:
    shutil.copy(TEMPLATE, OUT)
    doc = Document(OUT)
    clear_body(doc)
    for block in blocks():
        kind = block[0]
        if kind == "T":
            paragraph = doc.add_paragraph(block[1], style="Title")
            if block[1].startswith("Draft"):
                paragraph.runs[0].bold = False
                paragraph.runs[0].font.size = Pt(12)
        elif kind == "C":
            add_navy_line(doc, block[1], bold=block[1] == "Contents", size=11 if block[1] != "Contents" else 14)
        elif kind == "H":
            doc.add_paragraph(block[1], style="Heading 1")
        elif kind == "S":
            doc.add_paragraph(block[1], style="Side Heading")
            doc.add_paragraph(block[2])
        else:
            raise ValueError(kind)
    replace_header_footer(doc)
    doc.save(OUT)
    print(OUT, OUT.stat().st_size)


if __name__ == "__main__":
    main()
