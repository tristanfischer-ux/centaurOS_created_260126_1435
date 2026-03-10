/**
 * @file postcode-utils.ts
 * @description Shared UK postcode and region utilities used by marketplace and
 * recruits stats server actions.
 */

// ─── Region Mapping ─────────────────────────────────────────────────────────

// INTENT: Map UK postal code prefixes to broad regions for regional charts.
// We use the first 1-2 characters of the postal code to determine region.
export const POSTCODE_REGION_MAP: Record<string, string> = {
  // London
  E: "London", EC: "London", N: "London", NW: "London",
  SE: "London", SW: "London", W: "London", WC: "London",
  // South East
  BN: "South East", CT: "South East", GU: "South East", HP: "South East",
  ME: "South East", MK: "South East", OX: "South East", PO: "South East",
  RG: "South East", RH: "South East", SL: "South East", SO: "South East",
  TN: "South East", AL: "South East",
  DA: "South East", EN: "South East", HA: "South East", IG: "South East",
  KT: "South East", LU: "South East", RM: "South East", SG: "South East",
  SM: "South East", TW: "South East", UB: "South East",
  WD: "South East", BR: "South East", CR: "South East",
  // East of England
  NR: "East of England", IP: "East of England", CO: "East of England",
  CM: "East of England", CB: "East of England", PE: "East of England",
  SS: "East of England",
  // South West
  BA: "South West", BH: "South West", BS: "South West", DT: "South West",
  EX: "South West", GL: "South West", PL: "South West", SN: "South West",
  SP: "South West", TA: "South West", TQ: "South West", TR: "South West",
  // Midlands
  B: "Midlands", CV: "Midlands", DE: "Midlands", DY: "Midlands",
  LE: "Midlands", NG: "Midlands", NN: "Midlands",
  ST: "Midlands", TF: "Midlands", WR: "Midlands", WS: "Midlands",
  WV: "Midlands", HR: "Midlands", SY: "Midlands",
  // North West
  BB: "North West", BL: "North West", CA: "North West", CH: "North West",
  CW: "North West", FY: "North West", L: "North West", LA: "North West",
  M: "North West", OL: "North West", PR: "North West", SK: "North West",
  WA: "North West", WN: "North West",
  // North East
  DH: "North East", DL: "North East", NE: "North East", SR: "North East",
  TS: "North East",
  // Yorkshire
  BD: "Yorkshire", DN: "Yorkshire", HD: "Yorkshire", HG: "Yorkshire",
  HU: "Yorkshire", HX: "Yorkshire", LS: "Yorkshire", S: "Yorkshire",
  WF: "Yorkshire", YO: "Yorkshire", LN: "Yorkshire",
  // Scotland
  AB: "Scotland", DD: "Scotland", DG: "Scotland", EH: "Scotland",
  FK: "Scotland", G: "Scotland", HS: "Scotland", IV: "Scotland",
  KA: "Scotland", KW: "Scotland", KY: "Scotland", ML: "Scotland",
  PA: "Scotland", PH: "Scotland", TD: "Scotland", ZE: "Scotland",
  // Wales
  CF: "Wales", LD: "Wales", LL: "Wales", NP: "Wales", SA: "Wales",
  // Northern Ireland
  BT: "Northern Ireland",
}

/**
 * Derive a UK region from a postal code string.
 * Tries 2-char prefix first, then 1-char.
 */
export function deriveRegionFromPostcode(postcode: string): string | null {
  const clean = postcode.toUpperCase().replace(/\s+/g, "")
  if (clean.length < 2) return null

  // Try 2-char prefix first (e.g., "NW", "SE", "EC")
  const prefix2 = clean.slice(0, 2)
  if (POSTCODE_REGION_MAP[prefix2]) return POSTCODE_REGION_MAP[prefix2]

  // Fall back to 1-char prefix (e.g., "B", "M", "L")
  const prefix1 = clean[0]
  if (POSTCODE_REGION_MAP[prefix1]) return POSTCODE_REGION_MAP[prefix1]

  return null
}

/**
 * Extract a postal code from an address string.
 * UK postcodes follow the pattern: A9 9AA, A99 9AA, A9A 9AA, AA9 9AA, AA99 9AA, AA9A 9AA
 */
export function extractPostcode(address: string): string | null {
  const match = address.match(
    /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i
  )
  return match ? match[1] : null
}

// ─── City/Keyword → Region Fallback ─────────────────────────────────────────

