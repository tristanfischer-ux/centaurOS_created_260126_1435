"use client"

/**
 * @file Contact Form (Client Component)
 *
 * @description Contact form that submits via server action and sends
 * an email through Resend. Shows toast notifications for success/failure.
 */

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Send, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { submitContactForm } from "@/actions/contact"

const SUBJECTS = [
  "General",
  "Demo Request",
  "Enterprise",
  "Partnership",
  "Press",
] as const

type Subject = (typeof SUBJECTS)[number]

export function ContactForm() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [subject, setSubject] = useState<Subject>("General")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSending(true)

    try {
      const result = await submitContactForm({ name, email, subject, message })

      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Message sent! We'll get back to you soon.")
        setName("")
        setEmail("")
        setSubject("General")
        setMessage("")
      }
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="contact-name">Name</Label>
          <Input
            id="contact-name"
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            aria-required="true"
          />
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="contact-email">Email</Label>
          <Input
            id="contact-email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-required="true"
          />
        </div>
      </div>

      {/* Subject */}
      <div className="space-y-2">
        <Label htmlFor="contact-subject">Subject</Label>
        <select
          id="contact-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value as Subject)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-required="true"
        >
          {SUBJECTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Message */}
      <div className="space-y-2">
        <Label htmlFor="contact-message">Message</Label>
        <textarea
          id="contact-message"
          rows={5}
          placeholder="How can we help?"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          aria-required="true"
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>

      {/* Submit */}
      <Button type="submit" className="w-full sm:w-auto" disabled={sending}>
        {sending ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Send className="w-4 h-4 mr-2" />
        )}
        {sending ? "Sending..." : "Send message"}
      </Button>
    </form>
  )
}
