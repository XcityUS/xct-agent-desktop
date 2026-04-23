/**
 * Coinbase Commerce Integration (Direct API)
 * Sprint 4: S4-BE-PAY
 *
 * Uses Coinbase Commerce API v1 directly via fetch.
 * Docs: https://docs.cloud.coinbase.com/commerce/docs
 */

import { getSecrets } from "../config-manager";

// ── Types ───────────────────────────────────────────────────────────────────

interface CoinbaseCharge {
  id: string;
  code: string;
  hosted_url: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  status:
    | "pending"
    | "completed"
    | "expired"
    | "canceled"
    | "created"
    | "resolved";
  amounts: Record<string, string>;
  currency: string;
  metadata?: Record<string, string>;
  timeline: Array<{ status: string; time: string }>;
  payments: Array<{
    id: string;
    amount: { amount: string; currency: string };
    network: string;
    status: string;
    created_at: string;
  }>;
}

interface CoinbaseCreateChargeParams {
  amount: number;
  currency: string;
  metadata?: Record<string, string>;
  description?: string;
}

// ── API Client ────────────────────────────────────────────────────────────────

function getCoinbaseClient(): {
  apiKey: string;
  baseUrl: string;
} {
  const secrets = getSecrets();
  return {
    apiKey: secrets.coinbaseApiKey ?? "",
    baseUrl: "https://api.commerce.coinbase.com",
  };
}

async function coinbaseRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const { apiKey, baseUrl } = getCoinbaseClient();

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-CC-Api-Key": apiKey,
      "X-CC-Version": "2018-03-22",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Coinbase API error ${response.status}: ${error}`);
  }

  return response.json() as Promise<T>;
}

// ── Charge Creation ───────────────────────────────────────────────────────────

export async function createCoinbaseCharge(
  params: CoinbaseCreateChargeParams,
): Promise<{
  chargeId: string;
  hostedUrl: string;
  status: "pending" | "completed" | "failed" | "cancelled" | "expired";
}> {
  const { apiKey } = getCoinbaseClient();
  if (!apiKey) {
    // Return mock response in development
    return {
      chargeId: `mock_charge_${Date.now()}`,
      hostedUrl: `https://commerce.coinbase.com/charges/mock`,
      status: "pending",
    };
  }

  const chargeData = {
    name: "XCT Token Recharge",
    description: params.description ?? `${params.amount} XCT tokens`,
    pricing_type: "fixed_price",
    local_price: {
      amount: (params.amount / 100).toFixed(2), // Convert cents to dollars
      currency: params.currency,
    },
    metadata: params.metadata ?? {},
  };

  const response = (await coinbaseRequest<{ data: CoinbaseCharge }>(
    "POST",
    "/charges",
    chargeData,
  )) as { data: CoinbaseCharge };

  const charge = response.data;

  return {
    chargeId: charge.id,
    hostedUrl: charge.hosted_url,
    status: mapCoinbaseStatus(charge.status),
  };
}

// ── Charge Query ─────────────────────────────────────────────────────────────

export async function getCoinbaseCharge(chargeId: string): Promise<{
  chargeId: string;
  amount: number;
  currency: string;
  status: "pending" | "completed" | "failed" | "cancelled" | "expired";
} | null> {
  const { apiKey } = getCoinbaseClient();
  if (!apiKey) {
    return null;
  }

  try {
    const response = (await coinbaseRequest<{ data: CoinbaseCharge }>(
      "GET",
      `/charges/${chargeId}`,
    )) as { data: CoinbaseCharge };

    const charge = response.data;
    const primaryAmount = Object.values(charge.amounts)[0];
    const amount = parseFloat(primaryAmount ?? "0") * 100;

    return {
      chargeId: charge.id,
      amount,
      currency: charge.currency,
      status: mapCoinbaseStatus(charge.status),
    };
  } catch {
    return null;
  }
}

// ── Webhook Verification ──────────────────────────────────────────────────────

const EXTRA_SHA256_LENGTH = 6; // "sha256=" prefix

export async function verifyCoinbaseWebhook(
  payload: string,
  signature: string,
  webhookSecret: string,
): Promise<{ valid: boolean; event?: Record<string, unknown>; error?: string }> {
  if (!webhookSecret) {
    return { valid: false, error: "Missing webhook secret" };
  }

  try {
    // Compute HMAC-SHA256 of the raw body using the webhook secret
    const secretBytes = new TextEncoder().encode(webhookSecret);
    const payloadBytes = new TextEncoder().encode(payload);

    const key = await crypto.subtle.importKey(
      "raw",
      secretBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signatureBytes = await crypto.subtle.sign("HMAC", key, payloadBytes);
    const expectedSignature = Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const signatureHex = signature.startsWith("sha256=")
      ? signature.substring(EXTRA_SHA256_LENGTH)
      : signature;

    // Timing-safe comparison
    if (!timingSafeEqual(signatureHex, expectedSignature)) {
      return { valid: false, error: "Invalid webhook signature" };
    }

    const event = JSON.parse(payload) as Record<string, unknown>;
    return { valid: true, event };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    return { valid: false, error };
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ── Status Mapping ───────────────────────────────────────────────────────────

function mapCoinbaseStatus(
  status: CoinbaseCharge["status"],
): "pending" | "completed" | "failed" | "cancelled" | "expired" {
  switch (status) {
    case "completed":
    case "resolved":
      return "completed";
    case "canceled":
      return "cancelled";
    case "expired":
      return "expired";
    default:
      return "pending";
  }
}
