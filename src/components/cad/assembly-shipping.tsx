/**
 * @file assembly-shipping.tsx — Fulfilment model, address form, and shipping provider.
 *
 * @description Top-level component for the Shipping & Fulfilment tab:
 *   Card 1 — Fulfilment Model (3-option radio)
 *   Card 2 — Shipping Address (standard address form)
 *   Card 3 — Shipping Provider Selection (only for 3PL)
 *
 * Delegates cost rollup and lead time to sibling components.
 */

"use client"

import { useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FULFILMENT_OPTIONS } from "@/lib/assembly-utils"
import type { ShippingConfig, ShippingAddress, AssemblyCompanyMatch } from "@/lib/assembly-utils"

// ─── Props ──────────────────────────────────────────────────────────

interface AssemblyShippingProps {
  shipping: ShippingConfig
  onUpdate: (updates: Partial<ShippingConfig>) => void
  assemblerMatches: AssemblyCompanyMatch[]
}

// ─── Component ──────────────────────────────────────────────────────

export function AssemblyShipping({
  shipping,
  onUpdate,
  assemblerMatches,
}: AssemblyShippingProps) {
  const handleAddressChange = useCallback((field: keyof ShippingAddress, value: string) => {
    const current = shipping.shippingAddress ?? {
      name: "", line1: "", line2: "", city: "", postcode: "", country: "GB",
    }
    onUpdate({ shippingAddress: { ...current, [field]: value } })
  }, [shipping.shippingAddress, onUpdate])

  // Filter assemblers that can kit_and_ship (for 3PL selection)
  const kitShipProviders = assemblerMatches.filter((m) =>
    m.capabilities.includes("kit_and_ship"),
  )

  const addressLabel = shipping.fulfilmentModel === "drop_ship"
    ? "Customer Delivery Address"
    : shipping.fulfilmentModel === "warehouse"
      ? "Warehouse / Facility Address"
      : "3PL Receiving Address"

  return (
    <div className="space-y-6">
      {/* ── Card 1: Fulfilment Model ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Fulfilment Model</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {FULFILMENT_OPTIONS.map((opt) => {
              const isSelected = shipping.fulfilmentModel === opt.id
              return (
                <button
                  key={opt.id}
                  onClick={() => onUpdate({ fulfilmentModel: opt.id })}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    isSelected
                      ? "border-international-orange bg-international-orange/5"
                      : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      isSelected ? "border-international-orange" : "border-muted-foreground"
                    }`}>
                      {isSelected && (
                        <div className="h-2 w-2 rounded-full bg-international-orange" />
                      )}
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${isSelected ? "text-international-orange" : "text-foreground"}`}>
                        {opt.label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Card 2: Shipping Address ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{addressLabel}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ship-name">Contact Name</Label>
            <Input
              id="ship-name"
              placeholder="Full name"
              value={shipping.shippingAddress?.name ?? ""}
              onChange={(e) => handleAddressChange("name", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ship-line1">Address Line 1</Label>
            <Input
              id="ship-line1"
              placeholder="Street address"
              value={shipping.shippingAddress?.line1 ?? ""}
              onChange={(e) => handleAddressChange("line1", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ship-line2">Address Line 2</Label>
            <Input
              id="ship-line2"
              placeholder="Apt, suite, building (optional)"
              value={shipping.shippingAddress?.line2 ?? ""}
              onChange={(e) => handleAddressChange("line2", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ship-city">City</Label>
              <Input
                id="ship-city"
                placeholder="City"
                value={shipping.shippingAddress?.city ?? ""}
                onChange={(e) => handleAddressChange("city", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ship-postcode">Postcode</Label>
              <Input
                id="ship-postcode"
                placeholder="Postcode / ZIP"
                value={shipping.shippingAddress?.postcode ?? ""}
                onChange={(e) => handleAddressChange("postcode", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ship-country">Country</Label>
            <Input
              id="ship-country"
              placeholder="Country"
              value={shipping.shippingAddress?.country ?? ""}
              onChange={(e) => handleAddressChange("country", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Card 3: 3PL Provider Selection (only for 3PL model) ── */}
      {shipping.fulfilmentModel === "direct_3pl" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">3PL Provider</CardTitle>
          </CardHeader>
          <CardContent>
            {kitShipProviders.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No kit-and-ship providers found. Match assemblers in the Assembly Flow tab to find providers.
              </p>
            ) : (
              <div className="space-y-2">
                {kitShipProviders.map((provider) => {
                  const isSelected = shipping.selectedShipperId === provider.id
                  return (
                    <button
                      key={provider.id}
                      onClick={() => onUpdate({ selectedShipperId: provider.id })}
                      className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                        isSelected
                          ? "border-international-orange bg-international-orange/5"
                          : "border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {provider.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {provider.isVerified && (
                              <span className="text-xs text-success">Verified</span>
                            )}
                            {provider.typicalLeadDays && (
                              <span className="text-xs text-muted-foreground">
                                {provider.typicalLeadDays}d lead time
                              </span>
                            )}
                            {provider.locationCountry && (
                              <span className="text-xs text-muted-foreground">
                                {provider.locationCountry}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            provider.matchScore >= 50
                              ? "bg-success/10 text-success"
                              : provider.matchScore >= 30
                                ? "bg-warning/10 text-warning"
                                : "bg-muted text-muted-foreground"
                          }`}>
                            {Math.round(provider.matchScore)}pts
                          </span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
