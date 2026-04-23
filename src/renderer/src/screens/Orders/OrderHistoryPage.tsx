/**
 * OrderHistoryPage — Recharge & Order History
 * Sprint 4: S4-FE-02
 *
 * Displays user's recharge history and order status.
 */

import { useState, useEffect } from "react";
import {
  ArrowLeft,
  History,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  RefreshCw,
  Coins,
  Download,
} from "lucide-react";

interface Order {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | "refunded" | "expired";
  tokenAmount: number;
  bonusAmount: number;
  amount: number; // in cents
  currency: string;
  provider: "stripe" | "coinbase";
  createdAt: number;
  completedAt?: number;
}

// Mock data — in production comes from IPC
function mockOrders(): Order[] {
  const now = Date.now();
  return [
    {
      id: "order-001",
      status: "completed",
      tokenAmount: 1100,
      bonusAmount: 100,
      amount: 1000,
      currency: "usd",
      provider: "stripe",
      createdAt: now - 86400000 * 2,
      completedAt: now - 86400000 * 2 + 5000,
    },
    {
      id: "order-002",
      status: "completed",
      tokenAmount: 500,
      bonusAmount: 0,
      amount: 500,
      currency: "usd",
      provider: "coinbase",
      createdAt: now - 86400000 * 5,
      completedAt: now - 86400000 * 5 + 120000,
    },
    {
      id: "order-003",
      status: "pending",
      tokenAmount: 2875,
      bonusAmount: 375,
      amount: 2500,
      currency: "usd",
      provider: "stripe",
      createdAt: now - 3600000,
    },
  ];
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

function StatusBadge({ status }: { status: Order["status"] }): React.JSX.Element {
  const configs: Record<
    Order["status"],
    { icon: React.ReactNode; label: string; className: string }
  > = {
    completed: {
      icon: <CheckCircle size={12} />,
      label: "Completed",
      className: "status-completed",
    },
    pending: {
      icon: <Clock size={12} />,
      label: "Pending",
      className: "status-pending",
    },
    processing: {
      icon: <RefreshCw size={12} className="spin" />,
      label: "Processing",
      className: "status-processing",
    },
    failed: {
      icon: <XCircle size={12} />,
      label: "Failed",
      className: "status-failed",
    },
    refunded: {
      icon: <AlertCircle size={12} />,
      label: "Refunded",
      className: "status-refunded",
    },
    expired: {
      icon: <XCircle size={12} />,
      label: "Expired",
      className: "status-expired",
    },
  };
  const cfg = configs[status];
  return (
    <span className={`order-status-badge ${cfg.className}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

interface OrderHistoryPageProps {
  onBack?: () => void;
  userId?: string;
}

function OrderHistoryPage({
  onBack,
  userId = "demo-user",
}: OrderHistoryPageProps): React.JSX.Element {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | Order["status"]>("all");

  useEffect(() => {
    loadOrders();
  }, [userId]);

  const loadOrders = async () => {
    setLoading(true);
    // In production: const result = await window.api.getOrderHistory(userId);
    await new Promise((r) => setTimeout(r, 600));
    setOrders(mockOrders());
    setLoading(false);
  };

  const filteredOrders =
    filter === "all" ? orders : orders.filter((o) => o.status === filter);

  const totalSpent = orders
    .filter((o) => o.status === "completed")
    .reduce((sum, o) => sum + o.amount, 0);

  const totalTokens = orders
    .filter((o) => o.status === "completed")
    .reduce((sum, o) => sum + o.tokenAmount + o.bonusAmount, 0);

  const handleExportCSV = () => {
    const headers = ["Order ID", "Date", "Status", "Tokens", "Bonus", "Amount", "Provider"];
    const rows = filteredOrders.map((o) => [
      o.id,
      formatDate(o.createdAt),
      o.status,
      o.tokenAmount.toString(),
      o.bonusAmount.toString(),
      formatCurrency(o.amount, o.currency),
      o.provider,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `xct-orders-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="order-history-page">
      {/* Header */}
      <div className="order-header">
        {onBack && (
          <button className="order-back-btn" onClick={onBack}>
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="order-title">
          <History size={24} />
          <h1>Order History</h1>
        </div>
        <button
          className="order-refresh-btn"
          onClick={loadOrders}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw size={18} className={loading ? "spin" : ""} />
        </button>
      </div>

      {/* Stats Summary */}
      <div className="order-stats">
        <div className="stat-card">
          <Coins size={20} />
          <div className="stat-content">
            <span className="stat-value">{totalTokens.toLocaleString()}</span>
            <span className="stat-label">Total XCT Earned</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-value">
            {formatCurrency(totalSpent, "usd")}
          </span>
          <span className="stat-label">Total Spent</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{orders.filter((o) => o.status === "completed").length}</span>
          <span className="stat-label">Completed Orders</span>
        </div>
      </div>

      {/* Filters */}
      <div className="order-filters">
        {(["all", "completed", "pending", "failed"] as const).map((f) => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button
          className="export-btn"
          onClick={handleExportCSV}
          disabled={filteredOrders.length === 0}
        >
          <Download size={14} />
          Export CSV
        </button>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="order-loading">
          <RefreshCw size={24} className="spin" />
          <span>Loading orders...</span>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="order-empty">
          <History size={48} />
          <h3>No orders found</h3>
          <p>
            {filter === "all"
              ? "You haven't placed any orders yet."
              : `No ${filter} orders.`}
          </p>
        </div>
      ) : (
        <div className="order-list">
          {filteredOrders.map((order) => (
            <div key={order.id} className="order-card">
              <div className="order-card-header">
                <div className="order-id">
                  <span className="order-id-label">Order</span>
                  <code>{order.id}</code>
                </div>
                <StatusBadge status={order.status} />
              </div>

              <div className="order-card-body">
                <div className="order-tokens">
                  <Coins size={18} />
                  <span className="tokens-amount">
                    {order.tokenAmount.toLocaleString()}
                  </span>
                  {order.bonusAmount > 0 && (
                    <span className="tokens-bonus">
                      +{order.bonusAmount.toLocaleString()} bonus
                    </span>
                  )}
                  <span className="tokens-label">XCT</span>
                </div>

                <div className="order-details">
                  <div className="order-detail-row">
                    <span>Amount</span>
                    <span className="detail-value">
                      {formatCurrency(order.amount, order.currency)}
                    </span>
                  </div>
                  <div className="order-detail-row">
                    <span>Provider</span>
                    <span className="detail-value provider">
                      {order.provider === "stripe" ? "Credit Card" : "Crypto"}
                    </span>
                  </div>
                  <div className="order-detail-row">
                    <span>Created</span>
                    <span className="detail-value">{formatDate(order.createdAt)}</span>
                  </div>
                  {order.completedAt && (
                    <div className="order-detail-row">
                      <span>Completed</span>
                      <span className="detail-value">
                        {formatDate(order.completedAt)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .order-history-page {
          padding: 24px;
          max-width: 720px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .order-header {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .order-back-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 8px;
          border-radius: 8px;
          color: var(--color-fg-muted, #888);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .order-back-btn:hover { background: var(--color-bg-secondary, #f0f0f0); }
        .order-title {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
        }
        .order-title h1 { font-size: 24px; font-weight: 700; margin: 0; }
        .order-refresh-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 8px;
          border-radius: 8px;
          color: var(--color-fg-muted, #888);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .order-refresh-btn:hover { background: var(--color-bg-secondary, #f0f0f0); }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .order-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .stat-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: var(--color-bg-secondary, #f5f5f5);
          border-radius: 12px;
          color: var(--color-fg-muted, #888);
        }
        .stat-content { display: flex; flex-direction: column; }
        .stat-value { font-size: 18px; font-weight: 800; color: var(--color-fg, #222); }

        .order-filters {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }
        .filter-btn {
          padding: 6px 16px;
          border-radius: 20px;
          border: 1px solid var(--color-border, #e0e0e0);
          background: none;
          font-size: 13px;
          cursor: pointer;
          color: var(--color-fg-muted, #888);
          transition: all 0.15s;
        }
        .filter-btn:hover { border-color: var(--color-accent, #0066cc); color: var(--color-accent, #0066cc); }
        .filter-btn.active {
          background: var(--color-accent, #0066cc);
          border-color: var(--color-accent, #0066cc);
          color: white;
        }
        .export-btn {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 16px;
          border-radius: 20px;
          border: 1px solid var(--color-border, #e0e0e0);
          background: none;
          font-size: 13px;
          cursor: pointer;
          color: var(--color-fg-muted, #888);
        }
        .export-btn:hover { border-color: var(--color-success, #22c55e); color: var(--color-success, #22c55e); }
        .export-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .order-loading, .order-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 48px;
          color: var(--color-fg-muted, #888);
          text-align: center;
        }
        .order-empty h3 { margin: 0; color: var(--color-fg, #222); }
        .order-empty p { margin: 0; }

        .order-list { display: flex; flex-direction: column; gap: 12px; }
        .order-card {
          border: 1px solid var(--color-border, #e0e0e0);
          border-radius: 12px;
          overflow: hidden;
          background: var(--color-bg, #fff);
        }
        .order-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid var(--color-border, #e0e0e0);
          background: var(--color-bg-secondary, #f5f5f5);
        }
        .order-id { display: flex; align-items: center; gap: 8px; }
        .order-id-label { font-size: 11px; color: var(--color-fg-muted, #888); }
        .order-id code { font-size: 12px; font-family: monospace; color: var(--color-fg, #222); }
        .order-card-body { padding: 16px; display: flex; gap: 24px; align-items: flex-start; }
        .order-tokens {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--color-accent, #0066cc);
          flex-shrink: 0;
        }
        .tokens-amount { font-size: 22px; font-weight: 800; }
        .tokens-bonus { font-size: 12px; color: var(--color-success, #22c55e); font-weight: 600; }
        .tokens-label { font-size: 12px; color: var(--color-fg-muted, #888); }
        .order-details { flex: 1; display: flex; flex-direction: column; gap: 6px; }
        .order-detail-row {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          color: var(--color-fg-muted, #888);
        }
        .detail-value { color: var(--color-fg, #222); font-weight: 500; }
        .detail-value.provider { text-transform: capitalize; }

        .order-status-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
        }
        .status-completed { background: #dcfce7; color: #16a34a; }
        .status-pending { background: #fef9c3; color: #a16207; }
        .status-processing { background: #dbeafe; color: #2563eb; }
        .status-failed { background: #fee2e2; color: #dc2626; }
        .status-refunded { background: #f3e8ff; color: #7c3aed; }
        .status-expired { background: #f1f5f9; color: #64748b; }
      `}</style>
    </div>
  );
}

export default OrderHistoryPage;
