/**
 * Order System — Types, Store, and Service
 * Sprint 4: S4-BE-01
 *
 * Handles: Order creation, status tracking, recharge history.
 * Persistence: JSON file in HERMES_HOME/orders/
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { getHermesHome } from "../config";

// ── Types ───────────────────────────────────────────────────────────────────

export type OrderStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "refunded"
  | "expired";

export type PaymentProvider = "stripe" | "coinbase";

export type OrderType = "recharge" | "subscription" | "refund";

export interface Order {
  id: string;
  userId: string;
  type: OrderType;
  status: OrderStatus;
  provider: PaymentProvider;
  providerTransactionId: string;
  amount: number; // in cents (USD)
  currency: string;
  tokenAmount: number; // XCT tokens credited
  bonusAmount: number; // Bonus XCT tokens
  metadata: Record<string, string>;
  createdAt: number; // Unix timestamp ms
  updatedAt: number;
  completedAt?: number;
  expiresAt?: number;
  errorMessage?: string;
}

export interface RechargeOrderParams {
  userId: string;
  provider: PaymentProvider;
  providerTransactionId: string;
  amount: number; // in cents
  currency: string;
  tokenAmount: number;
  bonusAmount: number;
  metadata?: Record<string, string>;
}

// ── Order Store ───────────────────────────────────────────────────────────────

function getOrdersDir(): string {
  const home = getHermesHome();
  const dir = join(home, "orders");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getOrdersIndexPath(): string {
  return join(getOrdersDir(), "index.json");
}

interface OrderStore {
  orders: Record<string, Order>;
  index: string[]; // order IDs, newest first
}

function readStore(): OrderStore {
  const path = getOrdersIndexPath();
  if (!existsSync(path)) {
    return { orders: {}, index: [] };
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as OrderStore;
  } catch {
    return { orders: {}, index: [] };
  }
}

function writeStore(store: OrderStore): void {
  const path = getOrdersIndexPath();
  writeFileSync(path, JSON.stringify(store, null, 2), "utf-8");
}

// ── Order Service ─────────────────────────────────────────────────────────────

/**
 * Create a new order (call after payment provider checkout is initiated)
 */
export function createOrder(params: RechargeOrderParams): Order {
  const now = Date.now();
  const order: Order = {
    id: randomUUID(),
    userId: params.userId,
    type: "recharge",
    status: "pending",
    provider: params.provider,
    providerTransactionId: params.providerTransactionId,
    amount: params.amount,
    currency: params.currency,
    tokenAmount: params.tokenAmount,
    bonusAmount: params.bonusAmount,
    metadata: params.metadata ?? {},
    createdAt: now,
    updatedAt: now,
    expiresAt: now + 30 * 60 * 1000, // 30 minutes to complete
  };

  const store = readStore();
  store.orders[order.id] = order;
  store.index.unshift(order.id); // newest first
  writeStore(store);

  return order;
}

/**
 * Get an order by ID
 */
export function getOrder(orderId: string): Order | null {
  const store = readStore();
  return store.orders[orderId] ?? null;
}

/**
 * Get orders for a user, sorted newest first
 */
export function getUserOrders(
  userId: string,
  limit = 50,
): Order[] {
  const store = readStore();
  const orders: Order[] = [];
  for (const id of store.index) {
    const order = store.orders[id];
    if (order && order.userId === userId) {
      orders.push(order);
      if (orders.length >= limit) break;
    }
  }
  return orders;
}

/**
 * Get recharge history (completed orders only)
 */
export function getRechargeHistory(
  userId: string,
  limit = 20,
): Order[] {
  const store = readStore();
  const orders: Order[] = [];
  for (const id of store.index) {
    const order = store.orders[id];
    if (
      order &&
      order.userId === userId &&
      order.type === "recharge" &&
      order.status === "completed"
    ) {
      orders.push(order);
      if (orders.length >= limit) break;
    }
  }
  return orders;
}

/**
 * Update order status
 */
export function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  errorMessage?: string,
): Order | null {
  const store = readStore();
  const order = store.orders[orderId];
  if (!order) return null;

  order.status = status;
  order.updatedAt = Date.now();
  if (status === "completed") {
    order.completedAt = Date.now();
  }
  if (errorMessage) {
    order.errorMessage = errorMessage;
  }

  store.orders[order.id] = order;
  writeStore(store);

  return order;
}

/**
 * Get order by provider transaction ID
 */
export function getOrderByTransactionId(
  provider: PaymentProvider,
  transactionId: string,
): Order | null {
  const store = readStore();
  for (const id of store.index) {
    const order = store.orders[id];
    if (
      order &&
      order.provider === provider &&
      order.providerTransactionId === transactionId
    ) {
      return order;
    }
  }
  return null;
}

/**
 * Get total recharge for a user (in cents)
 */
export function getUserTotalRecharge(userId: string): number {
  const store = readStore();
  let total = 0;
  for (const id of store.index) {
    const order = store.orders[id];
    if (
      order &&
      order.userId === userId &&
      order.type === "recharge" &&
      order.status === "completed"
    ) {
      total += order.amount;
    }
  }
  return total;
}

/**
 * Expire stale pending orders (>30 min old)
 */
export function expireStaleOrders(): number {
  const store = readStore();
  const now = Date.now();
  let expired = 0;

  for (const id of store.index) {
    const order = store.orders[id];
    if (
      order &&
      order.status === "pending" &&
      order.expiresAt &&
      now > order.expiresAt
    ) {
      order.status = "expired";
      order.updatedAt = now;
      expired++;
    }
  }

  if (expired > 0) {
    writeStore(store);
  }

  return expired;
}

/**
 * Get order statistics for admin
 */
export function getOrderStats(): {
  total: number;
  pending: number;
  completed: number;
  failed: number;
  totalRevenue: number; // cents
} {
  const store = readStore();
  let total = 0;
  let pending = 0;
  let completed = 0;
  let failed = 0;
  let totalRevenue = 0;

  for (const id of store.index) {
    const order = store.orders[id];
    if (!order) continue;
    total++;
    switch (order.status) {
      case "pending":
      case "processing":
        pending++;
        break;
      case "completed":
        completed++;
        totalRevenue += order.amount;
        break;
      case "failed":
      case "refunded":
        failed++;
        break;
    }
  }

  return { total, pending, completed, failed, totalRevenue };
}
