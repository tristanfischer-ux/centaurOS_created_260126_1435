"use server"

/**
 * @file Contact Form Server Action
 *
 * @description Sends contact form submissions via Resend email API.
 * Emails are sent from the ForgeOS contact address to the team inbox,
 * with the submitter's email set as reply-to.
 */

import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

/**
 * Submit a contact form and send the message via email.
 *
 * @param data - The contact form fields
 * @returns An object with either `success: true` or `error: string`
 */
export async function submitContactForm(data: {
  name: string
  email: string
  subject: string
  message: string
}) {
  // VALIDATION: Ensure required fields are present
  if (!data.name || !data.email || !data.message) {
    return { error: 'Please fill in all required fields.' }
  }

  try {
    await resend.emails.send({
      from: 'ForgeOS Contact <tristan@fractionalforge.app>',
      to: 'hello@fractionalforge.app',
      replyTo: data.email,
      subject: `[Contact] ${data.subject} from ${data.name}`,
      text: `Name: ${data.name}\nEmail: ${data.email}\nSubject: ${data.subject}\n\nMessage:\n${data.message}`,
    })
    return { success: true }
  } catch (err) {
    console.error('[Contact] Email send failed:', err)
    return { error: 'Failed to send message. Please try emailing hello@fractionalforge.app directly.' }
  }
}
