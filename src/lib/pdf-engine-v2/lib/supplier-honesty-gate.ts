export interface SupplierGateResult {
  partName: string
  regime: string
  includeInShortlist: boolean
  reason: string
}

export function gateSupplierMatch(
  part: { name: string; regime?: string },
  supplier: { name: string; score: number; processes?: string[]; materials?: string[] }
): SupplierGateResult {
  const regime = part.regime || 'unknown'

  if (regime === 'buy_electronic') {
    const processes = supplier.processes || []
    const hasElectronics = processes.some(p => 
      /smt|pcb|electronic/i.test(p)
    )

    if (hasElectronics) {
      return {
        partName: part.name,
        regime,
        includeInShortlist: true,
        reason: 'Supplier has electronics processes',
      }
    }

    return {
      partName: part.name,
      regime,
      includeInShortlist: false,
      reason: 'Electronic parts should use distributor path, not fabricator',
    }
  }

  if (regime === 'make_custom_fab') {
    if (supplier.score >= 50) {
      return {
        partName: part.name,
        regime,
        includeInShortlist: true,
        reason: 'Match score meets threshold',
      }
    }
    
    return {
      partName: part.name,
      regime,
      includeInShortlist: false,
      reason: 'Match score too low',
    }
  }

  if (regime === 'service_certification') {
    return {
      partName: part.name,
      regime,
      includeInShortlist: true,
      reason: 'Certification bodies are generic',
    }
  }

  if (supplier.score >= 30) {
    return {
      partName: part.name,
      regime,
      includeInShortlist: true,
      reason: 'Match score meets default threshold',
    }
  }

  return {
    partName: part.name,
    regime,
    includeInShortlist: false,
    reason: 'Match score too low',
  }
}
