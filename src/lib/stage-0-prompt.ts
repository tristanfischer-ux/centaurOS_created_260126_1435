/**
 * Stage 0 prompt template for querying large language models during the
 * Reference Harvest. Each section maps 1:1 to a downstream pipeline stage
 * so that stage can extract its slice directly by heading.
 */

export function buildStage0Prompt(
  domain: string,
  description: string,
): string {
  return `You are a domain expert in ${domain}. Describe the physical architecture of a real, deployed system similar to: ${description}

Structure your response in EXACTLY these sections. Each section maps to a specific downstream engineering stage and will be consumed by that stage directly. Be specific — real numbers, real names, real systems. If you don't know something, say so — don't fabricate.

## 1. Regulatory and Standards (for Chase — research and regulatory matrix)
List every regulation, standard, and certification applicable in the United Kingdom. Include: the full name of each instrument, its reference number, what it requires, and which aspect of the design it affects. Minimum 8 entries.

## 2. Market and Competitors (for Brief Lock — mission and constraints)
Name specific competitors, their products, pricing, and market position. State market size with numbers. Identify the "why now" moment — what has changed recently to make this viable.

## 3. Subsystem Architecture (for Max — module decomposition)
List every major subsystem in a real deployed system of this type. For each: its function, what it connects to, and why it exists as a separate module. Do not invent subsystems — describe what real systems have.

## 4. Dimensions and Mass (for Sizing and Layout)
Provide per-subsystem dimensions (length, width, height in millimetres), mass (in kilograms), power consumption (in watts), and floor area (in square metres). State the total system envelope. Reference International Organisation for Standardisation container standards where applicable.

## 5. Components and Parts (for Bill of Materials)
List specific components with: manufacturer name, model or part number, material specification, typical quantity per system, and approximate unit cost in pounds sterling. Focus on the 20 to 30 most critical components.

## 6. Cost Data (for Finn — cost estimation)
Provide cost ranges for: total system capital cost, per-subsystem cost breakdown, installation cost, annual operating cost, and any relevant unit economics (cost per kilowatt-hour, cost per cubic metre, cost per kilogram, and so on). State the scale and year assumptions.

## 7. Manufacturers and Suppliers (for Supplier Search)
Name real companies that manufacture or supply key components. For each: company name, what they supply, headquarters location, and whether they serve the United Kingdom market. Minimum 10 companies.

## 8. Engineering Constraints and Pitfalls (for Fang — engineering review)
Describe real failure modes, material limitations, thermal constraints, and design pitfalls observed in deployed systems. Be specific — name the material, the failure mechanism, and the design rule that prevents it.

## 9. Terminology and Units (for Proofreader)
List domain-standard terminology, correct unit conventions, and any terms that are commonly confused or misused. This ensures downstream documentation uses consistent, industry-standard language.

## 10. Visual Description (for Illustration)
Describe what a real deployed system looks like physically — external appearance, colour, markings, how components are arranged visually, what an observer would see from the outside and inside.

## 11. Constraint Anchors (for all downstream stages)
Provide a structured table of the key constraint numbers that every downstream stage should check against:

| Parameter | Value | Source |
|---|---|---|
| (for example, total system mass) | (for example, 12,500 kilograms) | (for example, Manufacturer X datasheet) |

Minimum 10 rows covering: dimensions, mass, power, cost range, key regulatory instruments, critical materials, and performance targets.

## 12. Model Confidence and Gaps
State what you are confident about, what you are uncertain about, and what you could not answer. This helps downstream stages know where to apply extra scrutiny.`
}
