import { stripe, StripeConnectAccount } from './client'

/**
 * Creates a Stripe Connect Standard account for a user
 * @param userId - The user's ID in our system
 * @param email - The user's email address
 * @returns The created Stripe account ID
 */
export async function createConnectAccount(
  userId: string,
  email: string
): Promise<{ accountId: string; error: null } | { accountId: null; error: string }> {
  try {
    const account = await stripe.accounts.create({
      type: 'standard',
      email,
      metadata: {
        user_id: userId,
      },
    })

    return { accountId: account.id, error: null }
  } catch (error) {
    console.error('Error creating Connect account:', error)
    return {
      accountId: null,
      error: error instanceof Error ? error.message : 'Failed to create Connect account',
    }
  }
}

/**
 * Creates an account link for onboarding a Connect account
 * @param accountId - The Stripe Connect account ID
 * @param refreshUrl - URL to redirect to if the link expires
 * @param returnUrl - URL to redirect to after completion
 * @returns The account link URL
 */
export async function createAccountLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string
): Promise<{ url: string; error: null } | { url: null; error: string }> {
  try {
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    })

    return { url: accountLink.url, error: null }
  } catch (error) {
    console.error('Error creating account link:', error)
    return {
      url: null,
      error: error instanceof Error ? error.message : 'Failed to create account link',
    }
  }
}

/**
 * Gets the status of a Connect account
 * @param accountId - The Stripe Connect account ID
 * @returns Account status information
 */
export async function getAccountStatus(
  accountId: string
): Promise<{ account: StripeConnectAccount; error: null } | { account: null; error: string }> {
  try {
    const account = await stripe.accounts.retrieve(accountId)

    const accountStatus: StripeConnectAccount = {
      id: account.id,
      email: account.email ?? null,
      charges_enabled: account.charges_enabled ?? false,
      payouts_enabled: account.payouts_enabled ?? false,
      details_submitted: account.details_submitted ?? false,
      requirements: account.requirements
        ? {
            currently_due: account.requirements.currently_due ?? [],
            eventually_due: account.requirements.eventually_due ?? [],
            past_due: account.requirements.past_due ?? [],
            pending_verification: account.requirements.pending_verification ?? [],
          }
        : undefined,
    }

    return { account: accountStatus, error: null }
  } catch (error) {
    console.error('Error getting account status:', error)
    return {
      account: null,
      error: error instanceof Error ? error.message : 'Failed to get account status',
    }
  }
}

/**
 * Gets the available balance for a Connect account
 * @param accountId - The Stripe Connect account ID
 * @returns Balance information by currency
 */
export async function getAccountBalance(
  accountId: string
): Promise<
  | { balance: { available: Record<string, number>; pending: Record<string, number> }; error: null }
  | { balance: null; error: string }
> {
  try {
    const balance = await stripe.balance.retrieve({
      stripeAccount: accountId,
    })

    // Convert balance to a more usable format
    const available: Record<string, number> = {}
    const pending: Record<string, number> = {}

    balance.available.forEach((b) => {
      available[b.currency] = b.amount
    })

    balance.pending.forEach((b) => {
      pending[b.currency] = b.amount
    })

    return {
      balance: { available, pending },
      error: null,
    }
  } catch (error) {
    console.error('Error getting account balance:', error)
    return {
      balance: null,
      error: error instanceof Error ? error.message : 'Failed to get account balance',
    }
  }
}

/**
 * Checks if a Connect account has completed onboarding
 * @param accountId - The Stripe Connect account ID
 * @returns Whether the account can receive payments
 */
export async function isAccountReady(
  accountId: string
): Promise<{ ready: boolean; error: null } | { ready: false; error: string }> {
  const result = await getAccountStatus(accountId)

  if (result.error || !result.account) {
    return { ready: false, error: result.error || 'Account not found' }
  }

  const { account } = result
  const ready = account.charges_enabled && account.payouts_enabled && account.details_submitted

  return { ready, error: null }
}
