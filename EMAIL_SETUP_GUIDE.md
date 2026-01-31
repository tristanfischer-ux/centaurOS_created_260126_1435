# Email Setup Guide for CentaurOS

**Domain:** centaurdynamics.io  
**Date:** January 30, 2026

To send and receive emails from `@centaurdynamics.io` (e.g., `tristan@centaurdynamics.io`), you need an **Email Hosting Provider**. This is separate from your website hosting (Vercel) and domain registration (Namecheap).

## Option 1: Google Workspace (Recommended for Startups)

Standard for business. Includes Gmail, Docs, Drive, Calendar, and Meet.

**Cost:** ~$6/user/month (Starter plan)

### Steps:
1.  **Sign Up:**
    *   Go to [Google Workspace Sign Up](https://workspace.google.com/).
    *   Enter your business name ("Centaur Dynamics").
    *   Enter your contact info.
    *   When asked "Does your business have a domain?", select **"Yes, I have one that I can use"**.
    *   Enter `centaurdynamics.io`.

2.  **Create Your Account:**
    *   Create your primary email (e.g., `tristan@centaurdynamics.io`).
    *   Set a secure password.

3.  **Verify Domain Ownership:**
    *   Google will give you a **TXT record** (e.g., `google-site-verification=...`).
    *   **If your DNS is managed on Namecheap:**
        *   Log in to Namecheap -> Domain List -> Manage -> Advanced DNS.
        *   Add a new `TXT Record`.
        *   Host: `@`
        *   Value: [Paste the code from Google]
        *   Save.
    *   **If your DNS is managed on Vercel:**
        *   Log in to Vercel -> Select Project -> Settings -> Domains.
        *   Click "Edit" or "View DNS Records" for `centaurdynamics.io`.
        *   Add a TXT record.
        *   Name: `@`
        *   Value: [Paste the code from Google]

4.  **Set up MX Records (Mail Exchange):**
    *   These records tell the internet to send emails to Google's servers.
    *   Google will provide 5 MX records (or sometimes just 1 `SMTP.GOOGLE.COM`).
    *   Add these to your DNS settings (Namecheap or Vercel) just like the TXT record.
    *   **Delete any existing MX records** (e.g., from Namecheap's default parking).

5.  **Wait for Propagation:**
    *   It can take 1-24 hours, but usually happens in minutes.

---

## Option 2: Namecheap Private Email (Cheaper Option)

Good if you just want email and don't need Google Docs/Drive integration.

**Cost:** ~$1.25/month (often has sales)

### Steps:
1.  **Purchase:**
    *   Log in to Namecheap.
    *   Go to **Email** -> **Professional Email**.
    *   Select a plan and purchase for `centaurdynamics.io`.

2.  **Create Mailbox:**
    *   In Namecheap Dashboard, go to the Private Email subscription.
    *   Click "Create Mailbox".
    *   Enter `tristan` (for `tristan@centaurdynamics.io`) and a password.

3.  **Configure DNS:**
    *   Since you bought the domain on Namecheap, there's usually a button to "Auto-configure DNS" in the email setup page.
    *   If not, follow their guide to add the required `MX` and `TXT` (SPF) records.

---

## Option 3: Zoho Mail (Free Tier Available)

Good for bootstrapping with $0 cost (Forever Free plan for up to 5 users, web access only).

**Cost:** Free (or ~$1/user/month for paid features)

### Steps:
1.  Go to [Zoho Mail](https://www.zoho.com/mail/).
2.  Sign up for the "Forever Free" plan (scroll down to find it).
3.  Enter `centaurdynamics.io`.
4.  Follow the verification steps (add TXT record to DNS).
5.  Update MX records in your DNS to point to Zoho.

---

## 📧 Transactional Emails (For the App)

**Important Distinction:**
*   **Business Email:** For humans (`tristan@...`) to talk to humans. Use options above.
*   **Transactional Email:** For the app (`noreply@...`) to send password resets, welcome emails, etc.

For the app (CentaurOS), we should use a developer-focused service like **Resend** (recommended for Next.js) or **SendGrid**.

**Recommended Setup for App:**
1.  Sign up for [Resend.com](https://resend.com).
2.  Add domain `centaurdynamics.io`.
3.  Add the DNS records they provide to your DNS manager (Vercel/Namecheap).
4.  Get an API Key.
5.  Add `RESEND_API_KEY` to your `.env` file.

This keeps your personal inbox separate from automated app emails, which is better for deliverability.
