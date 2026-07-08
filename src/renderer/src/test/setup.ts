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

// Mock react-loader-spinner which fails to load in test environment
vi.mock("react-loader-spinner", () => ({
  Grid: () => null,
  Audio: () => null,
  BallTriangle: () => null,
  Bars: () => null,
  Circles: () => null,
  CirclesWithBar: () => null,
  ColorRing: () => null,
  Comment: () => null,
  Discuss: () => null,
  DNA: () => null,
  FallingLines: () => null,
  FidgetSpinner: () => null,
  Hearts: () => null,
  InfinitySpin: () => null,
  LineWave: () => null,
  MagnifyingGlass: () => null,
  MutatingDots: () => null,
  Oval: () => null,
  ProgressBar: () => null,
  Puff: () => null,
  Radio: () => null,
  RevolvingDot: () => null,
  Rings: () => null,
  RotatingLines: () => null,
  RotatingSquare: () => null,
  RotatingTriangles: () => null,
  TailSpin: () => null,
  ThreeCircles: () => null,
  ThreeDots: () => null,
  Triangle: () => null,
  Vortex: () => null,
  Watch: () => null,
}));

afterEach(() => {
  cleanup();
});
