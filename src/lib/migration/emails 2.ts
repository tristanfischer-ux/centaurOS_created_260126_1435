// Email templates for migration invitations and notifications
import { MigrationInvite, MigrationEmailData } from "@/types/migration"

const APP_NAME = "CentaurOS Marketplace"
const SUPPORT_EMAIL = "support@centauros.com"

/**
 * Generate the initial migration invitation email
 */
export function getMigrationInviteEmail(invite: MigrationInvite): MigrationEmailData {
  const subject = `${APP_NAME}: Upgrade Your Listing to Accept Payments`
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">${APP_NAME}</h1>
  </div>
  
  <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
    <h2 style="color: #333; margin-top: 0;">Start Accepting Bookings on Your Listing</h2>
    
    <p>Hi there,</p>
    
    <p>Your listing <strong>"${invite.listingTitle}"</strong> in the ${invite.subcategory} category is eligible for our new transactional marketplace features.</p>
    
    <h3 style="color: #667eea;">What's New?</h3>
    
    <ul style="padding-left: 20px;">
      <li><strong>Accept bookings directly</strong> - No more back-and-forth emails</li>
      <li><strong>Secure payments</strong> - Get paid through our escrow system</li>
      <li><strong>Increased visibility</strong> - Transactional listings rank higher in search</li>
      <li><strong>Reviews & ratings</strong> - Build trust with verified reviews</li>
      <li><strong>Calendar management</strong> - Set your availability easily</li>
    </ul>
    
    <p>The upgrade takes just a few minutes and connects your Stripe account for secure payments.</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${invite.signupUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 30px; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Upgrade My Listing
      </a>
    </div>
    
    ${invite.deadline ? `
    <p style="background: #fff3cd; padding: 12px; border-radius: 4px; border-left: 4px solid #ffc107;">
      <strong>Note:</strong> Please complete your upgrade by ${invite.deadline} to maintain your listing visibility.
    </p>
    ` : ''}
    
    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
    
    <p style="font-size: 14px; color: #666;">
      If you don't want to upgrade at this time, your listing will continue to appear with contact information only. You can always upgrade later.
    </p>
    
    <p style="font-size: 14px; color: #666;">
      Questions? Reply to this email or contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color: #667eea;">${SUPPORT_EMAIL}</a>
    </p>
  </div>
  
  <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
    <p>&copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
    <p>You're receiving this email because you have a listing on ${APP_NAME}.</p>
  </div>
</body>
</html>
`.trim()

  const text = `
${APP_NAME}: Upgrade Your Listing to Accept Payments

Hi there,

Your listing "${invite.listingTitle}" in the ${invite.subcategory} category is eligible for our new transactional marketplace features.

What's New?
- Accept bookings directly - No more back-and-forth emails
- Secure payments - Get paid through our escrow system
- Increased visibility - Transactional listings rank higher in search
- Reviews & ratings - Build trust with verified reviews
- Calendar management - Set your availability easily

The upgrade takes just a few minutes and connects your Stripe account for secure payments.

Upgrade now: ${invite.signupUrl}

${invite.deadline ? `Note: Please complete your upgrade by ${invite.deadline} to maintain your listing visibility.\n` : ''}
---

If you don't want to upgrade at this time, your listing will continue to appear with contact information only. You can always upgrade later.

Questions? Contact us at ${SUPPORT_EMAIL}

© ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
`.trim()

  return {
    to: invite.contactEmail,
    subject,
    html,
    text
  }
}

/**
 * Generate a follow-up reminder email for pending migrations
 */
export function getMigrationReminderEmail(invite: MigrationInvite): MigrationEmailData {
  const subject = `Reminder: Complete Your ${APP_NAME} Listing Upgrade`
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">${APP_NAME}</h1>
  </div>
  
  <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
    <h2 style="color: #333; margin-top: 0;">Don't Miss Out on New Bookings</h2>
    
    <p>Hi there,</p>
    
    <p>We noticed you haven't completed the upgrade for your listing <strong>"${invite.listingTitle}"</strong>.</p>
    
    <p>Providers who have upgraded are already seeing:</p>
    
    <ul style="padding-left: 20px;">
      <li>3x more profile views</li>
      <li>Direct booking requests from qualified buyers</li>
      <li>Secure, guaranteed payments</li>
    </ul>
    
    <p>It only takes a few minutes to complete your upgrade.</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${invite.signupUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 30px; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Complete My Upgrade
      </a>
    </div>
    
    ${invite.deadline ? `
    <p style="background: #f8d7da; padding: 12px; border-radius: 4px; border-left: 4px solid #dc3545;">
      <strong>Important:</strong> Your upgrade deadline is ${invite.deadline}. After this date, non-upgraded listings may have reduced visibility.
    </p>
    ` : ''}
    
    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
    
    <p style="font-size: 14px; color: #666;">
      Need help? Reply to this email or contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color: #667eea;">${SUPPORT_EMAIL}</a>
    </p>
  </div>
  
  <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
    <p>&copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
    <p>
      <a href="${invite.signupUrl.replace('provider-signup', 'unsubscribe')}" style="color: #999;">Unsubscribe from migration reminders</a>
    </p>
  </div>
</body>
</html>
`.trim()

  const text = `
${APP_NAME}: Reminder - Complete Your Listing Upgrade

Hi there,

We noticed you haven't completed the upgrade for your listing "${invite.listingTitle}".

Providers who have upgraded are already seeing:
- 3x more profile views
- Direct booking requests from qualified buyers
- Secure, guaranteed payments

It only takes a few minutes to complete your upgrade.

Complete your upgrade: ${invite.signupUrl}

${invite.deadline ? `Important: Your upgrade deadline is ${invite.deadline}. After this date, non-upgraded listings may have reduced visibility.\n` : ''}
---

Need help? Contact us at ${SUPPORT_EMAIL}

© ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
`.trim()

  return {
    to: invite.contactEmail,
    subject,
    html,
    text
  }
}

/**
 * Generate a confirmation email after migration is complete
 */
export function getMigrationCompleteEmail(invite: MigrationInvite): MigrationEmailData {
  const subject = `Welcome! Your ${APP_NAME} Listing is Now Live`
  
  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/provider-portal`
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">${APP_NAME}</h1>
  </div>
  
  <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="display: inline-block; background: #d1fae5; padding: 10px; border-radius: 50%;">
        <span style="font-size: 32px;">✓</span>
      </div>
    </div>
    
    <h2 style="color: #333; margin-top: 0; text-align: center;">You're All Set!</h2>
    
    <p>Congratulations! Your listing <strong>"${invite.listingTitle}"</strong> is now fully upgraded and ready to accept bookings.</p>
    
    <h3 style="color: #10b981;">What's Next?</h3>
    
    <ul style="padding-left: 20px;">
      <li><strong>Set your availability</strong> - Let buyers know when you're available</li>
      <li><strong>Complete your profile</strong> - Add portfolio items and credentials</li>
      <li><strong>Respond to inquiries</strong> - Quick responses lead to more bookings</li>
    </ul>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; padding: 14px 30px; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Go to Provider Dashboard
      </a>
    </div>
    
    <div style="background: #f0fdf4; padding: 16px; border-radius: 6px; margin: 20px 0;">
      <h4 style="margin: 0 0 8px 0; color: #166534;">Pro Tips for Success</h4>
      <ul style="margin: 0; padding-left: 20px; font-size: 14px;">
        <li>Respond to booking requests within 24 hours</li>
        <li>Keep your calendar up to date</li>
        <li>Ask satisfied clients for reviews</li>
      </ul>
    </div>
    
    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
    
    <p style="font-size: 14px; color: #666;">
      Questions about your new features? Check out our <a href="${process.env.NEXT_PUBLIC_APP_URL}/help/providers" style="color: #10b981;">Provider Guide</a> or contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color: #10b981;">${SUPPORT_EMAIL}</a>
    </p>
  </div>
  
  <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
    <p>&copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
  </div>
</body>
</html>
`.trim()

  const text = `
${APP_NAME}: Welcome! Your Listing is Now Live

Congratulations! Your listing "${invite.listingTitle}" is now fully upgraded and ready to accept bookings.

What's Next?
- Set your availability - Let buyers know when you're available
- Complete your profile - Add portfolio items and credentials
- Respond to inquiries - Quick responses lead to more bookings

Go to your dashboard: ${dashboardUrl}

Pro Tips for Success:
- Respond to booking requests within 24 hours
- Keep your calendar up to date
- Ask satisfied clients for reviews

---

Questions about your new features? Check out our Provider Guide or contact us at ${SUPPORT_EMAIL}

© ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
`.trim()

  return {
    to: invite.contactEmail,
    subject,
    html,
    text
  }
}
