/**
 * RechargePage — Token Recharge UI
 * Sprint 4: S4-FE-01
 *
 * Allows users to purchase XCT tokens via Stripe or Coinbase Commerce.
 */

import { useState, useCallback } from "react";
import {
  Coins,
  CreditCard,
  Bitcoin,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Gift,
  Clock,
} from "lucide-react";

// Recharge denominations (must match backend orders/index.ts RECHARGE_DENOMINATIONS)
const DENOMINATIONS = [
  {
    id: "xct-100",
    tokens: 120,
    price: 1.0,
    bonus: 20,
    badge: null,
    description: "Starter Pack",
  },
  {
    id: "xct-500",
    tokens: 500,
    price: 5.0,
    bonus: 0,
    badge: null,
    description: "Basic Pack",
  },
  {
    id: "xct-1000",
    tokens: 1100,
    price: 10.0,
    bonus: 100,
    badge: "Best Value",
    description: "Popular",
  },
  {
    id: "xct-2500",
    tokens: 2875,
    price: 25.0,
    bonus: 375,
    badge: "Popular",
    description: "Pro Pack",
  },
  {
    id: "xct-5000",
    tokens: 6000,
    price: 50.0,
    bonus: 1000,
    badge: "Best Value",
    description: "Enterprise Pack",
  },
] as const;

type PaymentProvider = "stripe" | "coinbase";
type CheckoutStatus = "idle" | "loading" | "redirecting" | "success" | "error";

interface CheckoutState {
  status: CheckoutStatus;
  selectedDenomination: (typeof DENOMINATIONS)[number] | null;
  selectedProvider: PaymentProvider | null;
  errorMessage: string | null;
  checkoutUrl: string | null;
}

interface RechargePageProps {
  /** Called to navigate back */
  onBack?: () => void;
  /** Current user ID (from auth) */
  userId?: string;
}

// Mock user balance — in production this comes from IPC
function useBalance() {
  const [balance, setBalance] = useState(1247);
  const [loading, setLoading] = useState(false);

  const refreshBalance = useCallback(async () => {
    setLoading(true);
    // In production: const newBalance = await window.api.getBalance();
    await new Promise((r) => setTimeout(r, 500));
    setBalance((b) => b);
    setLoading(false);
  }, []);

  return { balance, loading, refreshBalance };
}

