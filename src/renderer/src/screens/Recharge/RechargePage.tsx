/**
 * RechargePage — credit pack purchase via the central wallet service.
 *
 * Money state lives at https://wallet.xcity.one. This page is a thin client
 * that calls the main process IPC bridge (`window.hermesAPI.wallet.*`) which
 * in turn talks to the wallet HTTP API. No Stripe / Coinbase keys ship in
 * the desktop binary anymore.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Bitcoin,
  CheckCircle,
  Clock,
  Coins,
  CreditCard,
  Gift,
  Loader2,
  Wallet,
} from "lucide-react";

const PACKS = [
  { id: "pack_5", amountUsd: 5, credits: 5_000, bonus: 0 },
  {
    id: "pack_15",
    amountUsd: 15,
    credits: 15_000,
    bonus: 750,
    badge: "Popular",
  },
  {
    id: "pack_25",
    amountUsd: 25,
    credits: 25_000,
    bonus: 2_500,
    badge: "Best Value",
  },
  { id: "pack_50", amountUsd: 50, credits: 50_000, bonus: 7_500 },
  { id: "pack_100", amountUsd: 100, credits: 100_000, bonus: 15_000 },
] as const;

type Pack = (typeof PACKS)[number];

type PaymentMethod = "card" | "alipay" | "wechat_pay" | "crypto";

type Status = "idle" | "loading" | "redirected" | "error";

interface RechargePageProps {
  onBack?: () => void;
}

const PAYMENT_LABEL: Record<
  PaymentMethod,
  { label: string; sub: string; icon: React.ComponentType<{ size?: number }> }
> = {
  card: { label: "Credit Card", sub: "Stripe", icon: CreditCard },
  alipay: { label: "Alipay", sub: "Stripe", icon: CreditCard },
  wechat_pay: { label: "WeChat Pay", sub: "Stripe", icon: CreditCard },
  crypto: { label: "Crypto", sub: "Coinbase Commerce", icon: Bitcoin },
};

function RechargePage({ onBack }: RechargePageProps): React.JSX.Element {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [pack, setPack] = useState<Pack | null>(null);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const refreshBalance = useCallback(async () => {
    setBalanceLoading(true);
    try {
      const isConn = await window.hermesAPI.walletIsConnected();
      setConnected(isConn);
      if (!isConn) {
        setBalance(null);
        return;
      }
      const res = await window.hermesAPI.walletGetBalance();
      if (res.ok) {
        setBalance(res.balance.balance);
      } else if (res.error === "wallet_not_connected") {
        setConnected(false);
        setBalance(null);
      } else {
        setError(res.error);
      }
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshBalance();
  }, [refreshBalance]);

  const handleCheckout = useCallback(async () => {
    if (!pack || !method) return;
    setStatus("loading");
    setError(null);
    const res = await window.hermesAPI.walletCreateCheckout({
      pack_id: pack.id,
      payment_method: method,
    });
    if (!res.ok) {
      setStatus("error");
      setError(
        res.error === "wallet_not_connected"
          ? "Connect your Xcity wallet in Settings first."
          : res.error,
      );
      return;
    }
    const opened = await window.hermesAPI.walletOpenCheckout(res.session.url);
    if (!opened.ok) {
      setStatus("error");
      setError(opened.error);
      return;
    }
    setStatus("redirected");
  }, [pack, method]);

  if (connected === false) {
    return (
      <div className="recharge-page">
        <div className="recharge-header">
          {onBack && (
            <button className="recharge-back-btn" onClick={onBack}>
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="recharge-title">
            <Coins size={24} />
            <h1>Add Credits</h1>
          </div>
        </div>
        <div className="recharge-disconnected">
          <Wallet size={48} />
          <h2>Wallet not connected</h2>
          <p>
            Paste your Xcity access token in Settings → Wallet to enable
            recharge, balance, and order history.
          </p>
        </div>
        <Styles />
      </div>
    );
  }

  return (
    <div className="recharge-page">
      <div className="recharge-header">
        {onBack && (
          <button className="recharge-back-btn" onClick={onBack}>
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="recharge-title">
          <Coins size={24} />
          <h1>Add Credits</h1>
        </div>
        <div className={`recharge-balance ${balanceLoading ? "loading" : ""}`}>
          <span className="balance-label">Balance</span>
          <span className="balance-value">
            {balanceLoading || balance === null ? (
              <Loader2 size={14} className="spin" />
            ) : (
              balance.toLocaleString()
            )}
          </span>
          <span className="balance-unit">credits</span>
        </div>
      </div>

      {status === "redirected" ? (
        <div className="recharge-success">
          <CheckCircle size={64} className="success-icon" />
          <h2>Checkout opened in browser</h2>
          <p>
            Complete payment there. Your balance will update once the webhook
            clears.
          </p>
          <button
            className="recharge-btn primary"
            onClick={() => {
              setStatus("idle");
              setPack(null);
              setMethod(null);
              refreshBalance();
            }}
          >
            Done
          </button>
        </div>
      ) : (
        <>
          <section className="recharge-section">
            <h2 className="section-title">Select pack</h2>
            <div className="denomination-grid">
              {PACKS.map((p) => (
                <button
                  key={p.id}
                  className={`denomination-card ${pack?.id === p.id ? "selected" : ""}`}
                  onClick={() => {
                    setPack(p);
                    setStatus("idle");
                    setError(null);
                  }}
                >
                  {"badge" in p && p.badge && (
                    <span className="denomination-badge">{p.badge}</span>
                  )}
                  <span className="denomination-tokens">
                    {(p.credits + p.bonus).toLocaleString()}
                  </span>
                  <span className="denomination-label">credits</span>
                  {p.bonus > 0 && (
                    <span className="denomination-bonus">
                      <Gift size={10} /> +{p.bonus.toLocaleString()} bonus
                    </span>
                  )}
                  <span className="denomination-price">${p.amountUsd}</span>
                </button>
              ))}
            </div>
          </section>

          {pack && (
            <section className="recharge-section">
              <h2 className="section-title">Payment method</h2>
              <div className="provider-grid">
                {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => {
                  const Icon = PAYMENT_LABEL[m].icon;
                  return (
                    <button
                      key={m}
                      className={`provider-card ${method === m ? "selected" : ""}`}
                      onClick={() => setMethod(m)}
                    >
                      <Icon size={24} />
                      <span className="provider-name">
                        {PAYMENT_LABEL[m].label}
                      </span>
                      <span className="provider-desc">
                        {PAYMENT_LABEL[m].sub}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {error && (
            <div className="recharge-error">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {pack && method && (
            <div className="recharge-checkout">
              <button
                className="recharge-btn primary"
                onClick={handleCheckout}
                disabled={status === "loading"}
              >
                {status === "loading" ? (
                  <>
                    <Loader2 size={18} className="spin" /> Opening checkout…
                  </>
                ) : (
                  <>
                    Pay ${pack.amountUsd} with {PAYMENT_LABEL[method].label}
                  </>
                )}
              </button>
              <p className="checkout-note">
                <Clock size={14} />
                Checkout opens in your browser. Credits land via webhook within
                seconds.
              </p>
            </div>
          )}
        </>
      )}
      <Styles />
    </div>
  );
}

function Styles(): React.JSX.Element {
  return (
    <style>{`
      .recharge-page { padding: 24px; max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: 32px; }
      .recharge-header { display: flex; align-items: center; gap: 16px; }
      .recharge-back-btn { background: none; border: none; cursor: pointer; padding: 8px; border-radius: 8px; color: var(--color-fg-muted, #888); display: flex; }
      .recharge-back-btn:hover { background: var(--color-bg-secondary, #f0f0f0); }
      .recharge-title { display: flex; align-items: center; gap: 12px; flex: 1; color: var(--color-fg, #333); }
      .recharge-title h1 { font-size: 24px; font-weight: 700; margin: 0; }
      .recharge-balance { display: flex; align-items: center; gap: 6px; background: var(--color-bg-secondary, #f5f5f5); padding: 8px 16px; border-radius: 20px; font-size: 14px; }
      .balance-label { color: var(--color-fg-muted, #888); }
      .balance-value { font-weight: 700; color: var(--color-accent, #0066cc); }
      .balance-unit { color: var(--color-fg-muted, #888); }
      .spin { animation: spin 1s linear infinite; }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      .recharge-section { display: flex; flex-direction: column; gap: 16px; }
      .section-title { font-size: 16px; font-weight: 600; margin: 0; color: var(--color-fg, #333); }
      .denomination-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
      .denomination-card { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 16px 12px; border: 2px solid var(--color-border, #e0e0e0); border-radius: 12px; background: var(--color-bg, #fff); cursor: pointer; transition: all 0.15s ease; text-align: center; }
      .denomination-card:hover { border-color: var(--color-accent, #0066cc); transform: translateY(-1px); }
      .denomination-card.selected { border-color: var(--color-accent, #0066cc); background: color-mix(in srgb, var(--color-accent, #0066cc) 8%, white); }
      .denomination-badge { position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: var(--color-accent, #0066cc); color: white; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px; white-space: nowrap; }
      .denomination-tokens { font-size: 20px; font-weight: 800; color: var(--color-fg, #222); }
      .denomination-label { font-size: 11px; color: var(--color-fg-muted, #888); }
      .denomination-bonus { display: flex; align-items: center; gap: 3px; font-size: 11px; color: var(--color-success, #22c55e); font-weight: 600; }
      .denomination-price { font-size: 15px; font-weight: 700; color: var(--color-fg, #222); margin-top: 4px; }
      .provider-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
      .provider-card { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 18px; border: 2px solid var(--color-border, #e0e0e0); border-radius: 12px; background: var(--color-bg, #fff); cursor: pointer; transition: all 0.15s ease; }
      .provider-card:hover { border-color: var(--color-accent, #0066cc); }
      .provider-card.selected { border-color: var(--color-accent, #0066cc); background: color-mix(in srgb, var(--color-accent, #0066cc) 8%, white); }
      .provider-name { font-size: 14px; font-weight: 700; color: var(--color-fg, #222); }
      .provider-desc { font-size: 11px; color: var(--color-fg-muted, #888); }
      .recharge-error { display: flex; align-items: center; gap: 8px; padding: 12px 16px; background: color-mix(in srgb, #ef4444 10%, white); border: 1px solid #ef4444; border-radius: 8px; color: #dc2626; font-size: 14px; }
      .recharge-checkout { display: flex; flex-direction: column; align-items: center; gap: 12px; }
      .checkout-note { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--color-fg-muted, #888); margin: 0; }
      .recharge-btn { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 32px; border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer; border: none; transition: all 0.15s ease; min-width: 240px; }
      .recharge-btn.primary { background: var(--color-accent, #0066cc); color: white; }
      .recharge-btn.primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
      .recharge-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      .recharge-success { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 48px 24px; text-align: center; }
      .success-icon { color: var(--color-success, #22c55e); }
      .recharge-success h2 { margin: 0; font-size: 24px; color: var(--color-fg, #222); }
      .recharge-success p { margin: 0; color: var(--color-fg-muted, #888); font-size: 15px; }
      .recharge-disconnected { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 64px 24px; text-align: center; color: var(--color-fg-muted, #888); }
      .recharge-disconnected h2 { margin: 0; font-size: 22px; color: var(--color-fg, #222); }
      .recharge-disconnected p { margin: 0; max-width: 420px; }
    `}</style>
  );
}

export default RechargePage;
