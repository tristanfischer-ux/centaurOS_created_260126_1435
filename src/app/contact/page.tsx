/**
 * @file Contact Page
 *
 * @description Public-facing contact page for Fractional Forge / ForgeOS.
 * Includes contact cards (email, demo booking, enterprise), a support
 * section, and a simple contact form that generates a mailto link.
 * Server component — exports metadata for SEO.
 */

import type { Metadata } from "next"
import { Mail, Calendar, Building2, Headset } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ContactForm } from "./contact-form"
import { MarketingNav } from "@/components/marketing/marketing-nav"
import { MarketingFooter } from "@/components/marketing/marketing-footer"

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with the Fractional Forge team. General enquiries, demo requests, and enterprise sales — we'd love to hear from you.",
}

export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <MarketingNav />

      <main className="flex-1 px-4 sm:px-6 pb-16 sm:pb-24">
        <div className="max-w-5xl mx-auto space-y-16 sm:space-y-24">
          {/* Hero */}
          <section className="pt-8 sm:pt-12 space-y-4">
            <Badge variant="brand" size="lg">
              Contact
            </Badge>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
              Get in Touch
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl">
              Whether you have a question, want a demo, or are exploring
              enterprise options — we&apos;d love to hear from you.
            </p>
          </section>

          {/* Contact Cards */}
          <section className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              {/* General Enquiries */}
              <Card className="hover:-translate-y-0.5 active:scale-[0.99] duration-200">
                <CardHeader>
                  <div className="h-10 w-10 rounded-lg bg-international-orange/10 flex items-center justify-center mb-2">
                    <Mail className="w-5 h-5 text-international-orange" />
                  </div>
                  <CardTitle className="text-lg">General Enquiries</CardTitle>
                  <CardDescription>
                    Questions about ForgeOS or Fractional Forge
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <a
                    href="mailto:hello@fractionalforge.app"
                    className="text-sm font-medium text-international-orange hover:underline transition-colors"
                  >
                    hello@fractionalforge.app
                  </a>
                </CardContent>
              </Card>

              {/* Book a Demo */}
              <Card className="hover:-translate-y-0.5 active:scale-[0.99] duration-200">
                <CardHeader>
                  <div className="h-10 w-10 rounded-lg bg-international-orange/10 flex items-center justify-center mb-2">
                    <Calendar className="w-5 h-5 text-international-orange" />
                  </div>
                  <CardTitle className="text-lg">Book a Demo</CardTitle>
                  <CardDescription>
                    See ForgeOS in action — pick a time that works for you
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <a
                    href="https://calendly.com/fractionalforge"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-international-orange hover:underline transition-colors"
                  >
                    Schedule on Calendly
                  </a>
                </CardContent>
              </Card>

              {/* Enterprise Sales */}
              <Card className="hover:-translate-y-0.5 active:scale-[0.99] duration-200">
                <CardHeader>
                  <div className="h-10 w-10 rounded-lg bg-international-orange/10 flex items-center justify-center mb-2">
                    <Building2 className="w-5 h-5 text-international-orange" />
                  </div>
                  <CardTitle className="text-lg">Enterprise Sales</CardTitle>
                  <CardDescription>
                    Custom plans, dedicated support, and volume pricing
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <a
                    href="mailto:sales@fractionalforge.app"
                    className="text-sm font-medium text-international-orange hover:underline transition-colors"
                  >
                    sales@fractionalforge.app
                  </a>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Support */}
          <section>
            <Card className="bg-muted/30">
              <CardContent className="flex items-start gap-4 pt-6">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <Headset className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-foreground">
                    Already a member?
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Use the in-app help or email{" "}
                    <a
                      href="mailto:support@fractionalforge.app"
                      className="text-international-orange hover:underline"
                    >
                      support@fractionalforge.app
                    </a>
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Contact Form */}
          <section className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">
                Send us a message
              </h2>
              <p className="text-muted-foreground">
                Fill in the form below and we&apos;ll get back to you as soon as
                possible.
              </p>
            </div>
            <Card>
              <CardContent className="pt-6">
                <ContactForm />
              </CardContent>
            </Card>
          </section>
        </div>
      </main>

      <MarketingFooter />
    </div>
  )
}