function RechargePage({ onBack, userId: _userId = "demo-user" }: RechargePageProps): React.JSX.Element {
  const { balance, loading: balanceLoading } = useBalance();
  const [selectedDenomination, setSelectedDenomination] = useState<
    (typeof DENOMINATIONS)[number] | null
  >(null);
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider | null>(null);
  const [checkoutState, setCheckoutState] = useState<CheckoutState>({
    status: "idle",
    selectedDenomination: null,
    selectedProvider: null,
    errorMessage: null,
    checkoutUrl: null,
  });

  const handleSelectDenomination = (denom: (typeof DENOMINATIONS)[number]) => {
    setSelectedDenomination(denom);
    setCheckoutState((s) => ({ ...s, status: "idle", errorMessage: null }));
  };

  const handleProviderSelect = (provider: PaymentProvider) => {
    setSelectedProvider(provider);
  };

  const handleCheckout = useCallback(async () => {
    if (!selectedDenomination || !selectedProvider) return;

    setCheckoutState((s) => ({ ...s, status: "loading" }));

    try {
      // In production, this calls the main process IPC handler
      // which calls createPayment() in src/main/orders/index.ts
      // For now, simulate the flow:
      const mockCheckoutUrl =
        selectedProvider === "stripe"
          ? `https://checkout.stripe.com/pay/demo_${selectedDenomination.id}`
          : `https://commerce.coinbase.com/checkout/demo_${selectedDenomination.id}`;

      // Simulate API call
      await new Promise((r) => setTimeout(r, 1000));

      setCheckoutState({
        status: "redirecting",
        selectedDenomination,
        selectedProvider,
        errorMessage: null,
        checkoutUrl: mockCheckoutUrl,
      });

      // In production: window.open(mockCheckoutUrl, "_blank");
      // Or redirect via window.location
      window.open(mockCheckoutUrl, "_blank");

      // Poll for payment completion (in production via webhook)
      setTimeout(() => {
        setCheckoutState((s) => ({
          ...s,
          status: "success",
          checkoutUrl: null,
        }));
      }, 2000);
    } catch (err) {
      setCheckoutState((s) => ({
        ...s,
        status: "error",
        errorMessage: err instanceof Error ? err.message : "Checkout failed",
      }));
    }
  }, [selectedDenomination, selectedProvider]);

  const handleCloseSuccess = () => {
    setCheckoutState({
      status: "idle",
      selectedDenomination: null,
      selectedProvider: null,
      errorMessage: null,
      checkoutUrl: null,
    });
    setSelectedDenomination(null);
    setSelectedProvider(null);
  };

  return (
    <div className="recharge-page">
      {/* Header */}
      <div className="recharge-header">
        {onBack && (
          <button className="recharge-back-btn" onClick={onBack}>
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="recharge-title">
          <Coins size={24} />
          <h1>Recharge XCT Tokens</h1>
        </div>
        <div className={`recharge-balance ${balanceLoading ? "loading" : ""}`}>
          <span className="balance-label">Balance</span>
          <span className="balance-value">
            {balanceLoading ? <Loader2 size={14} className="spin" /> : balance.toLocaleString()}
          </span>
          <span className="balance-unit">XCT</span>
        </div>
      </div>

      {/* Success State */}
      {checkoutState.status === "success" && (
        <div className="recharge-success">
          <CheckCircle size={64} className="success-icon" />
          <h2>Payment Successful!</h2>
          <p>
            {selectedDenomination
              ? `${selectedDenomination.tokens.toLocaleString()} XCT has been credited to your account.`
              : "Your tokens have been credited."}
          </p>
          <button className="recharge-btn primary" onClick={handleCloseSuccess}>
            Done
          </button>
        </div>
      )}

      {/* Checkout Flow */}
      {checkoutState.status !== "success" && (
        <>
          {/* Denomination Selection */}
          <div className="recharge-section">
            <h2 className="section-title">Select Amount</h2>
            <div className="denomination-grid">
              {DENOMINATIONS.map((denom) => (
                <button
                  key={denom.id}
                  className={`denomination-card ${selectedDenomination?.id === denom.id ? "selected" : ""}`}
                  onClick={() => handleSelectDenomination(denom)}
                >
                  {denom.badge && <span className="denomination-badge">{denom.badge}</span>}
                  <span className="denomination-tokens">{denom.tokens.toLocaleString()}</span>
                  <span className="denomination-label">XCT</span>
                  {denom.bonus > 0 && (
                    <span className="denomination-bonus">
                      <Gift size={10} /> +{denom.bonus} bonus
                    </span>
                  )}
                  <span className="denomination-price">${denom.price.toFixed(2)}</span>
                  <span className="denomination-desc">{denom.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Payment Provider Selection */}
          {selectedDenomination && (
            <div className="recharge-section">
              <h2 className="section-title">Payment Method</h2>
              <div className="provider-grid">
                <button
                  className={`provider-card ${selectedProvider === "stripe" ? "selected" : ""}`}
                  onClick={() => handleProviderSelect("stripe")}
                >
                  <CreditCard size={28} />
                  <span className="provider-name">Credit Card</span>
                  <span className="provider-desc">Stripe</span>
                </button>
                <button
                  className={`provider-card ${selectedProvider === "coinbase" ? "selected" : ""}`}
                  onClick={() => handleProviderSelect("coinbase")}
                >
                  <Bitcoin size={28} />
                  <span className="provider-name">Crypto</span>
                  <span className="provider-desc">Coinbase Commerce</span>
                </button>
              </div>
            </div>
          )}

          {/* Error Display */}
          {checkoutState.status === "error" && checkoutState.errorMessage && (
            <div className="recharge-error">
              <AlertCircle size={18} />
              <span>{checkoutState.errorMessage}</span>
            </div>
          )}

          {/* Checkout Button */}
          {selectedDenomination && selectedProvider && (
            <div className="recharge-checkout">
              <button
                className="recharge-btn primary"
                onClick={handleCheckout}
                disabled={checkoutState.status === "loading" || checkoutState.status === "redirecting"}
              >
                {checkoutState.status === "loading" && <Loader2 size={18} className="spin" />}
                {checkoutState.status === "redirecting" && <Loader2 size={18} className="spin" />}
                {checkoutState.status === "idle" && (
                  <>
                    Pay ${selectedDenomination.price.toFixed(2)} with{" "}
                    {selectedProvider === "stripe" ? "Credit Card" : "Crypto"}
                  </>
                )}
                {(checkoutState.status === "loading" || checkoutState.status === "redirecting") &&
                  "Processing..."}
              </button>

              {checkoutState.status === "redirecting" && (
                <p className="checkout-note">
                  <Clock size={14} />
                  Complete payment in the opened window. This page will update automatically.
                </p>
              )}
            </div>
          )}

          {/* Order Summary */}
          {selectedDenomination && !selectedProvider && (
            <div className="order-summary">
              <div className="summary-row">
                <span>XCT Tokens</span>
                <span>{selectedDenomination.tokens.toLocaleString()}</span>
              </div>
              {selectedDenomination.bonus > 0 && (
                <div className="summary-row bonus">
                  <span>Bonus</span>
                  <span>+{selectedDenomination.bonus.toLocaleString()}</span>
                </div>
              )}
              <div className="summary-row total">
                <span>Total XCT</span>
                <span>
                  {(selectedDenomination.tokens + selectedDenomination.bonus).toLocaleString()}
                </span>
              </div>
              <div className="summary-row">
                <span>Price</span>
                <span className="price">${selectedDenomination.price.toFixed(2)}</span>
              </div>
            </div>
          )}
        </>
      )}

      <style>{`
        .recharge-page {
          padding: 24px;
          max-width: 720px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 32px;
        }
        .recharge-header {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .recharge-back-btn {
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
        .recharge-back-btn:hover {
          background: var(--color-bg-secondary, #f0f0f0);
        }
        .recharge-title {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
          color: var(--color-fg, #333);
        }
        .recharge-title h1 {
          font-size: 24px;
          font-weight: 700;
          margin: 0;
        }
        .recharge-balance {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--color-bg-secondary, #f5f5f5);
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 14px;
        }
        .balance-label { color: var(--color-fg-muted, #888); }
        .balance-value { font-weight: 700; color: var(--color-accent, #0066cc); }
        .balance-unit { color: var(--color-fg-muted, #888); }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .recharge-section { display: flex; flex-direction: column; gap: 16px; }
        .section-title { font-size: 16px; font-weight: 600; margin: 0; color: var(--color-fg, #333); }

        .denomination-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
          gap: 12px;
        }
        .denomination-card {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 16px 12px;
          border: 2px solid var(--color-border, #e0e0e0);
          border-radius: 12px;
          background: var(--color-bg, #fff);
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: center;
        }
        .denomination-card:hover {
          border-color: var(--color-accent, #0066cc);
          transform: translateY(-1px);
        }
        .denomination-card.selected {
          border-color: var(--color-accent, #0066cc);
          background: color-mix(in srgb, var(--color-accent, #0066cc) 8%, white);
        }
        .denomination-badge {
          position: absolute;
          top: -10px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--color-accent, #0066cc);
          color: white;
          font-size: 10px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 10px;
          white-space: nowrap;
        }
        .denomination-tokens { font-size: 20px; font-weight: 800; color: var(--color-fg, #222); }
        .denomination-label { font-size: 11px; color: var(--color-fg-muted, #888); }
        .denomination-bonus {
          display: flex;
          align-items: center;
          gap: 3px;
          font-size: 11px;
          color: var(--color-success, #22c55e);
          font-weight: 600;
        }
        .denomination-price { font-size: 15px; font-weight: 700; color: var(--color-fg, #222); margin-top: 4px; }
        .denomination-desc { font-size: 10px; color: var(--color-fg-muted, #888); }

        .provider-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .provider-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 20px;
          border: 2px solid var(--color-border, #e0e0e0);
          border-radius: 12px;
          background: var(--color-bg, #fff);
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .provider-card:hover {
          border-color: var(--color-accent, #0066cc);
        }
        .provider-card.selected {
          border-color: var(--color-accent, #0066cc);
          background: color-mix(in srgb, var(--color-accent, #0066cc) 8%, white);
        }
        .provider-name { font-size: 15px; font-weight: 700; color: var(--color-fg, #222); }
        .provider-desc { font-size: 12px; color: var(--color-fg-muted, #888); }

        .recharge-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          background: color-mix(in srgb, #ef4444 10%, white);
          border: 1px solid #ef4444;
          border-radius: 8px;
          color: #dc2626;
          font-size: 14px;
        }

        .recharge-checkout {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .checkout-note {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: var(--color-fg-muted, #888);
          margin: 0;
        }

        .order-summary {
          background: var(--color-bg-secondary, #f5f5f5);
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .summary-row {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
          color: var(--color-fg-muted, #888);
        }
        .summary-row.bonus { color: var(--color-success, #22c55e); }
        .summary-row.total {
          font-weight: 700;
          font-size: 16px;
          color: var(--color-fg, #222);
          border-top: 1px solid var(--color-border, #e0e0e0);
          padding-top: 8px;
          margin-top: 4px;
        }
        .summary-row .price { font-weight: 700; color: var(--color-fg, #222); }

        .recharge-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 14px 32px;
          border-radius: 10px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: all 0.15s ease;
          min-width: 240px;
        }
        .recharge-btn.primary {
          background: var(--color-accent, #0066cc);
          color: white;
        }
        .recharge-btn.primary:hover:not(:disabled) {
          opacity: 0.9;
          transform: translateY(-1px);
        }
        .recharge-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .recharge-success {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          padding: 48px 24px;
          text-align: center;
        }
        .success-icon { color: var(--color-success, #22c55e); }
        .recharge-success h2 { margin: 0; font-size: 24px; color: var(--color-fg, #222); }
        .recharge-success p { margin: 0; color: var(--color-fg-muted, #888); font-size: 15px; }
      `}</style>
    </div>
  );
}

export default RechargePage;
