import { useCallback, useState } from "react";
import { Mail, Loader2, AlertCircle, CheckCircle, ArrowLeft } from "lucide-react";
import { useI18n } from "../../components/useI18n";
import { authErrorKey } from "./authError";
import { AuthScreenStyles } from "./SignInScreen";

interface ForgotPasswordScreenProps {
  onGoToSignIn: () => void;
}

export default function ForgotPasswordScreen({
  onGoToSignIn,
}: ForgotPasswordScreenProps): React.JSX.Element {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = email.trim();
      if (!trimmed) {
        setErrorKey("auth.errorEmailRequired");
        return;
      }
      setBusy(true);
      setErrorKey(null);
      const r = await window.hermesAPI.authRecoverPassword(trimmed);
      setBusy(false);
      if (r.ok) {
        setSent(true);
      } else {
        setErrorKey(authErrorKey(r.code));
      }
    },
    [email],
  );

  if (sent) {
    return (
      <div className="auth-screen">
        <CheckCircle
          size={48}
          style={{ color: "var(--color-success, #22c55e)", margin: "0 auto" }}
        />
        <p className="auth-subtitle" style={{ textAlign: "center" }}>
          {t("auth.forgotSent", { email })}
        </p>
        <button className="btn btn-primary" onClick={onGoToSignIn}>
          {t("auth.forgotBack")}
        </button>
        <AuthScreenStyles />
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <button
        type="button"
        className="auth-link"
        onClick={onGoToSignIn}
        style={{ display: "flex", alignItems: "center", gap: 4 }}
      >
        <ArrowLeft size={14} />
        {t("auth.forgotBack")}
      </button>

      <h1 className="auth-title">{t("auth.forgotTitle")}</h1>
      <p className="auth-subtitle">{t("auth.forgotSubtitle")}</p>

      <form className="auth-form" onSubmit={onSubmit}>
        <label className="auth-label">
          <span className="auth-icon"><Mail size={16} /></span>
          <input
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.forgotEmail")}
            autoComplete="email"
            disabled={busy}
          />
        </label>

        {errorKey && (
          <div className="auth-error">
            <AlertCircle size={14} />
            <span>{t(errorKey)}</span>
          </div>
        )}

        <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
          {busy ? (
            <><Loader2 size={14} className="spin" /> {t("auth.forgotLoading")}</>
          ) : (
            t("auth.forgotSubmit")
          )}
        </button>
      </form>
      <AuthScreenStyles />
    </div>
  );
}
