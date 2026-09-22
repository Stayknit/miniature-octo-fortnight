// Server-side feature flags. Read at request time so toggling the env var takes
// effect on the next request without a code change.

function envOn(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true'
}

// Optional trial card capture (charge R1, save the card authorization, refund
// the R1). Kept OFF by default behind this switch because the card-on-file /
// recurring-charge clause in the Terms (§5) is not yet counsel-approved — no
// real card may be charged in production until this is deliberately enabled.
// Turn on by setting TRIAL_CARD_CAPTURE_ENABLED=1 in the project environment.
export function isTrialCardCaptureEnabled(): boolean {
  return envOn(process.env.TRIAL_CARD_CAPTURE_ENABLED)
}
