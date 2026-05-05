import { useEffect, useState } from "react";
import { LogIn, UserPlus, X } from "lucide-react";
import { useI18n } from "./useI18n";
import { useAuthSession } from "../hooks/useAuthSession";

// In-memory flag — resets on app restart, NOT persisted. Per the plan,
// every launch shows the prompt once until the user dismisses it.
let _promptShownThisLaunch = false;

interface LoginPromptModalProps {
  /** Called when the user clicks Sign in or Create account.
   *  Receives the desired starting mode for the auth flow. */
  onChooseAuth: (mode: "signin" | "signup") => void;
}

export default function LoginPromptModal({
  onChooseAuth,
}: LoginPromptModalProps): React.JSX.Element | null {
  const { t } = useI18n();
  const { session, loading } = useAuthSession();
  const [dismissed, setDismissed] = useState(_promptShownThisLaunch);

  // After session loads, decide whether to show.
  useEffect(() => {
    if (loading) return;
    if (session.signed_in) return;
    if (_promptShownThisLaunch) return;
    _promptShownThisLaunch = true;
  }, [loading, session.signed_in]);

  if (loading || session.signed_in || dismissed) return null;

  const close = (): void => {
    setDismissed(true);
  };

  return (
    <div className="login-prompt-overlay">
      <div className="login-prompt-card" role="dialog" aria-modal="true">
        <button
          className="login-prompt-close"
          aria-label="Close"
          onClick={close}
        >
          <X size={18} />
        </button>
        <h2 className="login-prompt-title">{t("auth.promptTitle")}</h2>
        <p className="login-prompt-body">{t("auth.promptBody")}</p>
        <div className="login-prompt-actions">
          <button
            className="btn btn-primary"
            onClick={() => onChooseAuth("signin")}
          >
            <LogIn size={14} style={{ marginRight: 6 }} />
            {t("auth.promptSignIn")}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => onChooseAuth("signup")}
          >
            <UserPlus size={14} style={{ marginRight: 6 }} />
            {t("auth.promptSignUp")}
          </button>
        </div>
        <button className="login-prompt-skip" onClick={close}>
          {t("auth.promptSkip")}
        </button>
      </div>
      <style>{`
        .login-prompt-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 9999;
          display: flex; align-items: center; justify-content: center;
          backdrop-filter: blur(2px);
        }
        .login-prompt-card {
          background: var(--color-bg, #fff); border-radius: 12px; padding: 28px;
          max-width: 400px; width: calc(100% - 32px);
          box-shadow: 0 12px 40px rgba(0,0,0,0.18); position: relative;
          display: flex; flex-direction: column; gap: 14px;
        }
        .login-prompt-close {
          position: absolute; top: 8px; right: 8px;
          background: none; border: none; cursor: pointer;
          color: var(--color-fg-muted, #888); padding: 6px; border-radius: 4px;
        }
        .login-prompt-close:hover { background: var(--color-bg-secondary, #f0f0f0); }
        .login-prompt-title { margin: 0; font-size: 20px; font-weight: 700; color: var(--color-fg, #222); }
        .login-prompt-body { margin: 0; font-size: 14px; color: var(--color-fg-muted, #666); line-height: 1.5; }
        .login-prompt-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
        .login-prompt-actions .btn { width: 100%; padding: 10px; display: flex; align-items: center; justify-content: center; }
        .login-prompt-skip {
          background: none; border: none; cursor: pointer; padding: 8px 0;
          color: var(--color-fg-muted, #888); font-size: 13px;
        }
        .login-prompt-skip:hover { color: var(--color-fg, #333); }
      `}</style>
    </div>
  );
}

// Tests-only — reset the launch flag.
export function _resetLoginPromptFlag(): void {
  _promptShownThisLaunch = false;
}
