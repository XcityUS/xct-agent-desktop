import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAuthSession } from "./useAuthSession";

interface FakeView {
  signed_in: boolean;
  email: string | null;
  user_id: string | null;
  expires_at: number | null;
}

describe("useAuthSession", () => {
  let listeners: Array<(v: FakeView) => void>;
  let view: FakeView;

  beforeEach(() => {
    listeners = [];
    view = { signed_in: false, email: null, user_id: null, expires_at: null };
    (window as unknown as Record<string, unknown>).hermesAPI = {
      authGetSession: vi.fn(async () => view),
      onAuthSessionChanged: vi.fn((cb: (v: FakeView) => void) => {
        listeners.push(cb);
        return () => {
          listeners = listeners.filter((l) => l !== cb);
        };
      }),
    };
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).hermesAPI;
  });

  it("starts loading=true with empty session, then resolves", async () => {
    const { result } = renderHook(() => useAuthSession());
    expect(result.current.loading).toBe(true);
    expect(result.current.session.signed_in).toBe(false);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("updates when session-changed fires", async () => {
    const { result } = renderHook(() => useAuthSession());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      listeners.forEach((cb) =>
        cb({
          signed_in: true,
          email: "e@x.com",
          user_id: "u",
          expires_at: 1700000000,
        }),
      );
    });
    expect(result.current.session.signed_in).toBe(true);
    expect(result.current.session.email).toBe("e@x.com");
  });

  it("refresh re-reads session on demand", async () => {
    view = {
      signed_in: false,
      email: null,
      user_id: null,
      expires_at: null,
    };
    const { result } = renderHook(() => useAuthSession());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session.signed_in).toBe(false);
    view = {
      signed_in: true,
      email: "e@x.com",
      user_id: "u",
      expires_at: 1700000000,
    };
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.session.signed_in).toBe(true);
  });

  it("unsubscribes on unmount", async () => {
    const { unmount } = renderHook(() => useAuthSession());
    await waitFor(() => expect(listeners.length).toBe(1));
    unmount();
    expect(listeners.length).toBe(0);
  });
});
