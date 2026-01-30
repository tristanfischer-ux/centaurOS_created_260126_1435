// @ts-nocheck
import { Metadata } from "next"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Receipt, FileText, Settings, AlertCircle } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TaxProfileForm } from "@/components/tax/TaxProfileForm"
import { InvoiceList } from "@/components/invoices/InvoiceList"
import { getInvoiceHistory } from "@/actions/invoices"
import { getTaxProfileAction, isTaxProfileComplete } from "@/actions/tax-profile"

export const metadata: Metadata = {
  title: "Tax Settings | Provider Portal",
  description: "Manage your VAT registration and tax settings",
}

export default async function TaxSettingsPage() {
  const supabase = await createClient()

  // Check authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

  // Check if user is a provider
  const { data: providerProfile } = await supabase
    .from("provider_profiles")
    .select("id, display_name, stripe_onboarding_complete")
    .eq("user_id", user.id)
    .single()

  if (!providerProfile) {
    redirect("/provider-portal/onboarding")
  }

  // Get tax profile
  const { data: taxProfile } = await getTaxProfileAction()

  // Check if tax profile is complete
  const profileStatus = await isTaxProfileComplete()

  // Get recent invoices
  const { data: recentInvoices } = await getInvoiceHistory({ limit: 5 })

  return (
    <div className="container max-w-4xl py-8">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tax Settings</h1>
          <p className="text-muted-foreground mt-2">
            Manage your VAT registration and invoice settings
          </p>
        </div>

        {/* Status Alert */}
        {!profileStatus.complete && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Action Required</AlertTitle>
            <AlertDescription>
              Your tax profile is incomplete. Please complete the following:
              <ul className="list-disc list-inside mt-2">
                {profileStatus.missing.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Tabs */}
        <Tabs defaultValue="settings" className="space-y-6">
          <TabsList>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Tax Settings
            </TabsTrigger>
            <TabsTrigger value="invoices" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Invoices
            </TabsTrigger>
          </TabsList>

          {/* Tax Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <TaxProfileForm initialProfile={taxProfile} />

            {/* Invoice Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  Invoice Settings
                </CardTitle>
                <CardDescription>
                  Configure how your invoices are generated
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <h4 className="font-medium mb-2">Self-Billing</h4>
                    <p className="text-sm text-muted-foreground">
                      Centaur OS generates invoices on your behalf when orders
                      complete. This is known as self-billing and requires your
                      VAT details to be correctly configured.
                    </p>
                  </div>

                  <div className="rounded-lg border p-4">
                    <h4 className="font-medium mb-2">Platform Fees</h4>
                    <p className="text-sm text-muted-foreground">
                      Platform commission is automatically deducted and a
                      separate invoice is generated for your records. VAT is
                      charged on platform fees at the standard UK rate.
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border p-4 bg-muted/50">
                  <h4 className="font-medium mb-2">Invoice Numbering</h4>
                  <p className="text-sm text-muted-foreground">
                    Invoices are automatically numbered using the format:{" "}
                    <code className="bg-muted px-1 rounded">INV-YYYY-NNNNN</code>
                  </p>
                  <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                    <li>
                      <strong>INV:</strong> Standard invoice
                    </li>
                    <li>
                      <strong>SB:</strong> Self-billing invoice
                    </li>
                    <li>
                      <strong>PF:</strong> Platform fee invoice
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Tax Information */}
            <Card>
              <CardHeader>
                <CardTitle>Tax Information</CardTitle>
                <CardDescription>
                  How VAT is calculated on your transactions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <h4 className="font-medium text-green-700 mb-2">
                      UK to UK
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Standard UK VAT rate of 20% applies to all domestic
                      transactions.
                    </p>
                  </div>

                  <div className="rounded-lg border p-4">
                    <h4 className="font-medium text-blue-700 mb-2">
                      UK to EU (B2B)
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Reverse charge applies when supplying to VAT-registered EU
                      businesses. Customer accounts for VAT.
                    </p>
                  </div>

                  <div className="rounded-lg border p-4">
                    <h4 className="font-medium text-purple-700 mb-2">
                      UK to EU (B2C)
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      UK VAT applies to consumer sales in the EU until the OSS
                      threshold is reached.
                    </p>
                  </div>

                  <div className="rounded-lg border p-4">
                    <h4 className="font-medium text-orange-700 mb-2">
                      Exports
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Zero-rated for VAT purposes when supplying services to
                      customers outside the UK/EU.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="space-y-6">
            {recentInvoices.length > 0 ? (
              <InvoiceList invoices={recentInvoices} />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Invoices</CardTitle>
                  <CardDescription>
                    Your generated invoices will appear here
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No invoices generated yet</p>
                    <p className="text-sm mt-1">
                      Invoices are automatically generated when orders complete
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
