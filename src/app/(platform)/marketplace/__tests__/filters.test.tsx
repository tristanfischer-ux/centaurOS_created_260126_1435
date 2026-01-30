import '@testing-library/jest-dom'

describe('Marketplace Filtering', () => {
    const mockProviders = [
        { id: '1', company_name: 'Law Firm A', provider_type: 'Legal' },
        { id: '2', company_name: 'Bank B', provider_type: 'Financial' },
        { id: '3', company_name: 'Law Firm C', provider_type: 'Legal' },
    ]

    it('filters providers by type correctly', () => {
        const legal = mockProviders.filter(p => p.provider_type === 'Legal')
        expect(legal).toHaveLength(2)
        expect(legal[0].company_name).toBe('Law Firm A')
        expect(legal[1].company_name).toBe('Law Firm C')
    })

    it('returns empty array if no matches', () => {
        const manufacturing = mockProviders.filter(p => p.provider_type === 'Additive Manufacturing')
        expect(manufacturing).toHaveLength(0)
    })
})
