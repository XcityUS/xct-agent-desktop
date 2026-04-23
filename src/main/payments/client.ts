/**
 * Stripe Client Singleton
 * Sprint 4: S4-BE-PAY
 *
 * Lazily initializes the Stripe client from secrets.
 */

import Stripe from "stripe";
import type { Stripe as StripeClient } from "stripe";
import { getSecrets } from "../config-manager";

let _stripeClient: StripeClient | null = null;

export function getStripeClient(): StripeClient {
  if (_stripeClient) return _stripeClient;

  const secrets = getSecrets();
  const secretKey = secrets.stripeSecretKey ?? "sk_tes...lder";

  _stripeClient = new Stripe(secretKey, {
    apiVersion: "2026-03-25.dahlia",
    typescript: true,
    timeout: 10_000,
    host: "api.stripe.com",
    telemetry: false,
  });

  return _stripeClient;
}
