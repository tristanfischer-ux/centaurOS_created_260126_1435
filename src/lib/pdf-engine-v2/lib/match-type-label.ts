export type MatchType = 'Distributor SKU' | 'Custom fabricator' | 'Authorised reseller' | 'Certification body' | 'Speculative match'

export function classifyMatchType(
  regime: string,
  source: string,
  confidence: string
): MatchType {
  if (regime === 'buy_electronic' && source === 'distributor') {
    return 'Distributor SKU'
  }
  if (regime === 'make_custom_fab' && confidence === 'HIGH') {
    return 'Custom fabricator'
  }
  if (regime === 'named_manufacturer_reseller') {
    return 'Authorised reseller'
  }
  if (regime === 'service_certification') {
    return 'Certification body'
  }
  return 'Speculative match'
}
