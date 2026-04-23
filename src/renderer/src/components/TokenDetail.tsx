import { useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export interface TokenUsageEntry {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
  timestamp: number;
}

export interface TokenDetailProps {
  /** Session token usage entries grouped by model */
  entries: TokenUsageEntry[];
  /** Currently expanded state */
  expanded: boolean;
  /** Toggle expanded state */
  onToggle: () => void;
}

interface ModelGroup {
  model: string;
  entries: TokenUsageEntry[];
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCost: number;
}

function TokenDetail({
  entries,
  expanded,
  onToggle,
}: TokenDetailProps): React.JSX.Element {
  const modelGroups = useMemo<ModelGroup[]>(() => {
    const groups = new Map<string, ModelGroup>();

    for (const entry of entries) {
      if (!groups.has(entry.model)) {
        groups.set(entry.model, {
          model: entry.model,
          entries: [],
          totalPromptTokens: 0,
          totalCompletionTokens: 0,
          totalTokens: 0,
          totalCost: 0,
        });
      }
      const group = groups.get(entry.model)!;
      group.entries.push(entry);
      group.totalPromptTokens += entry.promptTokens;
      group.totalCompletionTokens += entry.completionTokens;
      group.totalTokens += entry.totalTokens;
      group.totalCost += entry.cost ?? 0;
    }

    return Array.from(groups.values()).sort(
      (a, b) => b.totalTokens - a.totalTokens,
    );
  }, [entries]);

  const grandTotal = useMemo(() => {
    return modelGroups.reduce(
      (acc, g) => ({
        promptTokens: acc.promptTokens + g.totalPromptTokens,
        completionTokens: acc.completionTokens + g.totalCompletionTokens,
        totalTokens: acc.totalTokens + g.totalTokens,
        cost: acc.cost + g.totalCost,
      }),
      { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 },
    );
  }, [modelGroups]);

  if (entries.length === 0) {
    return (
      <div className="token-detail token-detail--empty">
        <div className="token-detail-empty-text">No token usage recorded yet</div>
      </div>
    );
  }

  return (
    <div className="token-detail">
      <button className="token-detail-header" onClick={onToggle}>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="token-detail-title">Token Breakdown</span>
        <span className="token-detail-total">
          {grandTotal.totalTokens.toLocaleString()} tokens
          {grandTotal.cost > 0 && (
            <span className="token-detail-cost">
              {" "}· ${grandTotal.cost.toFixed(4)}
            </span>
          )}
        </span>
      </button>

      {expanded && (
        <div className="token-detail-body">
          {modelGroups.map((group) => (
            <div key={group.model} className="token-detail-model">
              <div className="token-detail-model-header">
                <span className="token-detail-model-name">{group.model}</span>
                <span className="token-detail-model-tokens">
                  {group.totalTokens.toLocaleString()} tokens
                </span>
              </div>
              <div className="token-detail-model-breakdown">
                <div className="token-detail-model-row">
                  <span className="token-detail-model-label">Prompt</span>
                  <span className="token-detail-model-value">
                    {group.totalPromptTokens.toLocaleString()}
                  </span>
                </div>
                <div className="token-detail-model-row">
                  <span className="token-detail-model-label">Completion</span>
                  <span className="token-detail-model-value">
                    {group.totalCompletionTokens.toLocaleString()}
                  </span>
                </div>
                {group.totalCost > 0 && (
                  <div className="token-detail-model-row">
                    <span className="token-detail-model-label">Cost</span>
                    <span className="token-detail-model-value">
                      ${group.totalCost.toFixed(4)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TokenDetail;
