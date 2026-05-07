import { useCallback, useState } from "react";
import { Mail, Lock, Loader2, AlertCircle } from "lucide-react";
import { useI18n } from "../../components/useI18n";
import { authErrorKey } from "./authError";

interface SignInScreenProps {
  onSignedIn: () => void;
  onGoToSignUp: () => void;
  onGoToForgot: () => void;
  /** If true, show a "Cancel / use without account" link (only when shown
   *  from a manual entry, not as the startup gate). */
  cancelable?: boolean;
  onCancel?: () => void;
  googleEnabled?: boolean;
  /**
   * Show the "Sign in with Xcity" button (OIDC server flow against
   * auth.xcity.one). Defaults true — this is the recommended UX for
   * production sign-ins.
   */
  xcityEnabled?: boolean;
}

export default function SignInScreen({
  onSignedIn,
  onGoToSignUp,
  onGoToForgot,
  cancelable = false,
  onCancel,
  googleEnabled = false,
  xcityEnabled = true,
}: SignInScreenProps): React.JSX.Element {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "password" | "google" | "xcity">(
    null,
  );
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim()) {
        setErrorKey("auth.errorEmailRequired");
        return;
      }
      if (!password) {
        setErrorKey("auth.errorPasswordRequired");
        return;
      }
      setBusy("password");
      setErrorKey(null);
      const r = await window.hermesAPI.authSignIn(email.trim(), password);
      setBusy(null);
      if (r.ok) {
        onSignedIn();
      } else {
        setErrorKey(authErrorKey(r.code));
      }
    },
    [email, password, onSignedIn],
  );

  const onGoogle = useCallback(async () => {
    setBusy("google");
    setErrorKey(null);
    const r = await window.hermesAPI.authStartGoogleOAuth();
    if (!r.ok) {
      setBusy(null);
      setErrorKey(authErrorKey(r.code));
    }
    // On success, the deep-link callback will trigger session-changed and
    // the parent will redirect; keep busy=true until then.
  }, []);

  const onXcity = useCallback(async () => {
    setBusy("xcity");
    setErrorKey(null);
    const r = await window.hermesAPI.authStartXcityOAuth();
    if (!r.ok) {
      setBusy(null);
      setErrorKey(authErrorKey(r.code));
    }
    // Same pattern as Google: success completes via deep-link callback.
  }, []);

  return (
    <div className="auth-screen">
      <h1 className="auth-title">{t("auth.signInTitle")}</h1>
      <p className="auth-subtitle">{t("auth.signInSubtitle")}</p>

      <form className="auth-form" onSubmit={onSubmit}>
        <label className="auth-label">
          <span className="auth-icon"><Mail size={16} /></span>
          <input
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.signInEmail")}
            autoComplete="email"
            disabled={busy !== null}
          />
        </label>

        <label className="auth-label">
          <span className="auth-icon"><Lock size={16} /></span>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.signInPassword")}
            autoComplete="current-password"
            disabled={busy !== null}
          />
        </label>

        {errorKey && (
          <div className="auth-error">
            <AlertCircle size={14} />
            <span>{t(errorKey)}</span>
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary auth-submit"
          disabled={busy !== null}
        >
          {busy === "password" ? (
            <><Loader2 size={14} className="spin" /> {t("auth.signInLoading")}</>
          ) : (
            t("auth.signInSubmit")
          )}
        </button>

        {xcityEnabled && (
          <button
            type="button"
            className="btn btn-secondary auth-xcity"
            onClick={onXcity}
            disabled={busy !== null}
          >
            {busy === "xcity" ? (
              <><Loader2 size={14} className="spin" /> {t("auth.signInXcityLoading")}</>
            ) : (
              t("auth.signInXcity")
            )}
          </button>
        )}

        {googleEnabled && (
          <button
            type="button"
            className="btn btn-secondary auth-google"
            onClick={onGoogle}
            disabled={busy !== null}
          >
            {busy === "google" ? (
              <><Loader2 size={14} className="spin" /> {t("auth.signInGoogleLoading")}</>
            ) : (
              <><GoogleIcon /> {t("auth.signInGoogle")}</>
            )}
          </button>
        )}

        <div className="auth-links">
          <button type="button" className="auth-link" onClick={onGoToForgot}>
            {t("auth.signInForgot")}
          </button>
        </div>

        <div className="auth-footer">
          <span>{t("auth.signInNoAccount")}</span>{" "}
          <button type="button" className="auth-link" onClick={onGoToSignUp}>
            {t("auth.signInCreateAccount")}
          </button>
        </div>

        {cancelable && onCancel && (
          <div className="auth-footer">
            <button type="button" className="auth-link" onClick={onCancel}>
              {t("auth.promptSkip")}
            </button>
          </div>
        )}
      </form>
      <AuthScreenStyles />
    </div>
  );
}

function GoogleIcon(): React.JSX.Element {
  // Multi-color Google "G" rendered inline; no external asset needed.
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 18 18"
      style={{ marginRight: 6 }}
    >
      <path
        fill="#EA4335"
        d="M9 3.48c1.69 0 2.85.73 3.51 1.34l2.57-2.51C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l2.91 2.26C4.6 5.05 6.62 3.48 9 3.48z"
      />
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.74-.06-1.28-.19-1.84H9v3.34h4.96c-.1.83-.64 2.08-1.84 2.92l2.84 2.2c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#FBBC05"
        d="M3.88 10.78A5.54 5.54 0 0 1 3.58 9c0-.62.11-1.22.29-1.78L.96 4.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l2.92-2.26z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.84-2.2c-.76.53-1.78.9-3.12.9-2.38 0-4.4-1.57-5.12-3.74L.97 13.04C2.45 15.98 5.48 18 9 18z"
      />
    </svg>
  );
}

export function AuthScreenStyles(): React.JSX.Element {
  return (
    <style>{`
      .auth-screen { max-width: 380px; margin: 64px auto; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
      .auth-title { font-size: 22px; font-weight: 700; margin: 0; color: var(--color-fg, #222); }
      .auth-subtitle { font-size: 13px; color: var(--color-fg-muted, #666); margin: 0 0 8px 0; }
      .auth-form { display: flex; flex-direction: column; gap: 12px; }
      .auth-label { position: relative; display: flex; align-items: center; }
      .auth-label .input { width: 100%; padding-left: 34px; }
      .auth-icon { position: absolute; left: 10px; color: var(--color-fg-muted, #888); display: flex; align-items: center; pointer-events: none; }
      .auth-submit { padding: 10px; font-weight: 600; }
      .auth-google { padding: 10px; display: flex; align-items: center; justify-content: center; gap: 6px; }
      .auth-error { display: flex; align-items: center; gap: 6px; padding: 8px 10px; background: color-mix(in srgb, #ef4444 10%, white); border: 1px solid #ef4444; border-radius: 6px; color: #dc2626; font-size: 13px; }
      .auth-links { display: flex; justify-content: flex-end; }
      .auth-link { background: none; border: none; color: var(--color-accent, #0066cc); cursor: pointer; padding: 0; font-size: 13px; }
      .auth-link:hover { text-decoration: underline; }
      .auth-footer { font-size: 13px; color: var(--color-fg-muted, #666); text-align: center; }
      .spin { animation: spin 1s linear infinite; }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    `}</style>
  );
}
