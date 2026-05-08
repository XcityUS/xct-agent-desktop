import { useCallback, useState } from "react";
import { Mail, Lock, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { useI18n } from "../../components/useI18n";
import { authErrorKey } from "./authError";
import { AuthScreenStyles } from "./SignInScreen";

interface SignUpScreenProps {
  onSignedIn: () => void;
  onGoToSignIn: () => void;
}

export default function SignUpScreen({
  onSignedIn,
  onGoToSignIn,
}: SignUpScreenProps): React.JSX.Element {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = email.trim();
      if (!trimmed) {
        setErrorKey("auth.errorEmailRequired");
        return;
      }
      if (password.length < 8) {
        setErrorKey("auth.errorWeakPassword");
        return;
      }
      if (password !== confirm) {
        setErrorKey("auth.errorPasswordsMismatch");
        return;
      }
      setBusy(true);
      setErrorKey(null);
      const r = await window.hermesAPI.authSignUp(trimmed, password);
      setBusy(false);
      if (!r.ok) {
        setErrorKey(authErrorKey(r.code));
        return;
      }
      if (r.kind === "session") {
        onSignedIn();
      } else {
        // Server is configured without autoconfirm; show "check your email"
        setVerifyEmail(r.email ?? trimmed);
      }
    },
    [email, password, confirm, onSignedIn],
  );

  if (verifyEmail) {
    return (
      <div className="auth-screen">
        <CheckCircle
          size={48}
          style={{ color: "var(--color-success, #22c55e)", margin: "0 auto" }}
        />
        <h1 className="auth-title" style={{ textAlign: "center" }}>
          {t("auth.signUpRequiresVerification", { email: verifyEmail })}
        </h1>
        <button className="btn btn-primary" onClick={onGoToSignIn}>
          {t("auth.signUpSignIn")}
        </button>
        <AuthScreenStyles />
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <h1 className="auth-title">{t("auth.signUpTitle")}</h1>
      <p className="auth-subtitle">{t("auth.signUpSubtitle")}</p>

      <form className="auth-form" onSubmit={onSubmit}>
        <label className="auth-label">
          <span className="auth-icon">
            <Mail size={16} />
          </span>
          <input
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.signUpEmail")}
            autoComplete="email"
            disabled={busy}
          />
        </label>

        <label className="auth-label">
          <span className="auth-icon">
            <Lock size={16} />
          </span>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.signUpPassword")}
            autoComplete="new-password"
            disabled={busy}
          />
        </label>

        <label className="auth-label">
          <span className="auth-icon">
            <Lock size={16} />
          </span>
          <input
            type="password"
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t("auth.signUpConfirmPassword")}
            autoComplete="new-password"
            disabled={busy}
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
          disabled={busy}
        >
          {busy ? (
            <>
              <Loader2 size={14} className="spin" /> {t("auth.signUpLoading")}
            </>
          ) : (
            t("auth.signUpSubmit")
          )}
        </button>

        <div className="auth-footer">
          <span>{t("auth.signUpHaveAccount")}</span>{" "}
          <button type="button" className="auth-link" onClick={onGoToSignIn}>
            {t("auth.signUpSignIn")}
          </button>
        </div>
      </form>
      <AuthScreenStyles />
    </div>
  );
}
