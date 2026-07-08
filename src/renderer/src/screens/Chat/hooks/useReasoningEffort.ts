import { useCallback, useEffect, useRef, useState } from "react";

export type ReasoningEffort =
  | "auto"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "auto";

export function normalizeReasoningEffort(value: unknown): ReasoningEffort {
  return value === "auto" ||
    value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh"
    ? value
    : DEFAULT_REASONING_EFFORT;
}

interface UseReasoningEffortResult {
  reasoningEffort: ReasoningEffort;
  setReasoningEffort: (next: ReasoningEffort) => Promise<void>;
}

export function useReasoningEffort(profile?: string): UseReasoningEffortResult {
  const [reasoningEffort, setReasoningEffortState] = useState<ReasoningEffort>(
    DEFAULT_REASONING_EFFORT,
  );
  const reasoningEffortRef = useRef<ReasoningEffort>(DEFAULT_REASONING_EFFORT);

  useEffect(() => {
    reasoningEffortRef.current = reasoningEffort;
  }, [reasoningEffort]);

  useEffect(() => {
    let cancelled = false;
    window.hermesAPI
      .getConfig("agent.reasoning_effort", profile)
      .then((value) => {
        if (!cancelled) {
          const next = normalizeReasoningEffort(value);
          reasoningEffortRef.current = next;
          setReasoningEffortState(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          reasoningEffortRef.current = DEFAULT_REASONING_EFFORT;
          setReasoningEffortState(DEFAULT_REASONING_EFFORT);
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [profile]);

  const setReasoningEffort = useCallback(
    async (next: ReasoningEffort): Promise<void> => {
      const previous = reasoningEffortRef.current;
      reasoningEffortRef.current = next;
      setReasoningEffortState(next);

      try {
        await window.hermesAPI.setConfig(
          "agent.reasoning_effort",
          next,
          profile,
        );
      } catch (error) {
        reasoningEffortRef.current = previous;
        setReasoningEffortState(previous);
        throw error;
      }
    },
    [profile],
  );

  return { reasoningEffort, setReasoningEffort };
}
