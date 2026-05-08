import { useCallback, useState } from "react";
import { LogIn, LogOut, User, ChevronUp } from "lucide-react";
import { useI18n } from "./useI18n";
import { useAuthSession } from "../hooks/useAuthSession";

interface UserMenuProps {
  onSignInClick: () => void;
}

export default function UserMenu({
  onSignInClick,
}: UserMenuProps): React.JSX.Element {
  const { t } = useI18n();
  const { session, loading } = useAuthSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSignOut = useCallback(async () => {
    setBusy(true);
    await window.hermesAPI.authSignOut();
    setBusy(false);
    setOpen(false);
  }, []);

  if (loading) {
    return (
      <div className="user-menu user-menu-anonymous">
        <span className="user-menu-loading">…</span>
        <Styles />
      </div>
    );
  }

  if (!session.signed_in) {
    return (
      <div className="user-menu user-menu-anonymous">
        <button className="user-menu-signin" onClick={onSignInClick}>
          <LogIn size={14} />
          <span>{t("auth.promptSignIn")}</span>
        </button>
        <Styles />
      </div>
    );
  }

  return (
    <div className="user-menu">
      <button
        className="user-menu-trigger"
        onClick={() => setOpen((s) => !s)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="user-menu-avatar">
          <User size={14} />
        </span>
        <span className="user-menu-email">{session.email ?? "—"}</span>
        <ChevronUp
          size={12}
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
          }}
        />
      </button>
      {open && (
        <div className="user-menu-dropdown" role="menu">
          <div className="user-menu-header">
            {t("auth.menuSignedInAs", { email: session.email ?? "—" })}
          </div>
          <button
            className="user-menu-item user-menu-signout"
            onClick={onSignOut}
            disabled={busy}
            role="menuitem"
          >
            <LogOut size={14} />
            <span>{t("auth.menuSignOut")}</span>
          </button>
        </div>
      )}
      <Styles />
    </div>
  );
}

function Styles(): React.JSX.Element {
  return (
    <style>{`
      .user-menu { position: relative; padding: 8px; }
      .user-menu-anonymous .user-menu-signin {
        display: flex; align-items: center; gap: 6px; padding: 8px 12px;
        background: none; border: 1px solid var(--color-border, #e0e0e0); border-radius: 6px;
        cursor: pointer; color: var(--color-fg, #333); font-size: 13px; width: 100%;
      }
      .user-menu-anonymous .user-menu-signin:hover { border-color: var(--color-accent, #0066cc); color: var(--color-accent, #0066cc); }
      .user-menu-loading { color: var(--color-fg-muted, #888); font-size: 12px; }
      .user-menu-trigger {
        display: flex; align-items: center; gap: 8px; padding: 8px 12px; width: 100%;
        background: none; border: 1px solid var(--color-border, #e0e0e0); border-radius: 6px;
        cursor: pointer; font-size: 13px; color: var(--color-fg, #333); text-align: left;
      }
      .user-menu-trigger:hover { background: var(--color-bg-secondary, #f5f5f5); }
      .user-menu-avatar {
        display: inline-flex; align-items: center; justify-content: center;
        width: 24px; height: 24px; border-radius: 50%; background: var(--color-accent, #0066cc); color: white; flex-shrink: 0;
      }
      .user-menu-email { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .user-menu-dropdown {
        position: absolute; bottom: calc(100% + 4px); left: 8px; right: 8px;
        background: var(--color-bg, #fff); border: 1px solid var(--color-border, #e0e0e0); border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.08); padding: 6px; z-index: 100;
      }
      .user-menu-header {
        padding: 6px 10px; font-size: 11px; color: var(--color-fg-muted, #888);
        border-bottom: 1px solid var(--color-border, #eee); margin-bottom: 4px;
      }
      .user-menu-item {
        display: flex; align-items: center; gap: 8px; padding: 8px 10px; width: 100%;
        background: none; border: none; cursor: pointer; font-size: 13px;
        color: var(--color-fg, #333); text-align: left; border-radius: 4px;
      }
      .user-menu-item:hover:not(:disabled) { background: var(--color-bg-secondary, #f5f5f5); }
      .user-menu-item:disabled { opacity: 0.5; cursor: not-allowed; }
      .user-menu-signout { color: #dc2626; }
    `}</style>
  );
}
