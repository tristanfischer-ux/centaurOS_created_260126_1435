/**
 * Stripe Test Card Numbers
 * 
 * Use these card numbers in test mode to simulate various payment scenarios.
 * All test cards use any future expiration date and any CVC.
 * 
 * @see https://docs.stripe.com/testing#cards
 */

export const STRIPE_TEST_CARDS = {
  /** 
   * Payment succeeds and funds are immediately available 
   */
  success: '4242424242424242',
  
  /** 
   * Card is declined with a generic decline code 
   */
  decline: '4000000000000002',
  
  /** 
   * Card is declined due to insufficient funds 
   */
  insufficient_funds: '4000000000009995',
  
  /** 
   * Requires 3D Secure authentication 
   */
  requires_authentication: '4000002500003155',
  
  /** 
   * Succeeds but results in an early warning dispute 
   */
  dispute_warning: '4000000000005423',
  
  /** 
   * Card is declined with incorrect CVC 
   */
  incorrect_cvc: '4000000000000127',
  
  /** 
   * Card is declined with expired card code 
   */
  expired_card: '4000000000000069',
  
  /** 
   * Card is declined with processing error 
   */
  processing_error: '4000000000000119',
  
  /** 
   * Always requires authentication (for testing 3DS flows) 
   */
  always_authenticate: '4000002760003184',
  
  /** 
   * Attach to a Customer, successful payment, dispute as fraudulent 
   */
  fraudulent: '4100000000000019',
} as const;

export type StripeTestCardType = keyof typeof STRIPE_TEST_CARDS;

/**
 * Default test card details to use with test cards
 */
export const TEST_CARD_DETAILS = {
  expMonth: 12,
  expYear: 2030,
  cvc: '123',
} as const;

/**
 * Test card details for different scenarios
 */
export const TEST_CARD_SCENARIOS = {
  /** Standard successful payment */
  successfulPayment: {
    number: STRIPE_TEST_CARDS.success,
    ...TEST_CARD_DETAILS,
  },
  
  /** Payment that will be declined */
  declinedPayment: {
    number: STRIPE_TEST_CARDS.decline,
    ...TEST_CARD_DETAILS,
  },
  
  /** Payment requiring 3D Secure */
  requiresAuth: {
    number: STRIPE_TEST_CARDS.requires_authentication,
    ...TEST_CARD_DETAILS,
  },
  
  /** Payment that will trigger dispute flow */
  disputeFlow: {
    number: STRIPE_TEST_CARDS.dispute_warning,
    ...TEST_CARD_DETAILS,
  },
} as const;

/**
 * Helper to create a test payment method data object for Stripe
 */
export function createTestPaymentMethodData(cardType: StripeTestCardType = 'success') {
  return {
    type: 'card' as const,
    card: {
      number: STRIPE_TEST_CARDS[cardType],
      exp_month: TEST_CARD_DETAILS.expMonth,
      exp_year: TEST_CARD_DETAILS.expYear,
      cvc: TEST_CARD_DETAILS.cvc,
    },
  };
}

/**
 * Test bank accounts for ACH transfers (US only)
 */
export const STRIPE_TEST_BANK_ACCOUNTS = {
  /** Succeeds for micro-deposit verification */
  success: {
    routingNumber: '110000000',
    accountNumber: '000123456789',
  },
  /** Always fails verification */
  failure: {
    routingNumber: '110000000', 
    accountNumber: '000111111116',
  },
} as const;
