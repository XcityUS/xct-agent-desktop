import { useCallback, useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { useI18n } from "./useI18n";
import { useAuthSession } from "../hooks/useAuthSession";

interface BalanceBadgeProps {
  onClick?: () => void;
  /** Refresh interval in ms (default 60s). */
  pollIntervalMs?: number;
}

export default function BalanceBadge({
  onClick,
  pollIntervalMs = 60_000,
}: BalanceBadgeProps): React.JSX.Element | null {
  const { t } = useI18n();
  const { session } = useAuthSession();
  const [balance, setBalance] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!session.signed_in) {
      setBalance(null);
      return;
    }
    const r = await window.hermesAPI.walletGetBalance();
    if (r.ok) {
      setBalance(r.balance.balance);
    }
  }, [session.signed_in]);

  useEffect(() => {
    refresh();
    if (!session.signed_in) return;
    const id = window.setInterval(refresh, pollIntervalMs);
    return () => window.clearInterval(id);
  }, [refresh, session.signed_in, pollIntervalMs]);

  if (!session.signed_in) return null;

  const Tag: "div" | "button" = onClick ? "button" : "div";
  return (
    <Tag
      className={`balance-badge ${onClick ? "balance-badge-clickable" : ""}`}
      onClick={onClick}
      aria-label="Wallet balance"
    >
      <Coins size={12} />
      <span>
        {balance === null
          ? t("auth.balanceLoading")
          : t("auth.balanceCredits", { count: balance.toLocaleString() })}
      </span>
      <style>{`
        .balance-badge {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 4px 10px; border-radius: 12px;
          background: color-mix(in srgb, var(--color-accent, #0066cc) 10%, white);
          color: var(--color-accent, #0066cc); font-size: 12px; font-weight: 600;
          border: none;
        }
        .balance-badge-clickable { cursor: pointer; }
        .balance-badge-clickable:hover { background: color-mix(in srgb, var(--color-accent, #0066cc) 18%, white); }
      `}</style>
    </Tag>
  );
}
