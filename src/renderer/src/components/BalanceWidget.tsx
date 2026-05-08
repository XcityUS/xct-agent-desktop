import { useState, useEffect, useRef } from "react";
import {
  Coins,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  X,
  Plus,
  History,
} from "lucide-react";
import TokenDetail, { TokenUsageEntry } from "./TokenDetail";

export interface BalanceWidgetProps {
  /** Called when widget is dismissed */
  onDismiss?: () => void;
  /** Whether to show the dismiss button */
  showDismiss?: boolean;
  /** Called when user clicks recharge */
  onRecharge?: () => void;
}

interface SessionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
}

interface HistoryEntry {
  id: string;
  type: "deduction" | "recharge";
  amount: number;
  description: string;
  timestamp: number;
}

function BalanceWidget({
  onDismiss,
  showDismiss = false,
  onRecharge,
}: BalanceWidgetProps): React.JSX.Element {
  // Mock/demo balance - in production this would come from a real API
  // The actual balance would be fetched via IPC from the main process
  const [balance, setBalance] = useState<number>(0);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [sessionUsage, setSessionUsage] = useState<SessionUsage | null>(null);
  const [usageEntries, setUsageEntries] = useState<TokenUsageEntry[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [lowBalance, setLowBalance] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [balanceAnimating, setBalanceAnimating] = useState(false);
  const sessionStartRef = useRef<SessionUsage | null>(null);

  // Mock history - in production this would come from actual transaction records
  const [historyEntries] = useState<HistoryEntry[]>([
    {
      id: "1",
      type: "deduction",
      amount: 2.5,
      description: "GPT-4 Turbo - 12,500 tokens",
      timestamp: Date.now() - 3600000,
    },
    {
      id: "2",
      type: "deduction",
      amount: 1.2,
      description: "Claude 3 Sonnet - 8,200 tokens",
      timestamp: Date.now() - 7200000,
    },
    {
      id: "3",
      type: "recharge",
      amount: 100.0,
      description: "Top up - XCT Pack",
      timestamp: Date.now() - 86400000,
    },
    {
      id: "4",
      type: "deduction",
      amount: 3.8,
      description: "GPT-4 Turbo - 18,400 tokens",
      timestamp: Date.now() - 172800000,
    },
  ]);

  // Fetch balance on mount (mock implementation)
  // In production, this would call window.desktopApi.cloud.getBalance()
  useEffect(() => {
    async function fetchBalance(): Promise<void> {
      try {
        // Mock balance for demo - in production use actual API
        // For now, simulate with a reasonable demo value
        const mockBalance = 250.0; // XCT tokens
        setBalance(mockBalance);
        setLowBalance(mockBalance < 100);
        setBalanceLoading(false);
      } catch {
        setBalance(0);
        setLowBalance(true);
        setBalanceLoading(false);
      }
    }
    fetchBalance();
  }, []);

  // Animate balance when it changes
  useEffect(() => {
    if (balanceLoading) return;
    setBalanceAnimating(true);
    const timer = setTimeout(() => setBalanceAnimating(false), 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balance]);

  // Track chat usage via IPC
  useEffect(() => {
    const cleanup = window.hermesAPI.onChatUsage((usage) => {
      const entry: TokenUsageEntry = {
        model: "current", // Would be populated from actual usage data
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        cost: usage.cost,
        timestamp: Date.now(),
      };

      setUsageEntries((prev) => [...prev, entry]);

      setSessionUsage(() => {
        const base = sessionStartRef.current ?? {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cost: 0,
        };
        const updated = {
          promptTokens: base.promptTokens + usage.promptTokens,
          completionTokens: base.completionTokens + usage.completionTokens,
          totalTokens: base.totalTokens + usage.totalTokens,
          cost: usage.cost != null ? (base.cost ?? 0) + usage.cost : base.cost,
        };
        if (!sessionStartRef.current) {
          sessionStartRef.current = { ...updated };
        }
        return updated;
      });
    });

    return cleanup;
  }, []);

  const formatCost = (cost?: number): string => {
    if (cost == null || cost === 0) return "$0.0000";
    return `$${cost.toFixed(4)}`;
  };

  const formatTimeAgo = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "Just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const handleRecharge = (): void => {
    if (onRecharge) {
      onRecharge();
    } else {
      // Default: open recharge modal or page
      // TODO: open recharge modal
    }
  };

  return (
    <div
      className={`balance-widget ${lowBalance ? "balance-widget--low" : ""}`}
    >
      <div className="balance-widget-main">
        <div className="balance-widget-balance">
          <Coins size={14} className="balance-widget-icon" />
          {balanceLoading ? (
            <span className="balance-widget-loading">Loading...</span>
          ) : (
            <>
              <span
                className={`balance-widget-value ${balanceAnimating ? "balance-widget-value--animating" : ""}`}
              >
                {balance.toFixed(2)}
              </span>
              <span className="balance-widget-unit">XCT</span>
            </>
          )}
          {lowBalance && !balanceLoading && (
            <span title="Low balance warning">
              <AlertTriangle size={14} className="balance-widget-warning" />
            </span>
          )}
        </div>

        {sessionUsage && (
          <div className="balance-widget-session">
            <span className="balance-widget-session-label">Session:</span>
            <span className="balance-widget-session-tokens">
              {sessionUsage.totalTokens.toLocaleString()} tokens
            </span>
            {sessionUsage.cost != null && sessionUsage.cost > 0 && (
              <span className="balance-widget-session-cost">
                {formatCost(sessionUsage.cost)}
              </span>
            )}
          </div>
        )}

        <div className="balance-widget-actions">
          {/* Recharge button */}
          <button
            className="balance-widget-recharge-btn"
            onClick={handleRecharge}
            title="Top up balance"
          >
            <Plus size={14} />
            <span>Top Up</span>
          </button>

          {/* History toggle */}
          <button
            className={`balance-widget-history-btn ${historyExpanded ? "active" : ""}`}
            onClick={() => setHistoryExpanded((e) => !e)}
            title={historyExpanded ? "Hide history" : "Show history"}
          >
            <History size={14} />
          </button>

          {sessionUsage && (
            <button
              className="balance-widget-expand-btn"
              onClick={() => setExpanded((e) => !e)}
              title={expanded ? "Collapse details" : "Show details"}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
          {showDismiss && onDismiss && (
            <button
              className="balance-widget-dismiss-btn"
              onClick={onDismiss}
              title="Dismiss"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* History Panel */}
      {historyExpanded && (
        <div className="balance-widget-history">
          <div className="balance-widget-history-header">
            <History size={12} />
            <span>Recent Transactions</span>
          </div>
          <div className="balance-widget-history-list">
            {historyEntries.slice(0, 5).map((entry) => (
              <div
                key={entry.id}
                className={`balance-widget-history-item balance-widget-history-item--${entry.type}`}
              >
                <div className="balance-widget-history-item-icon">
                  {entry.type === "recharge" ? (
                    <Plus size={12} />
                  ) : (
                    <Coins size={12} />
                  )}
                </div>
                <div className="balance-widget-history-item-content">
                  <span className="balance-widget-history-item-desc">
                    {entry.description}
                  </span>
                  <span className="balance-widget-history-item-time">
                    {formatTimeAgo(entry.timestamp)}
                  </span>
                </div>
                <div
                  className={`balance-widget-history-item-amount ${entry.type === "recharge" ? "positive" : "negative"}`}
                >
                  {entry.type === "recharge" ? "+" : "-"}
                  {entry.amount.toFixed(2)} XCT
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {expanded && (
        <div className="balance-widget-detail">
          <TokenDetail
            entries={usageEntries}
            expanded={true}
            onToggle={() => setExpanded(false)}
          />
        </div>
      )}

      {lowBalance && !balanceLoading && (
        <div className="balance-widget-low-banner">
          <AlertTriangle size={12} />
          <span>Low balance — consider topping up</span>
        </div>
      )}
    </div>
  );
}

export default BalanceWidget;
