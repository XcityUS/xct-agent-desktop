import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render as rtlRender,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import AuthFlow from "./AuthFlow";
import { I18nProvider } from "../../components/I18nProvider";
import { DEFAULT_ACTIVE_LOCALE } from "../../../../shared/i18n";

interface AuthAPI {
  authSignIn: ReturnType<typeof vi.fn>;
  authSignUp: ReturnType<typeof vi.fn>;
  authRecoverPassword: ReturnType<typeof vi.fn>;
  authStartGoogleOAuth: ReturnType<typeof vi.fn>;
  getLocale: ReturnType<typeof vi.fn>;
  setLocale: ReturnType<typeof vi.fn>;
}

let api: AuthAPI;

async function render(ui: React.ReactElement): Promise<ReturnType<typeof rtlRender>> {
  let result!: ReturnType<typeof rtlRender>;
  await act(async () => {
    result = rtlRender(<I18nProvider>{ui}</I18nProvider>);
  });
  return result;
}

beforeEach(() => {
  api = {
    authSignIn: vi.fn(async () => ({ ok: true, session: {} })),
    authSignUp: vi.fn(async () => ({ ok: true, kind: "session", session: {} })),
    authRecoverPassword: vi.fn(async () => ({ ok: true })),
    authStartGoogleOAuth: vi.fn(async () => ({ ok: true })),
    getLocale: vi.fn(async () => DEFAULT_ACTIVE_LOCALE),
    setLocale: vi.fn(async () => DEFAULT_ACTIVE_LOCALE),
  };
  (window as unknown as Record<string, unknown>).hermesAPI = api;
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).hermesAPI;
});

describe("AuthFlow — sign in", () => {
  it("submits email + password", async () => {
    const onSignedIn = vi.fn();
    await render(<AuthFlow onSignedIn={onSignedIn} />);
    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: "e@x.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/password/i), {
      target: { value: "pw12345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(api.authSignIn).toHaveBeenCalledWith("e@x.com", "pw12345678"));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
  });

  it("shows error when authSignIn returns invalid_credentials", async () => {
    api.authSignIn.mockResolvedValueOnce({
      ok: false,
      error: "bad",
      code: "invalid_credentials",
    });
    await render(<AuthFlow onSignedIn={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: "e@x" } });
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() =>
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument(),
    );
  });

  it("rejects empty email locally without IPC call", async () => {
    await render(<AuthFlow onSignedIn={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() =>
      expect(screen.getByText(/email is required/i)).toBeInTheDocument(),
    );
    expect(api.authSignIn).not.toHaveBeenCalled();
  });

  it("hides Google button when googleEnabled=false", async () => {
    await render(<AuthFlow onSignedIn={() => {}} googleEnabled={false} />);
    expect(screen.queryByText(/sign in with google/i)).toBeNull();
  });

  it("shows Google button when googleEnabled=true", async () => {
    await render(<AuthFlow onSignedIn={() => {}} googleEnabled={true} />);
    expect(screen.getByText(/sign in with google/i)).toBeInTheDocument();
  });

  it("clicking Google triggers authStartGoogleOAuth", async () => {
    await render(<AuthFlow onSignedIn={() => {}} googleEnabled={true} />);
    fireEvent.click(screen.getByRole("button", { name: /sign in with google/i }));
    await waitFor(() => expect(api.authStartGoogleOAuth).toHaveBeenCalled());
  });

  it("shows cancel link when cancelable=true", async () => {
    const onCancel = vi.fn();
    await render(<AuthFlow onSignedIn={() => {}} cancelable={true} onCancel={onCancel} />);
    fireEvent.click(screen.getByText(/continue without account/i));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("AuthFlow — sign up", () => {
  it("rejects mismatched passwords", async () => {
    await render(<AuthFlow initialMode="signup" onSignedIn={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: "e@x.com" } });
    fireEvent.change(screen.getByPlaceholderText(/^password.*8/i), {
      target: { value: "pw12345678" },
    });
    fireEvent.change(screen.getByPlaceholderText(/confirm password/i), {
      target: { value: "different" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign up$/i }));
    await waitFor(() =>
      expect(screen.getByText(/passwords don't match/i)).toBeInTheDocument(),
    );
    expect(api.authSignUp).not.toHaveBeenCalled();
  });

  it("rejects passwords shorter than 8 chars", async () => {
    await render(<AuthFlow initialMode="signup" onSignedIn={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: "e@x.com" } });
    fireEvent.change(screen.getByPlaceholderText(/^password.*8/i), {
      target: { value: "short" },
    });
    fireEvent.change(screen.getByPlaceholderText(/confirm password/i), {
      target: { value: "short" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign up$/i }));
    await waitFor(() =>
      expect(screen.getByText(/password is too weak/i)).toBeInTheDocument(),
    );
    expect(api.authSignUp).not.toHaveBeenCalled();
  });

  it("shows verify-email screen when kind=requires_verification", async () => {
    api.authSignUp.mockResolvedValueOnce({
      ok: true,
      kind: "requires_verification",
      email: "new@x.com",
    });
    await render(<AuthFlow initialMode="signup" onSignedIn={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: "new@x.com" } });
    fireEvent.change(screen.getByPlaceholderText(/^password.*8/i), {
      target: { value: "pw12345678" },
    });
    fireEvent.change(screen.getByPlaceholderText(/confirm password/i), {
      target: { value: "pw12345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign up$/i }));
    await waitFor(() =>
      expect(screen.getByText(/check your inbox/i)).toBeInTheDocument(),
    );
  });

  it("calls onSignedIn on autoconfirm session result", async () => {
    const onSignedIn = vi.fn();
    api.authSignUp.mockResolvedValueOnce({ ok: true, kind: "session", session: {} });
    await render(<AuthFlow initialMode="signup" onSignedIn={onSignedIn} />);
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: "e@x" } });
    fireEvent.change(screen.getByPlaceholderText(/^password.*8/i), {
      target: { value: "pw12345678" },
    });
    fireEvent.change(screen.getByPlaceholderText(/confirm password/i), {
      target: { value: "pw12345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign up$/i }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
  });
});

describe("AuthFlow — forgot password", () => {
  it("submits to authRecoverPassword and shows the sent confirmation", async () => {
    await render(<AuthFlow initialMode="forgot" onSignedIn={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: "e@x.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send reset email/i }));
    await waitFor(() =>
      expect(api.authRecoverPassword).toHaveBeenCalledWith("e@x.com"),
    );
    await waitFor(() =>
      expect(screen.getByText(/reset link is on its way/i)).toBeInTheDocument(),
    );
  });
});

describe("AuthFlow — navigation", () => {
  it("clicking 'Create one' switches to sign-up", async () => {
    await render(<AuthFlow onSignedIn={() => {}} />);
    fireEvent.click(screen.getByText(/create one/i));
    expect(screen.getByText(/create your xcity account/i)).toBeInTheDocument();
  });

  it("clicking 'Forgot password' switches to forgot screen", async () => {
    await render(<AuthFlow onSignedIn={() => {}} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    expect(screen.getByText(/reset password/i)).toBeInTheDocument();
  });

  it("from forgot screen, 'Back to sign in' returns", async () => {
    await render(<AuthFlow initialMode="forgot" onSignedIn={() => {}} />);
    expect(screen.getByText(/reset password/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/back to sign in/i));
    expect(screen.getByPlaceholderText(/^password$/i)).toBeInTheDocument();
  });
});
