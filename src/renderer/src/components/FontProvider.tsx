import { createContext, useContext, useEffect, useState } from "react";
import {
  DEFAULT_FONT,
  FONT_OPTIONS,
  FONT_STORAGE_KEY as STORAGE_KEY,
} from "../constants";

interface FontContextValue {
  font: string;
  setFont: (font: string) => void;
}

const FontContext = createContext<FontContextValue>({
  font: DEFAULT_FONT,
  setFont: () => {},
});

function stackFor(font: string): string {
  return (
    FONT_OPTIONS.find((opt) => opt.value === font)?.stack ??
    FONT_OPTIONS.find((opt) => opt.value === DEFAULT_FONT)!.stack
  );
}

function isKnownFont(value: string | null): value is string {
  return !!value && FONT_OPTIONS.some((opt) => opt.value === value);
}

export function FontProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [font, setFontState] = useState<string>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isKnownFont(stored) ? stored : DEFAULT_FONT;
  });

  function setFont(next: string): void {
    setFontState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  // Apply the chosen stack to --font-sans on <html>, overriding the CSS default.
  useEffect(() => {
    document.documentElement.style.setProperty("--font-sans", stackFor(font));
  }, [font]);

  return (
    <FontContext.Provider value={{ font, setFont }}>
      {children}
    </FontContext.Provider>
  );
}

export function useFont(): FontContextValue {
  return useContext(FontContext);
}
