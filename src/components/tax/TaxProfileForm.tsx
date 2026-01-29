"use client"

/**
 * Tax Profile Form Component
 * Form for setting up and managing tax/VAT information
 */

import { useState, useEffect, useTransition } from "react"
import { Check, X, Loader2, Shield, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  TaxProfile,
  TaxProfileInput,
  COUNTRY_LABELS,
  EU_COUNTRIES,
} from "@/types/invoices"
import {
  getTaxProfileAction,
  updateTaxProfileAction,
  validateVATNumberAction,
  verifyVATNumberAction,
  removeVATNumber,
} from "@/actions/tax-profile"

interface TaxProfileFormProps {
  initialProfile?: TaxProfile | null
  onSuccess?: (profile: TaxProfile) => void
  onCancel?: () => void
}

// Country options with common countries first
const countryOptions = [
  { value: "GB", label: "United Kingdom" },
  { value: "---", label: "─────────────", disabled: true },
  ...EU_COUNTRIES.map((code) => ({
    value: code,
    label: COUNTRY_LABELS[code] || code,
  })),
  { value: "---2", label: "─────────────", disabled: true },
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "AU", label: "Australia" },
  { value: "CH", label: "Switzerland" },
  { value: "NO", label: "Norway" },
]

export function TaxProfileForm({
  initialProfile,
  onSuccess,
  onCancel,
}: TaxProfileFormProps) {
  const [isPending, startTransition] = useTransition()
  const [profile, setProfile] = useState<TaxProfile | null>(initialProfile || null)
  const [loading, setLoading] = useState(!initialProfile)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Form state
  const [countryCode, setCountryCode] = useState(profile?.countryCode || "GB")
  const [vatRegistered, setVatRegistered] = useState(!!profile?.vatNumber)
  const [vatNumber, setVatNumber] = useState(profile?.vatNumber || "")
  const [vatValidation, setVatValidation] = useState<{
    valid: boolean | null
    message: string | null
  }>({ valid: null, message: null })
  const [verifying, setVerifying] = useState(false)

  // Load profile if not provided
  useEffect(() => {
    if (!initialProfile) {
      loadProfile()
    }
  }, [initialProfile])

  async function loadProfile() {
    setLoading(true)
    try {
      const result = await getTaxProfileAction()
      if (result.data) {
        setProfile(result.data)
        setCountryCode(result.data.countryCode)
        setVatRegistered(!!result.data.vatNumber)
        setVatNumber(result.data.vatNumber || "")
      }
    } catch (err) {
      setError("Failed to load tax profile")
    } finally {
      setLoading(false)
    }
  }

  // Validate VAT number on change
  useEffect(() => {
    if (!vatNumber || !vatRegistered) {
      setVatValidation({ valid: null, message: null })
      return
    }

    const timer = setTimeout(async () => {
      const result = await validateVATNumberAction(vatNumber, countryCode)
      setVatValidation({
        valid: result.valid,
        message: result.valid
          ? `Format valid: ${result.formatted}`
          : result.errors?.join(", ") || "Invalid format",
      })
    }, 500)

    return () => clearTimeout(timer)
  }, [vatNumber, countryCode, vatRegistered])

  async function handleVerifyVAT() {
    if (!vatNumber || vatValidation.valid !== true) return

    setVerifying(true)
    try {
      const result = await verifyVATNumberAction(vatNumber)
      if (result.valid) {
        setVatValidation({
          valid: true,
          message: `Verified: ${result.name || "Business found"}`,
        })
        // Reload profile to get updated verification status
        await loadProfile()
      } else {
        setVatValidation({
          valid: false,
          message: "VAT number could not be verified",
        })
      }
    } catch (err) {
      setError("Failed to verify VAT number")
    } finally {
      setVerifying(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    const input: TaxProfileInput = {
      countryCode,
      vatNumber: vatRegistered ? vatNumber : null,
    }

    startTransition(async () => {
      const result = await updateTaxProfileAction(input)

      if (result.error) {
        setError(result.error)
      } else if (result.data) {
        setProfile(result.data)
        setSuccess(true)
        onSuccess?.(result.data)
      }
    })
  }

  async function handleRemoveVAT() {
    startTransition(async () => {
      const result = await removeVATNumber()
      if (result.success) {
        setVatRegistered(false)
        setVatNumber("")
        await loadProfile()
      } else {
        setError(result.error || "Failed to remove VAT number")
      }
    })
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tax Settings</CardTitle>
          <CardDescription>Loading your tax profile...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tax Settings</CardTitle>
        <CardDescription>
          Configure your VAT registration and tax information for invoicing
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert>
              <Check className="h-4 w-4" />
              <AlertTitle>Saved</AlertTitle>
              <AlertDescription>
                Your tax profile has been updated successfully.
              </AlertDescription>
            </Alert>
          )}

          {/* Country Selection */}
          <div className="space-y-2">
            <Label htmlFor="country">Country of Tax Residence</Label>
            <Select value={countryCode} onValueChange={setCountryCode}>
              <SelectTrigger id="country">
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                {countryOptions.map((option) =>
                  option.disabled ? (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      disabled
                      className="text-muted-foreground"
                    >
                      {option.label}
                    </SelectItem>
                  ) : (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              This determines how VAT is calculated on your invoices
            </p>
          </div>

          {/* VAT Registration Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="vat-registered" className="text-base">
                VAT Registered
              </Label>
              <p className="text-sm text-muted-foreground">
                Enable if your business is registered for VAT
              </p>
            </div>
            <Switch
              id="vat-registered"
              checked={vatRegistered}
              onCheckedChange={(checked) => {
                setVatRegistered(checked)
                if (!checked) {
                  setVatNumber("")
                  setVatValidation({ valid: null, message: null })
                }
              }}
            />
          </div>

          {/* VAT Number Input */}
          {vatRegistered && (
            <div className="space-y-2">
              <Label htmlFor="vat-number">VAT Number</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="vat-number"
                    placeholder={countryCode === "GB" ? "GB123456789" : "Enter VAT number"}
                    value={vatNumber}
                    onChange={(e) => setVatNumber(e.target.value.toUpperCase())}
                    className={
                      vatValidation.valid === true
                        ? "border-green-500 pr-10"
                        : vatValidation.valid === false
                        ? "border-red-500 pr-10"
                        : ""
                    }
                  />
                  {vatValidation.valid !== null && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {vatValidation.valid ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <X className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleVerifyVAT}
                  disabled={!vatNumber || vatValidation.valid !== true || verifying}
                >
                  {verifying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Shield className="h-4 w-4 mr-2" />
                      Verify
                    </>
                  )}
                </Button>
              </div>
              {vatValidation.message && (
                <p
                  className={`text-sm ${
                    vatValidation.valid ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {vatValidation.message}
                </p>
              )}

              {/* Verification Status */}
              {profile?.vatNumber && (
                <div className="flex items-center gap-2 mt-2">
                  {profile.vatVerified ? (
                    <Badge variant="default" className="bg-green-600">
                      <Check className="h-3 w-3 mr-1" />
                      Verified
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      Pending Verification
                    </Badge>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveVAT}
                    className="text-destructive hover:text-destructive"
                  >
                    Remove VAT Number
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Tax Treatment Info */}
          <div className="rounded-lg border p-4 bg-muted/50">
            <h4 className="font-medium mb-2">Tax Treatment</h4>
            <div className="text-sm text-muted-foreground space-y-1">
              {countryCode === "GB" && (
                <p>
                  <strong>UK to UK:</strong> Standard 20% VAT applies
                </p>
              )}
              {EU_COUNTRIES.includes(countryCode as typeof EU_COUNTRIES[number]) && (
                <p>
                  <strong>EU VAT:</strong> Reverse charge may apply for B2B
                  transactions with UK businesses
                </p>
              )}
              {!EU_COUNTRIES.includes(countryCode as typeof EU_COUNTRIES[number]) &&
                countryCode !== "GB" && (
                  <p>
                    <strong>Export:</strong> Zero-rated for VAT purposes
                  </p>
                )}
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex justify-between">
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isPending} className={onCancel ? "" : "ml-auto"}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Tax Settings"
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

export default TaxProfileForm
