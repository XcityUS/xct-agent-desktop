import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Brain, Check, ChevronDown } from "lucide-react";
import { useI18n } from "../../components/useI18n";
import type { ReasoningEffort } from "./hooks/useReasoningEffort";

interface ReasoningEffortPickerProps {
  value: ReasoningEffort;
  onChange: (value: ReasoningEffort) => void | Promise<void>;
}

const OPTIONS: Array<{
  value: ReasoningEffort;
  labelKey: string;
  descriptionKey: string;
}> = [
  {
    value: "auto",
    labelKey: "chat.reasoningEffort.auto",
    descriptionKey: "chat.reasoningEffort.autoDescription",
  },
  {
    value: "minimal",
    labelKey: "chat.reasoningEffort.minimal",
    descriptionKey: "chat.reasoningEffort.minimalDescription",
  },
  {
    value: "low",
    labelKey: "chat.reasoningEffort.low",
    descriptionKey: "chat.reasoningEffort.lowDescription",
  },
  {
    value: "medium",
    labelKey: "chat.reasoningEffort.medium",
    descriptionKey: "chat.reasoningEffort.mediumDescription",
  },
  {
    value: "high",
    labelKey: "chat.reasoningEffort.high",
    descriptionKey: "chat.reasoningEffort.highDescription",
  },
  {
    value: "xhigh",
    labelKey: "chat.reasoningEffort.xhigh",
    descriptionKey: "chat.reasoningEffort.xhighDescription",
  },
];

export const ReasoningEffortPicker = memo(function ReasoningEffortPicker({
  value,
  onChange,
}: ReasoningEffortPickerProps): React.JSX.Element {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => OPTIONS.find((option) => option.value === value) ?? OPTIONS[0],
    [value],
  );

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent): void {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  async function select(next: ReasoningEffort): Promise<void> {
    try {
      await onChange(next);
      setSaveError(false);
      setIsOpen(false);
    } catch {
      setSaveError(true);
    }
  }

  return (
    <div className="chat-reasoning-bar" ref={pickerRef}>
      <button
        className="chat-reasoning-trigger"
        onClick={() => {
          setSaveError(false);
          setIsOpen((open) => !open);
        }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={t("chat.reasoningEffort.title")}
        type="button"
      >
        <Brain size={12} />
        <span className="chat-reasoning-name">{t(selected.labelKey)}</span>
        <ChevronDown size={12} />
      </button>

      {isOpen && (
        <div
          className="chat-reasoning-dropdown"
          role="menu"
          aria-label={t("chat.reasoningEffort.title")}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setIsOpen(false);
              setSaveError(false);
            }
          }}
        >
          <div className="chat-reasoning-header">
            {t("chat.reasoningEffort.title")}
          </div>
          <div className="chat-reasoning-hint">
            {t("chat.reasoningEffort.hint")}
          </div>
          {saveError && (
            <div className="chat-reasoning-error" role="alert">
              {t("chat.reasoningEffort.saveError")}
            </div>
          )}
          {OPTIONS.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                className={`chat-reasoning-option ${active ? "active" : ""}`}
                onClick={() => void select(option.value)}
                role="menuitemradio"
                aria-checked={active}
                type="button"
              >
                <span className="chat-reasoning-option-copy">
                  <span className="chat-reasoning-option-label">
                    {t(option.labelKey)}
                  </span>
                  <span className="chat-reasoning-option-description">
                    {t(option.descriptionKey)}
                  </span>
                </span>
                {active && <Check size={14} className="chat-reasoning-check" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
