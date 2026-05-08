/**
 * OrderHistoryPage — recharge order list, sourced from xct-wallet.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Clock,
  Coins,
  Download,
  History,
  RefreshCw,
  Wallet,
  XCircle,
} from "lucide-react";

type OrderStatus = "pending" | "completed" | "failed" | "expired" | "refunded";

interface Order {
  id: string;
  status: OrderStatus;
  provider: "stripe" | "coinbase";
  amount_usd: number;
  credits_granted: number;
  payment_method: "card" | "alipay" | "wechat_pay" | "crypto" | null;
  created_at: string;
  completed_at: string | null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatUsd(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

const STATUS_CONFIG: Record<
  OrderStatus,
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

function StatusBadge({ status }: { status: OrderStatus }): React.JSX.Element {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`order-status-badge ${cfg.className}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

interface OrderHistoryPageProps {
  onBack?: () => void;
}

function OrderHistoryPage({
  onBack,
}: OrderHistoryPageProps): React.JSX.Element {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | OrderStatus>("all");

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    const isConn = await window.hermesAPI.walletIsConnected();
    setConnected(isConn);
    if (!isConn) {
      setOrders([]);
      setLoading(false);
      return;
    }
    const res = await window.hermesAPI.walletGetHistory(50);
    if (!res.ok) {
      if (res.error === "wallet_not_connected") {
        setConnected(false);
      } else {
        setError(res.error);
      }
      setOrders([]);
    } else {
      setOrders(res.orders);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const filtered = useMemo(
    () =>
      filter === "all" ? orders : orders.filter((o) => o.status === filter),
    [orders, filter],
  );

  const totals = useMemo(() => {
    const completed = orders.filter((o) => o.status === "completed");
    return {
      spent: completed.reduce((s, o) => s + o.amount_usd, 0),
      credits: completed.reduce((s, o) => s + o.credits_granted, 0),
      count: completed.length,
    };
  }, [orders]);

  const handleExportCSV = (): void => {
    const headers = [
      "Order ID",
      "Created",
      "Status",
      "Credits",
      "Amount USD",
      "Provider",
      "Method",
    ];
    const rows = filtered.map((o) => [
      o.id,
      formatDate(o.created_at),
      o.status,
      o.credits_granted.toString(),
      formatUsd(o.amount_usd),
      o.provider,
      o.payment_method ?? "",
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${c}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `xct-orders-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (connected === false) {
    return (
      <div className="order-history-page">
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
        </div>
        <div className="order-empty">
          <Wallet size={48} />
          <h3>Wallet not connected</h3>
          <p>
            Connect your Xcity wallet in Settings to see your recharge history.
          </p>
        </div>
        <Styles />
      </div>
    );
  }

  return (
    <div className="order-history-page">
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

      <div className="order-stats">
        <div className="stat-card">
          <Coins size={20} />
          <div className="stat-content">
            <span className="stat-value">
              {totals.credits.toLocaleString()}
            </span>
            <span className="stat-label">Total credits</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-value">{formatUsd(totals.spent)}</span>
          <span className="stat-label">Total spent</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{totals.count}</span>
          <span className="stat-label">Completed</span>
        </div>
      </div>

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
          disabled={filtered.length === 0}
        >
          <Download size={14} />
          Export CSV
        </button>
      </div>

      {error && (
        <div className="order-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="order-loading">
          <RefreshCw size={24} className="spin" />
          <span>Loading orders…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="order-empty">
          <History size={48} />
          <h3>No orders</h3>
          <p>
            {filter === "all"
              ? "You haven't placed any orders yet."
              : `No ${filter} orders.`}
          </p>
        </div>
      ) : (
        <div className="order-list">
          {filtered.map((order) => (
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
                    {order.credits_granted.toLocaleString()}
                  </span>
                  <span className="tokens-label">credits</span>
                </div>

                <div className="order-details">
                  <div className="order-detail-row">
                    <span>Amount</span>
                    <span className="detail-value">
                      {formatUsd(order.amount_usd)}
                    </span>
                  </div>
                  <div className="order-detail-row">
                    <span>Provider</span>
                    <span className="detail-value provider">
                      {order.provider === "stripe"
                        ? "Stripe"
                        : "Coinbase Commerce"}
                      {order.payment_method ? ` · ${order.payment_method}` : ""}
                    </span>
                  </div>
                  <div className="order-detail-row">
                    <span>Created</span>
                    <span className="detail-value">
                      {formatDate(order.created_at)}
                    </span>
                  </div>
                  {order.completed_at && (
                    <div className="order-detail-row">
                      <span>Completed</span>
                      <span className="detail-value">
                        {formatDate(order.completed_at)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Styles />
    </div>
  );
}

function Styles(): React.JSX.Element {
  return (
    <style>{`
      .order-history-page { padding: 24px; max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px; }
      .order-header { display: flex; align-items: center; gap: 16px; }
      .order-back-btn, .order-refresh-btn { background: none; border: none; cursor: pointer; padding: 8px; border-radius: 8px; color: var(--color-fg-muted, #888); display: flex; align-items: center; justify-content: center; }
      .order-back-btn:hover, .order-refresh-btn:hover { background: var(--color-bg-secondary, #f0f0f0); }
      .order-title { display: flex; align-items: center; gap: 12px; flex: 1; }
      .order-title h1 { font-size: 24px; font-weight: 700; margin: 0; }
      .spin { animation: spin 1s linear infinite; }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      .order-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
      .stat-card { display: flex; align-items: center; gap: 12px; padding: 16px; background: var(--color-bg-secondary, #f5f5f5); border-radius: 12px; color: var(--color-fg-muted, #888); }
      .stat-content { display: flex; flex-direction: column; }
      .stat-value { font-size: 18px; font-weight: 800; color: var(--color-fg, #222); }
      .order-filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
      .filter-btn { padding: 6px 16px; border-radius: 20px; border: 1px solid var(--color-border, #e0e0e0); background: none; font-size: 13px; cursor: pointer; color: var(--color-fg-muted, #888); transition: all 0.15s; }
      .filter-btn:hover { border-color: var(--color-accent, #0066cc); color: var(--color-accent, #0066cc); }
      .filter-btn.active { background: var(--color-accent, #0066cc); border-color: var(--color-accent, #0066cc); color: white; }
      .export-btn { margin-left: auto; display: flex; align-items: center; gap: 6px; padding: 6px 16px; border-radius: 20px; border: 1px solid var(--color-border, #e0e0e0); background: none; font-size: 13px; cursor: pointer; color: var(--color-fg-muted, #888); }
      .export-btn:hover:not(:disabled) { border-color: var(--color-success, #22c55e); color: var(--color-success, #22c55e); }
      .export-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .order-loading, .order-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 48px; color: var(--color-fg-muted, #888); text-align: center; }
      .order-empty h3 { margin: 0; color: var(--color-fg, #222); }
      .order-empty p { margin: 0; max-width: 420px; }
      .order-error { display: flex; align-items: center; gap: 8px; padding: 12px 16px; background: color-mix(in srgb, #ef4444 10%, white); border: 1px solid #ef4444; border-radius: 8px; color: #dc2626; font-size: 14px; }
      .order-list { display: flex; flex-direction: column; gap: 12px; }
      .order-card { border: 1px solid var(--color-border, #e0e0e0); border-radius: 12px; overflow: hidden; background: var(--color-bg, #fff); }
      .order-card-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--color-border, #e0e0e0); background: var(--color-bg-secondary, #f5f5f5); }
      .order-id { display: flex; align-items: center; gap: 8px; }
      .order-id-label { font-size: 11px; color: var(--color-fg-muted, #888); }
      .order-id code { font-size: 12px; font-family: monospace; color: var(--color-fg, #222); }
      .order-card-body { padding: 16px; display: flex; gap: 24px; align-items: flex-start; }
      .order-tokens { display: flex; align-items: center; gap: 8px; color: var(--color-accent, #0066cc); flex-shrink: 0; }
      .tokens-amount { font-size: 22px; font-weight: 800; }
      .tokens-label { font-size: 12px; color: var(--color-fg-muted, #888); }
      .order-details { flex: 1; display: flex; flex-direction: column; gap: 6px; }
      .order-detail-row { display: flex; justify-content: space-between; font-size: 13px; color: var(--color-fg-muted, #888); }
      .detail-value { color: var(--color-fg, #222); font-weight: 500; }
      .detail-value.provider { text-transform: capitalize; }
      .order-status-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
      .status-completed { background: #dcfce7; color: #16a34a; }
      .status-pending { background: #fef9c3; color: #a16207; }
      .status-failed { background: #fee2e2; color: #dc2626; }
      .status-refunded { background: #f3e8ff; color: #7c3aed; }
      .status-expired { background: #f1f5f9; color: #64748b; }
    `}</style>
  );
}

export default OrderHistoryPage;