/**
 * INTENT: Most non-CH listings only have free-text location like "Birmingham, UK"
 * without postcodes. This keyword map provides a fallback for the regional chart.
 */
export const CITY_REGION_MAP: Record<string, string> = {
  // London
  london: "London",
  // South East
  brighton: "South East", oxford: "South East", reading: "South East",
  southampton: "South East", portsmouth: "South East", guildford: "South East",
  canterbury: "South East", crawley: "South East", slough: "South East",
  "milton keynes": "South East", basingstoke: "South East", maidstone: "South East",
  watford: "South East", luton: "South East",
  "st albans": "South East", "high wycombe": "South East",
  // East of England
  norwich: "East of England", cambridge: "East of England",
  ipswich: "East of England", colchester: "East of England",
  chelmsford: "East of England", peterborough: "East of England",
  // South West
  bristol: "South West", bath: "South West", exeter: "South West",
  plymouth: "South West", gloucester: "South West", swindon: "South West",
  cheltenham: "South West", bournemouth: "South West", poole: "South West",
  taunton: "South West", torquay: "South West", truro: "South West",
  // Midlands
  birmingham: "Midlands", coventry: "Midlands", leicester: "Midlands",
  nottingham: "Midlands", derby: "Midlands", wolverhampton: "Midlands",
  stoke: "Midlands", "stoke-on-trent": "Midlands", telford: "Midlands",
  worcester: "Midlands", northampton: "Midlands",
  shrewsbury: "Midlands", hereford: "Midlands",
  "west midlands": "Midlands", "east midlands": "Midlands",
  // North West
  manchester: "North West", liverpool: "North West", chester: "North West",
  preston: "North West", blackpool: "North West", bolton: "North West",
  warrington: "North West", wigan: "North West", stockport: "North West",
  oldham: "North West", rochdale: "North West", salford: "North West",
  carlisle: "North West", lancaster: "North West", crewe: "North West",
  // North East
  newcastle: "North East", sunderland: "North East", durham: "North East",
  middlesbrough: "North East", darlington: "North East", gateshead: "North East",
  "newcastle upon tyne": "North East",
  // Yorkshire
  leeds: "Yorkshire", sheffield: "Yorkshire", bradford: "Yorkshire",
  hull: "Yorkshire", york: "Yorkshire", doncaster: "Yorkshire",
  huddersfield: "Yorkshire", halifax: "Yorkshire", wakefield: "Yorkshire",
  harrogate: "Yorkshire", barnsley: "Yorkshire", rotherham: "Yorkshire",
  lincoln: "Yorkshire", scunthorpe: "Yorkshire",
  // Scotland
  edinburgh: "Scotland", glasgow: "Scotland", aberdeen: "Scotland",
  dundee: "Scotland", inverness: "Scotland", stirling: "Scotland",
  perth: "Scotland", paisley: "Scotland", kilmarnock: "Scotland",
  dumfries: "Scotland",
  // Wales
  cardiff: "Wales", swansea: "Wales", newport: "Wales",
  wrexham: "Wales", bangor: "Wales", llanelli: "Wales",
  aberystwyth: "Wales",
  // Northern Ireland
  belfast: "Northern Ireland", derry: "Northern Ireland",
  lisburn: "Northern Ireland", newry: "Northern Ireland",
  armagh: "Northern Ireland",
}

/**
 * Pre-compiled city→region matchers.
 * Sorted longest-first so "stoke-on-trent" matches before "stoke",
 * "newcastle upon tyne" before "newcastle", etc.
 * Pre-compiled at module load to avoid creating ~80 RegExp objects per call.
 */
const CITY_MATCHERS: Array<{ pattern: RegExp; region: string }> =
  Object.entries(CITY_REGION_MAP)
    .sort((a, b) => b[0].length - a[0].length)
    .map(([city, region]) => ({
      pattern: new RegExp(`\\b${city.replace(/[-]/g, '[-\\s]')}\\b`),
      region,
    }))

/**
 * Try to derive a UK region from a free-text location string using city keywords.
 * Uses word-boundary matching to avoid false positives (e.g., "Bathgate" ≠ "Bath").
 */
export function deriveRegionFromKeywords(location: string): string | null {
  const lower = location.toLowerCase()
  for (const { pattern, region } of CITY_MATCHERS) {
    if (pattern.test(lower)) return region
  }
  return null
}
