/**
 * Stripe Payment Integration
 * Sprint 4: S4-BE-PAY
 *
 * Provides Stripe Checkout Session creation, webhook verification,
 * and refund processing.
 */

import { getSecrets } from "../config-manager";
import { getStripeClient } from "./client";

// ── Types ───────────────────────────────────────────────────────────────────

export interface CreateStripeSessionParams {
  amount: number;
  currency: string;
  metadata?: Record<string, string>;
  description?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CreateStripeSessionResult {
  sessionId: string;
  checkoutUrl: string;
  status: "pending" | "completed" | "failed" | "cancelled";
}

export interface StripeRefundParams {
  transactionId: string;
  amount?: number;
  reason?: string;
}

// ── Session Creation ─────────────────────────────────────────────────────────

export async function createStripeSession(
  params: CreateStripeSessionParams,
): Promise<CreateStripeSessionResult> {
  const stripe = getStripeClient();
  const secrets = getSecrets();

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: params.currency.toLowerCase(),
          product_data: {
            name: params.description ?? "XCT Token Recharge",
            description: `Recharge ${params.amount} XCT tokens`,
          },
          unit_amount: params.amount,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: params.metadata ?? {},
    ...(secrets.stripeSecretKey
      ? {}
      : {}),
  });

  return {
    sessionId: session.id,
    checkoutUrl: session.url ?? "",
    status: session.payment_status === "paid" ? "completed" : "pending",
  };
}

// ── Session Query ─────────────────────────────────────────────────────────────

export async function getStripeSession(sessionId: string) {
  const stripe = getStripeClient();
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items"],
    });
    return {
      sessionId: session.id,
      amount: session.amount_total ?? 0,
      currency: session.currency ?? "usd",
      status:
        session.payment_status === "paid"
          ? "completed"
          : session.payment_status === "unpaid"
            ? "pending"
            : (session.payment_status as string) === "failed"
              ? "failed"
              : "pending", // "no_payment_required"
      metadata: session.metadata ?? {},
    };
  } catch {
    return null;
  }
}

// ── Webhook Verification ──────────────────────────────────────────────────────

export async function verifyStripeWebhook(
  payload: string,
  signature: string,
  webhookSecret: string,
): Promise<{ valid: boolean; event?: Record<string, unknown>; error?: string }> {
  if (!webhookSecret) {
    return { valid: false, error: "Missing webhook secret" };
  }

  try {
    const stripe = getStripeClient();
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret,
      300, // 5 minute tolerance in seconds
    );

    return { valid: true, event: event as unknown as Record<string, unknown> };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    return { valid: false, error };
  }
}

// ── Refunds ───────────────────────────────────────────────────────────────────

export async function createStripeRefund(
  params: StripeRefundParams,
): Promise<{
  success: boolean;
  refundId: string;
  amount: number;
  status: "succeeded" | "pending" | "failed";
}> {
  try {
    const stripe = getStripeClient();
    const refund = await stripe.refunds.create({
      payment_intent: params.transactionId,
      amount: params.amount,
      reason: params.reason as "duplicate" | "fraudulent" | "requested_by_customer" | undefined,
    });

    return {
      success: refund.status === "succeeded",
      refundId: refund.id,
      amount: refund.amount,
      status: refund.status as "succeeded" | "pending" | "failed",
    };
  } catch {
    return { success: false, refundId: "", amount: 0, status: "failed" };
  }
}
