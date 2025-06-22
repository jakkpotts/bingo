# Stripe Integration Guide

## Overview

The card validation system now includes optional Stripe integration for enhanced payment processor validation. This feature uses Stripe's card validation API to verify card details beyond basic Luhn and BIN lookup validation.

## Setup Instructions

### 1. Get Stripe Publishable Key

1. Create a Stripe account at [stripe.com](https://stripe.com)
2. Go to your Stripe Dashboard
3. Navigate to "Developers" → "API Keys"
4. Copy your **Publishable Key** (starts with `pk_test_` for test mode or `pk_live_` for live mode)

### 2. Configure the Application

1. Open the card validation section in the application
2. Paste your Stripe publishable key in the "Stripe Publishable Key" field
3. The key will be used for all subsequent validations

## How It Works

### Individual Card Validation

When you provide a Stripe key and validate a card:

1. **With Expiry/CVV**: Full Stripe validation using the provided card details
2. **Without Expiry/CVV**: Basic structure validation using dummy expiry/CVV values

### Batch Validation

For batch validation, Stripe will validate card structure using dummy expiry/CVV values since individual expiry dates aren't available for generated cards.

## Validation Results

Stripe validation provides additional information:

- **Card Brand**: Visa, MasterCard, American Express, etc.
- **Card Country**: Country where the card was issued
- **Card Funding**: Credit, debit, prepaid, or unknown
- **Last 4 Digits**: For verification purposes
- **Expiry Date**: When provided

## Error Handling

Common Stripe validation errors:

- `invalid_number`: Card number is invalid
- `invalid_expiry_month`: Invalid expiry month
- `invalid_expiry_year`: Invalid expiry year
- `invalid_cvc`: Invalid CVV/CVC code
- `card_declined`: Card was declined by issuer

## Security Notes

- **Publishable Key Only**: This integration only uses Stripe's publishable key, which is safe to expose in client-side code
- **No Secret Key**: Never enter your secret key in this application
- **Payment Method Creation**: Stripe creates payment method objects for validation, no sensitive data is stored
- **Test Mode**: Use test mode keys (`pk_test_`) for development and testing

## Testing

Use Stripe's test card numbers for testing:

- **4242424242424242**: Visa (successful)
- **4000000000000002**: Visa (declined)
- **5555555555554444**: Mastercard (successful)
- **378282246310005**: American Express (successful)

## API Limits

- Stripe has rate limits on their API
- For high-volume testing, consider implementing delays between requests
- Monitor your Stripe dashboard for usage statistics

## Support

For Stripe-specific issues:
- [Stripe Documentation](https://stripe.com/docs)
- [Stripe Support](https://support.stripe.com)

For application issues, check the browser console for detailed error messages. 