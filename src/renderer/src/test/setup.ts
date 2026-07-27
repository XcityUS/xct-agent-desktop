import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      clear: (): void => {
        store.clear();
      },
      getItem: (key: string): string | null => store.get(key) ?? null,
      key: (index: number): string | null => Array.from(store.keys())[index] ?? null,
      removeItem: (key: string): void => {
        store.delete(key);
      },
      setItem: (key: string, value: string): void => {
        store.set(key, String(value));
      },
      get length(): number {
        return store.size;
      },
    },
  });
}

// Mock thinking-orbs — its canvas/IntersectionObserver rendering has no
// jsdom equivalent.
vi.mock("thinking-orbs", () => ({
  ThinkingOrb: () => null,
}));

afterEach(() => {
  cleanup();
});
