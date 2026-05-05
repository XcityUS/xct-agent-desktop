import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render as rtlRender,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import LoginPromptModal, { _resetLoginPromptFlag } from "./LoginPromptModal";
import UserMenu from "./UserMenu";
import BalanceBadge from "./BalanceBadge";
import { I18nProvider } from "./I18nProvider";
import { DEFAULT_ACTIVE_LOCALE } from "../../../shared/i18n";

interface AuthSessionView {
  signed_in: boolean;
  email: string | null;
  user_id: string | null;
  expires_at: number | null;
}

let listeners: Array<(v: AuthSessionView) => void>;
let session: AuthSessionView;
let api: Record<string, ReturnType<typeof vi.fn>>;

async function render(ui: React.ReactElement): Promise<ReturnType<typeof rtlRender>> {
  let result!: ReturnType<typeof rtlRender>;
  await act(async () => {
    result = rtlRender(<I18nProvider>{ui}</I18nProvider>);
  });
  return result;
}

beforeEach(() => {
  listeners = [];
  session = { signed_in: false, email: null, user_id: null, expires_at: null };
  api = {
    authGetSession: vi.fn(async () => session),
    onAuthSessionChanged: vi.fn((cb: (v: AuthSessionView) => void) => {
      listeners.push(cb);
      return () => {
        listeners = listeners.filter((l) => l !== cb);
      };
    }),
    authSignOut: vi.fn(async () => ({ ok: true })),
    walletGetBalance: vi.fn(async () => ({
      ok: true,
      balance: {
        wallet_id: "w",
        balance: 1234,
        monthly_cap_usd: null,
        spend_this_period_usd: 0,
        plan: "free",
        plan_status: "active",
      },
    })),
    getLocale: vi.fn(async () => DEFAULT_ACTIVE_LOCALE),
    setLocale: vi.fn(async () => DEFAULT_ACTIVE_LOCALE),
  };
  (window as unknown as Record<string, unknown>).hermesAPI = api;
  _resetLoginPromptFlag();
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).hermesAPI;
});

describe("LoginPromptModal", () => {
  it("renders nothing when signed in", async () => {
    session = {
      signed_in: true,
      email: "e@x",
      user_id: "u",
      expires_at: 1700000000,
    };
    const { container } = await render(<LoginPromptModal onChooseAuth={() => {}} />);
    await waitFor(() => expect(container.querySelector(".login-prompt-card")).toBeNull());
  });

  it("renders modal when anonymous, then dismisses on Continue", async () => {
    const onChoose = vi.fn();
    await render(<LoginPromptModal onChooseAuth={onChoose} />);
    await waitFor(() =>
      expect(screen.getByText(/sign in to xcity/i)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText(/continue without account/i));
    await waitFor(() =>
      expect(screen.queryByText(/sign in to xcity/i)).toBeNull(),
    );
  });

  it("clicking Sign in calls onChooseAuth with 'signin'", async () => {
    const onChoose = vi.fn();
    await render(<LoginPromptModal onChooseAuth={onChoose} />);
    await waitFor(() => screen.getByText(/sign in to xcity/i));
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(onChoose).toHaveBeenCalledWith("signin");
  });

  it("clicking Create account calls onChooseAuth with 'signup'", async () => {
    const onChoose = vi.fn();
    await render(<LoginPromptModal onChooseAuth={onChoose} />);
    await waitFor(() => screen.getByText(/sign in to xcity/i));
    fireEvent.click(screen.getByText(/create account/i));
    expect(onChoose).toHaveBeenCalledWith("signup");
  });
});

describe("UserMenu", () => {
  it("shows Sign in button when anonymous", async () => {
    await render(<UserMenu onSignInClick={() => {}} />);
    await waitFor(() => expect(screen.getByText(/sign in/i)).toBeInTheDocument());
  });

  it("calls onSignInClick when Sign-in clicked anonymously", async () => {
    const onClick = vi.fn();
    await render(<UserMenu onSignInClick={onClick} />);
    await waitFor(() => screen.getByText(/sign in/i));
    fireEvent.click(screen.getByText(/sign in/i));
    expect(onClick).toHaveBeenCalled();
  });

  it("shows email when signed in", async () => {
    session = {
      signed_in: true,
      email: "alice@x.com",
      user_id: "u1",
      expires_at: 1700000000,
    };
    await render(<UserMenu onSignInClick={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText("alice@x.com")).toBeInTheDocument(),
    );
  });

  it("Sign out calls authSignOut", async () => {
    session = {
      signed_in: true,
      email: "alice@x.com",
      user_id: "u1",
      expires_at: 1700000000,
    };
    await render(<UserMenu onSignInClick={() => {}} />);
    await waitFor(() => screen.getByText("alice@x.com"));
    fireEvent.click(screen.getByText("alice@x.com"));
    fireEvent.click(screen.getByText(/sign out/i));
    await waitFor(() => expect(api.authSignOut).toHaveBeenCalled());
  });
});

describe("BalanceBadge", () => {
  it("renders nothing when anonymous", async () => {
    const { container } = await render(<BalanceBadge />);
    await waitFor(() =>
      expect(container.querySelector(".balance-badge")).toBeNull(),
    );
  });

  it("fetches and renders balance when signed in", async () => {
    session = {
      signed_in: true,
      email: "e@x",
      user_id: "u",
      expires_at: 1700000000,
    };
    await render(<BalanceBadge />);
    await waitFor(() => expect(screen.getByText(/1,234/)).toBeInTheDocument());
  });

  it("calls onClick when provided", async () => {
    session = {
      signed_in: true,
      email: "e@x",
      user_id: "u",
      expires_at: 1700000000,
    };
    const onClick = vi.fn();
    await render(<BalanceBadge onClick={onClick} />);
    await waitFor(() => screen.getByText(/1,234/));
    fireEvent.click(screen.getByLabelText(/wallet balance/i));
    expect(onClick).toHaveBeenCalled();
  });
});
