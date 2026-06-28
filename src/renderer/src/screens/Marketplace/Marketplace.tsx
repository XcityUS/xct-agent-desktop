import { useState, useEffect, useCallback, useRef } from "react";
import { Search, X, Refresh, Download, Check } from "../../assets/icons";
import { useI18n } from "../../components/useI18n";
import {
  listTokenhubAgents,
  type TokenhubAgent,
} from "../../lib/tokenhub-client";

interface MarketplaceProps {
  /** Currently active profile — shown disabled if equal to an agent install_id. */
  activeProfile: string;
  /** Called after a successful enable so the parent can switch focus. */
  onEnabled?: (profileName: string) => void;
}

/**
 * Tokenhub Agent Marketplace.
 *
 * Lists agents from `https://tokenhub.xcity.one/v1/agents`, filtered client-
 * side by search + category. "Enable" creates a Hermes profile named after
 * the agent (cloning the default profile's config + API keys so the new
 * agent starts with credentials), then sets it active and calls onEnabled.
 *
 * The marketplace is gated by the xcity-home sign-in cookie (same flow as
 * `litellm-client`). Surface a sign-in CTA when the bearer fetch fails with
 * an auth error instead of pretending the registry is empty.
 */
function Marketplace({
  activeProfile,
  onEnabled,
}: MarketplaceProps): React.JSX.Element {
  const { t } = useI18n();
  const [agents, setAgents] = useState<TokenhubAgent[]>([]);
  const [installedProfiles, setInstalledProfiles] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [enabling, setEnabling] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const loadProfiles = useCallback(async (): Promise<void> => {
    const profiles = await window.hermesAPI.listProfiles();
    setInstalledProfiles(new Set(profiles.map((p) => p.name)));
  }, []);

  const loadAgents = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const list = await listTokenhubAgents();
      setAgents(list);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfiles();
    loadAgents();
  }, [loadProfiles, loadAgents]);

  function profileNameFor(agent: TokenhubAgent): string {
    // Hermes profile names must be [a-z0-9_-]+ — sanitize using the same
    // rule the Agents create dialog enforces.
    const base = (agent.install_id || agent.id || agent.name).toLowerCase();
    return base.replace(/[^a-z0-9_-]/g, "-");
  }

  async function handleEnable(agent: TokenhubAgent): Promise<void> {
    const name = profileNameFor(agent);
    if (!name) return;
    setEnabling(name);
    setError(null);
    try {
      const created = await window.hermesAPI.createProfile(name, true);
      // Profile may already exist (created in a prior session) — treat that
      // as success, just switch to it.
      if (!created.success && !/exists/i.test(created.error || "")) {
        throw new Error(created.error || t("marketplace.enableFailed"));
      }
      await window.hermesAPI.setActiveProfile(name);
      await loadProfiles();
      onEnabled?.(name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnabling(null);
    }
  }

  const filtered = agents.filter((a) => {
    let matches = true;
    if (search) {
      const q = search.toLowerCase();
      matches =
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        (a.author?.toLowerCase().includes(q) ?? false);
    }
    if (categoryFilter) {
      matches = matches && a.category === categoryFilter;
    }
    return matches;
  });

  const categories = Array.from(new Set(agents.map((a) => a.category))).sort();

  return (
    <div className="skills-container">
      <div className="skills-header">
        <div>
          <h2 className="skills-title">{t("marketplace.title")}</h2>
          <p className="skills-subtitle">{t("marketplace.subtitle")}</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadAgents}>
          <Refresh size={14} />
          {t("marketplace.refresh")}
        </button>
      </div>

      {error && !loading && (
        <div className="skills-error">
          {error}
          <button className="btn-ghost" onClick={() => setError(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className="skills-search">
        <Search size={15} />
        <input
          ref={searchRef}
          className="skills-search-input"
          type="text"
          placeholder={t("marketplace.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            className="btn-ghost skills-search-clear"
            onClick={() => {
              setSearch("");
              searchRef.current?.focus();
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {categories.length > 0 && (
        <div className="skills-category-pills">
          <button
            className={`skills-pill ${categoryFilter === null ? "active" : ""}`}
            onClick={() => setCategoryFilter(null)}
          >
            {t("marketplace.all")}
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`skills-pill ${categoryFilter === cat ? "active" : ""}`}
              onClick={() =>
                setCategoryFilter(categoryFilter === cat ? null : cat)
              }
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="skills-loading">
          <div className="loading-spinner" />
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="skills-empty">
          <p className="skills-empty-text">{t("marketplace.empty")}</p>
          <p className="skills-empty-hint">{t("marketplace.emptyHint")}</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="skills-grid">
          {filtered.map((agent) => {
            const profileName = profileNameFor(agent);
            const isInstalled = installedProfiles.has(profileName);
            const isActive = activeProfile === profileName;
            const isActioning = enabling === profileName;
            return (
              <div key={agent.id} className="skills-card">
                <div className="skills-card-category">{agent.category}</div>
                <div className="skills-card-name">{agent.name}</div>
                {agent.author && (
                  <div className="skills-card-description">
                    {t("marketplace.byAuthor", { author: agent.author })}
                  </div>
                )}
                {agent.description && (
                  <div className="skills-card-description">
                    {agent.description}
                  </div>
                )}
                <div className="skills-card-footer">
                  {isActive ? (
                    <span className="skills-card-installed-badge">
                      <Check size={12} /> {t("marketplace.active")}
                    </span>
                  ) : isInstalled ? (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        window.hermesAPI.setActiveProfile(profileName);
                        onEnabled?.(profileName);
                      }}
                    >
                      {t("marketplace.use")}
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary btn-sm skills-card-install-btn"
                      onClick={() => handleEnable(agent)}
                      disabled={isActioning}
                    >
                      {isActioning ? (
                        t("marketplace.enabling")
                      ) : (
                        <>
                          <Download size={13} />
                          {t("marketplace.enable")}
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Marketplace;
