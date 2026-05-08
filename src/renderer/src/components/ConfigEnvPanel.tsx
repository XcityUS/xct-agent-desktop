/**
 * ConfigEnvPanel — Environment Switcher Component
 * Sprint 4: S4-FE-03
 *
 * Provides a UI for switching between dev/staging/prod environments
 * and managing API keys per environment.
 */

import { useState, useCallback } from "react";
import {
  Globe,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  RefreshCw,
  Server,
  Key,
  Shield,
} from "lucide-react";

export type Env = "development" | "staging" | "production";

interface EnvConfig {
  label: string;
  description: string;
  color: string;
  stripeKey: string;
  coinbaseKey: string;
  apiUrl: string;
}

const ENV_PANELS: Record<Env, EnvConfig> = {
  development: {
    label: "Development",
    description: "Local development environment with test payment gateways",
    color: "#22c55e",
    stripeKey: "sk_test_",
    coinbaseKey: "",
    apiUrl: "http://localhost:3001",
  },
  staging: {
    label: "Staging",
    description: "Pre-production testing environment",
    color: "#f59e0b",
    stripeKey: "sk_test_",
    coinbaseKey: "",
    apiUrl: "https://staging-api.xct.us",
  },
  production: {
    label: "Production",
    description: "Live production environment with real payments",
    color: "#ef4444",
    stripeKey: "sk_live_",
    coinbaseKey: "",
    apiUrl: "https://api.xct.us",
  },
};

interface ConfigEnvPanelProps {
  /** Current active environment (from config) */
  activeEnv?: Env;
  /** Called when user switches environment */
  onEnvChange?: (env: Env) => void;
  /** Called when user saves API keys */
  onSaveKeys?: (
    env: Env,
    stripeKey: string,
    coinbaseKey: string,
  ) => Promise<void>;
}

function MaskedValue({
  value,
  prefix,
}: {
  value: string;
  prefix: string;
}): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  if (!value) return <span className="env-value-empty">Not configured</span>;
  if (visible) {
    return (
      <span className="env-value-masked">
        <code>{value}</code>
        <button
          className="env-icon-btn"
          onClick={() => setVisible(false)}
          title="Hide"
        >
          <EyeOff size={13} />
        </button>
      </span>
    );
  }
  return (
    <span className="env-value-masked">
      <code>
        {prefix}
        {"•".repeat(Math.max(8, value.length - prefix.length - 4))}
      </code>
      <button
        className="env-icon-btn"
        onClick={() => setVisible(true)}
        title="Show"
      >
        <Eye size={13} />
      </button>
    </span>
  );
}

