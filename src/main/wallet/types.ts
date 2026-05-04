/**
 * Shared types for the central wallet client.
 *
 * The desktop app no longer holds Stripe / Coinbase credentials. All money
 * operations are server-side at https://wallet.xcity.one. The desktop app is
 * a thin client that authenticates with a per-user JWT issued by xcity.one.
 */

export type PaymentMethod =
  | 'card'
  | 'alipay'
  | 'wechat_pay'
  | 'crypto';

export type Plan = 'free' | 'pro_monthly' | 'team_monthly' | 'enterprise';

export type PlanStatus =
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'trialing'
  | 'incomplete';

export interface WalletBalance {
  wallet_id: string;
  balance: number;
  monthly_cap_usd: number | null;
  spend_this_period_usd: number;
  plan: Plan;
  plan_status: PlanStatus;
}

export type OrderStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'refunded';

export type OrderProvider = 'stripe' | 'coinbase';

export interface WalletOrder {
  id: string;
  status: OrderStatus;
  provider: OrderProvider;
  amount_usd: number;
  credits_granted: number;
  payment_method: PaymentMethod | null;
  created_at: string;
  completed_at: string | null;
}

export interface CheckoutSession {
  url: string;
  provider: OrderProvider;
  session_id: string;
}

/** The 5 packs from the wallet service. ID strings match xct-wallet's pack registry. */
export const RECHARGE_PACKS = [
  { id: 'pack_5', amount_usd: 5, credits: 5_000, bonus_credits: 0 },
  { id: 'pack_15', amount_usd: 15, credits: 15_000, bonus_credits: 750 },
  { id: 'pack_25', amount_usd: 25, credits: 25_000, bonus_credits: 2_500 },
  { id: 'pack_50', amount_usd: 50, credits: 50_000, bonus_credits: 7_500 },
  { id: 'pack_100', amount_usd: 100, credits: 100_000, bonus_credits: 15_000 },
] as const;

export type RechargePackId = (typeof RECHARGE_PACKS)[number]['id'];
