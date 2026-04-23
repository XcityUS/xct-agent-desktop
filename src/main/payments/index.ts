/**
 * Unified Payments Interface — Stripe + Coinbase Commerce
 * Sprint 4: S4-BE-PAY
 *
 * Provides a unified interface for all payment providers.
 * Each provider implements the same PaymentProvider interface.
 */

import { createCoinbaseCharge, verifyCoinbaseWebhook, getCoinbaseCharge } from "./coinbase";
import { createStripeSession, verifyStripeWebhook, getStripeSession, createStripeRefund } from "./stripe";
import { getConfig } from "../config-manager";

// ── Types ───────────────────────────────────────────────────────────────────

export type PaymentProvider = "stripe" | "coinbase";

export interface CreatePaymentParams {
  provider: PaymentProvider;
  amount: number; // in cents (USD) or smallest currency unit
  currency?: string;
  metadata?: Record<string, string>;
  description?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export type PaymentStatus = "pending" | "completed" | "failed" | "cancelled" | "expired";

export interface PaymentResult {
  provider: PaymentProvider;
  sessionId: string;
  checkoutUrl?: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  metadata?: Record<string, string>;
}

export interface RefundParams {
  provider: PaymentProvider;
  transactionId: string;
  amount?: number; // partial refund amount in cents, omit for full refund
  reason?: string;
}

export interface RefundResult {
  success: boolean;
  refundId: string;
  amount: number;
  status: "succeeded" | "pending" | "failed";
}

export interface WebhookVerifyResult {
  valid: boolean;
  event?: Record<string, unknown>;
  error?: string;
}

// ── Payment Denominations ─────────────────────────────────────────────────────

export const RECHARGE_DENOMINATIONS = [
  { id: "xct-500",  amount: 500,  bonus: 0,   label: "500 XCT",  price: 500  },
  { id: "xct-1000", amount: 1000, bonus: 100,  label: "1,100 XCT", price: 1000 },
  { id: "xct-2500", amount: 2500, bonus: 375,  label: "2,875 XCT", price: 2500 },
  { id: "xct-5000", amount: 5000, bonus: 1000, label: "6,000 XCT", price: 5000 },
  { id: "xct-100",  amount: 100, bonus: 20,   label: "120 XCT",   price: 100  },
] as const;

export type RechargeDenominationId = (typeof RECHARGE_DENOMINATIONS)[number]["id"];

// ── Unified Payments API ─────────────────────────────────────────────────────

export async function createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
  const config = getConfig();
  const successUrl = params.successUrl ?? `${config.apiBaseUrl}/payment/success`;
  const cancelUrl = params.cancelUrl ?? `${config.apiBaseUrl}/payment/cancel`;

  if (params.provider === "stripe") {
    const result = await createStripeSession({
      amount: params.amount,
      currency: params.currency ?? "usd",
      metadata: params.metadata,
      description: params.description,
      successUrl,
      cancelUrl,
    });
    return {
      provider: "stripe",
      sessionId: result.sessionId,
      checkoutUrl: result.checkoutUrl,
      amount: params.amount,
      currency: params.currency ?? "usd",
      status: result.status,
      metadata: params.metadata,
    };
  } else {
    // Coinbase Commerce
    const result = await createCoinbaseCharge({
      amount: params.amount,
      currency: params.currency ?? "USDC",
      metadata: params.metadata,
      description: params.description,
    });
    return {
      provider: "coinbase",
      sessionId: result.chargeId,
      checkoutUrl: result.hostedUrl,
      amount: params.amount,
      currency: params.currency ?? "USDC",
      status: result.status as PaymentStatus,
      metadata: params.metadata,
    };
  }
}

export async function verifyWebhook(
  provider: PaymentProvider,
  payload: string,
  signature: string,
  secret?: string,
): Promise<WebhookVerifyResult> {
  if (provider === "stripe") {
    const webhookSecret = secret ?? getConfig().stripePublicKey ?? "";
    return verifyStripeWebhook(payload, signature, webhookSecret);
  } else {
    const webhookSecret = secret ?? "";
    return verifyCoinbaseWebhook(payload, signature, webhookSecret);
  }
}

export async function createRefund(params: RefundParams): Promise<RefundResult> {
  if (params.provider === "stripe") {
    return createStripeRefund({
      transactionId: params.transactionId,
      amount: params.amount,
      reason: params.reason,
    });
  } else {
    // Coinbase Commerce — charges are immutable, no refunds via API
    return {
      success: false,
      refundId: "",
      amount: 0,
      status: "failed",
    };
  }
}

export async function getPaymentStatus(
  provider: PaymentProvider,
  transactionId: string,
): Promise<PaymentResult | null> {
  if (provider === "stripe") {
    const session = await getStripeSession(transactionId);
    if (!session) return null;
    return {
      provider: "stripe",
      sessionId: session.sessionId,
      amount: session.amount,
      currency: session.currency,
      status: session.status as PaymentStatus,
      metadata: session.metadata,
    };
  } else {
    const charge = await getCoinbaseCharge(transactionId);
    if (!charge) return null;
    return {
      provider: "coinbase",
      sessionId: charge.chargeId,
      amount: charge.amount,
      currency: charge.currency,
      status: charge.status as PaymentStatus,
    };
  }
}