function ConfigEnvPanel({
  activeEnv = "development",
  onEnvChange,
  onSaveKeys,
}: ConfigEnvPanelProps): React.JSX.Element {
  const [selectedEnv, setSelectedEnv] = useState<Env>(activeEnv);
  const [editingKeys, setEditingKeys] = useState(false);
  const [stripeKeyDraft, setStripeKeyDraft] = useState("");
  const [coinbaseKeyDraft, setCoinbaseKeyDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  const panel = ENV_PANELS[selectedEnv];

  const handleEnvSelect = (env: Env): void => {
    setSelectedEnv(env);
    setEditingKeys(false);
    setSaveResult(null);
    if (env !== activeEnv) {
      onEnvChange?.(env);
    }
  };

  const handleEditKeys = (): void => {
    setStripeKeyDraft(ENV_PANELS[selectedEnv].stripeKey || "");
    setCoinbaseKeyDraft(ENV_PANELS[selectedEnv].coinbaseKey || "");
    setEditingKeys(true);
    setSaveResult(null);
  };

  const handleSaveKeys = useCallback(async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      await onSaveKeys?.(selectedEnv, stripeKeyDraft, coinbaseKeyDraft);
      setSaveResult({ success: true, message: "API keys saved successfully." });
      setEditingKeys(false);
    } catch (err) {
      setSaveResult({
        success: false,
        message: err instanceof Error ? err.message : "Failed to save keys.",
      });
    } finally {
      setSaving(false);
    }
  }, [selectedEnv, stripeKeyDraft, coinbaseKeyDraft, onSaveKeys]);

  const handleTestConnection = async (): Promise<void> => {
    setTesting(true);
    // In production: test connectivity to the env's API URL
    await new Promise((r) => setTimeout(r, 800));
    setTesting(false);
  };

  return (
    <div className="config-env-panel">
      <div className="config-env-header">
        <Globe size={18} />
        <span>Environment Configuration</span>
      </div>

      {/* Environment Selector */}
      <div className="env-selector">
        {(Object.keys(ENV_PANELS) as Env[]).map((env) => {
          const cfg = ENV_PANELS[env];
          const isActive = env === activeEnv;
          const isSelected = env === selectedEnv;
          return (
            <button
              key={env}
              className={`env-tab ${isSelected ? "selected" : ""} ${isActive ? "active" : ""}`}
              onClick={() => handleEnvSelect(env)}
              style={{ "--env-color": cfg.color } as React.CSSProperties}
            >
              <span
                className="env-indicator"
                style={{ background: cfg.color }}
              />
              <span className="env-tab-label">{cfg.label}</span>
              {isActive && <Check size={12} className="env-active-check" />}
            </button>
          );
        })}
      </div>

      {/* Environment Details */}
      <div className="env-detail">
        <div className="env-detail-header">
          <div>
            <h3 className="env-detail-title">{panel.label}</h3>
            <p className="env-detail-desc">{panel.description}</p>
          </div>
          <span className="env-badge" style={{ background: panel.color }}>
            {activeEnv === selectedEnv ? "Active" : "Inactive"}
          </span>
        </div>

        {/* Connection Info */}
        <div className="env-info-grid">
          <div className="env-info-item">
            <Server size={14} />
            <span className="env-info-label">API URL</span>
            <code className="env-info-value">{panel.apiUrl}</code>
          </div>
        </div>

        {/* API Keys Section */}
        <div className="env-keys-section">
          <div className="env-keys-header">
            <div className="env-keys-title">
              <Key size={14} />
              <span>API Keys</span>
            </div>
            {!editingKeys && (
              <button className="env-edit-btn" onClick={handleEditKeys}>
                Edit Keys
              </button>
            )}
          </div>

          {editingKeys ? (
            <div className="env-keys-form">
              <div className="env-key-field">
                <label>Stripe Secret Key</label>
                <input
                  type="password"
                  value={stripeKeyDraft}
                  onChange={(e) => setStripeKeyDraft(e.target.value)}
                  placeholder="sk_test_..."
                  autoComplete="off"
                />
              </div>
              <div className="env-key-field">
                <label>Coinbase Commerce API Key</label>
                <input
                  type="password"
                  value={coinbaseKeyDraft}
                  onChange={(e) => setCoinbaseKeyDraft(e.target.value)}
                  placeholder="..."
                  autoComplete="off"
                />
              </div>
              <div className="env-keys-actions">
                <button
                  className="env-cancel-btn"
                  onClick={() => setEditingKeys(false)}
                >
                  Cancel
                </button>
                <button
                  className="env-save-btn"
                  onClick={handleSaveKeys}
                  disabled={saving}
                >
                  {saving ? (
                    <RefreshCw size={14} className="spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  {saving ? "Saving..." : "Save Keys"}
                </button>
              </div>
            </div>
          ) : (
            <div className="env-keys-display">
              <div className="env-key-row">
                <span className="env-key-label">Stripe</span>
                <MaskedValue value={panel.stripeKey} prefix="sk_test_" />
              </div>
              <div className="env-key-row">
                <span className="env-key-label">Coinbase</span>
                <MaskedValue value={panel.coinbaseKey} prefix="" />
              </div>
            </div>
          )}

          {saveResult && (
            <div
              className={`env-save-result ${saveResult.success ? "success" : "error"}`}
            >
              {saveResult.success ? (
                <Check size={14} />
              ) : (
                <AlertCircle size={14} />
              )}
              <span>{saveResult.message}</span>
            </div>
          )}
        </div>

        {/* Test Connection */}
        <div className="env-test-section">
          <button
            className="env-test-btn"
            onClick={handleTestConnection}
            disabled={testing}
          >
            {testing ? (
              <>
                <RefreshCw size={14} className="spin" />
                Testing...
              </>
            ) : (
              <>
                <Shield size={14} />
                Test Connection
              </>
            )}
          </button>
          {activeEnv !== selectedEnv && (
            <button
              className="env-activate-btn"
              onClick={() => onEnvChange?.(selectedEnv)}
            >
              Activate {panel.label}
            </button>
          )}
        </div>
      </div>

      <style>{`
        .config-env-panel {
          border: 1px solid var(--color-border, #e0e0e0);
          border-radius: 12px;
          overflow: hidden;
          background: var(--color-bg, #fff);
        }
        .config-env-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          background: var(--color-bg-secondary, #f5f5f5);
          border-bottom: 1px solid var(--color-border, #e0e0e0);
          font-size: 13px;
          font-weight: 600;
          color: var(--color-fg, #333);
        }
        .env-selector {
          display: flex;
          border-bottom: 1px solid var(--color-border, #e0e0e0);
        }
        .env-tab {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px 8px;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          font-size: 13px;
          color: var(--color-fg-muted, #888);
          transition: all 0.15s;
        }
        .env-tab:hover { color: var(--color-fg, #222); background: var(--color-bg-secondary, #f5f5f5); }
        .env-tab.selected { color: var(--color-fg, #222); border-bottom-color: var(--env-color, #0066cc); }
        .env-tab.active { color: var(--color-fg, #222); }
        .env-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .env-tab-label { font-weight: 500; }
        .env-active-check { color: var(--color-success, #22c55e); }

        .env-detail { padding: 16px; display: flex; flex-direction: column; gap: 16px; }
        .env-detail-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .env-detail-title { font-size: 16px; font-weight: 700; margin: 0; color: var(--color-fg, #222); }
        .env-detail-desc { font-size: 12px; color: var(--color-fg-muted, #888); margin: 4px 0 0; }
        .env-badge {
          padding: 2px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 700;
          color: white;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .env-badge[style*="22c55e"] { background: #22c55e; }
        .env-badge[style*="f59e0b"] { background: #f59e0b; }
        .env-badge[style*="ef4444"] { background: #ef4444; }

        .env-info-grid { display: flex; flex-direction: column; gap: 6px; }
        .env-info-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: var(--color-fg-muted, #888);
        }
        .env-info-label { min-width: 60px; }
        .env-info-value { color: var(--color-fg, #222); font-size: 12px; }

        .env-keys-section {
          background: var(--color-bg-secondary, #f5f5f5);
          border-radius: 8px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .env-keys-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .env-keys-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 600;
          color: var(--color-fg, #333);
        }
        .env-edit-btn {
          font-size: 12px;
          color: var(--color-accent, #0066cc);
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
        }
        .env-edit-btn:hover { text-decoration: underline; }
        .env-keys-form { display: flex; flex-direction: column; gap: 8px; }
        .env-key-field { display: flex; flex-direction: column; gap: 4px; }
        .env-key-field label { font-size: 11px; color: var(--color-fg-muted, #888); font-weight: 500; }
        .env-key-field input {
          padding: 8px 10px;
          border: 1px solid var(--color-border, #e0e0e0);
          border-radius: 6px;
          font-size: 13px;
          font-family: monospace;
          background: var(--color-bg, #fff);
          color: var(--color-fg, #222);
        }
        .env-keys-actions { display: flex; gap: 8px; justify-content: flex-end; }
        .env-cancel-btn {
          padding: 6px 14px;
          border-radius: 6px;
          border: 1px solid var(--color-border, #e0e0e0);
          background: none;
          font-size: 13px;
          cursor: pointer;
          color: var(--color-fg-muted, #888);
        }
        .env-save-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 6px;
          border: none;
          background: var(--color-accent, #0066cc);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          color: white;
        }
        .env-save-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .env-keys-display { display: flex; flex-direction: column; gap: 6px; }
        .env-key-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
        }
        .env-key-label { min-width: 60px; color: var(--color-fg-muted, #888); }
        .env-value-masked {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .env-value-masked code {
          font-family: monospace;
          font-size: 12px;
          color: var(--color-fg, #222);
        }
        .env-value-empty { font-size: 12px; color: var(--color-fg-muted, #888); }
        .env-icon-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 2px;
          color: var(--color-fg-muted, #888);
          display: flex;
          align-items: center;
        }
        .env-icon-btn:hover { color: var(--color-accent, #0066cc); }

        .env-save-result {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 12px;
        }
        .env-save-result.success { background: #dcfce7; color: #16a34a; }
        .env-save-result.error { background: #fee2e2; color: #dc2626; }

        .env-test-section {
          display: flex;
          gap: 8px;
        }
        .env-test-btn, .env-activate-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          transition: all 0.15s;
        }
        .env-test-btn {
          background: var(--color-bg-secondary, #f0f0f0);
          color: var(--color-fg, #333);
          border: 1px solid var(--color-border, #e0e0e0);
        }
        .env-test-btn:hover:not(:disabled) { background: var(--color-bg, #e8e8e8); }
        .env-activate-btn {
          background: var(--color-accent, #0066cc);
          color: white;
        }
        .env-activate-btn:hover { opacity: 0.9; }
        .env-test-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default ConfigEnvPanel;
