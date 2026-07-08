import { useState, useEffect, useCallback, useRef } from "react";
import { Cloud, CloudOff, Loader2, CheckCircle, XCircle, Zap, AlertCircle } from "lucide-react";

export type CloudConnectionStatus =
  | "connected"
  | "connecting"
  | "disconnected"
  | "error";

export interface CloudModeToggleProps {
  /** Called when user toggles mode or saves connection config */
  onModeChange?: (mode: "local" | "remote") => void;
  /** Compact mode for inline use */
  compact?: boolean;
}

function CloudModeToggle({
  onModeChange,
  compact = false,
}: CloudModeToggleProps): React.JSX.Element {
  const [mode, setMode] = useState<"local" | "remote">("local");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] =
    useState<CloudConnectionStatus>("disconnected");
  const [testing, setTesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<"to-cloud" | "to-local" | null>(null);
  const [errorShake, setErrorShake] = useState(false);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load initial connection config
  useEffect(() => {
    window.hermesAPI.getConnectionConfig().then((conn) => {
      const nextMode = conn.mode === "remote" ? "remote" : "local";
      setMode(nextMode);
      setRemoteUrl(conn.remoteUrl);
      setApiKey("");
      if (nextMode === "remote" && conn.remoteUrl) {
        setStatus("connecting");
        // Auto-test connection on load if in remote mode
        testConnection(conn.remoteUrl, "");
      } else {
        setStatus("disconnected");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup transition timer on unmount
  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  const testConnection = useCallback(
    async (url: string, key: string): Promise<boolean> => {
      if (!url) return false;
      setTesting(true);
      setStatus("connecting");
      setStatusMessage(null);
      try {
        const ok = await window.hermesAPI.testRemoteConnection(url, key);
        setStatus(ok ? "connected" : "error");
        setStatusMessage(ok ? null : "Could not reach server");
        if (!ok) {
          // Trigger error shake animation
          setErrorShake(true);
          setTimeout(() => setErrorShake(false), 500);
        }
        return ok;
      } catch {
        setStatus("error");
        setStatusMessage("Connection failed");
        // Trigger error shake animation
        setErrorShake(true);
        setTimeout(() => setErrorShake(false), 500);
        return false;
      } finally {
        setTesting(false);
      }
    },
    [],
  );

  const handleModeToggle = useCallback(
    async (newMode: "local" | "remote") => {
      if (newMode === mode) return; // No change needed
      
      // Start transition animation
      setTransitioning(true);
      setTransitionDirection(newMode === "remote" ? "to-cloud" : "to-local");
      
      // Clear any existing timer
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
      
      // Set transition timer for animation
      transitionTimerRef.current = setTimeout(() => {
        setTransitioning(false);
        setTransitionDirection(null);
      }, 400);

      setMode(newMode);
      if (newMode === "local") {
        setStatus("disconnected");
        setStatusMessage(null);
        await window.hermesAPI.setConnectionConfig("local", "", "");
        onModeChange?.("local");
      } else {
        setShowConfig(true);
      }
    },
    [mode, onModeChange],
  );

  const handleSaveRemote = useCallback(async () => {
    setShowConfig(false);
    setTransitioning(true);
    setTransitionDirection("to-cloud");
    
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
    }
    transitionTimerRef.current = setTimeout(() => {
      setTransitioning(false);
      setTransitionDirection(null);
    }, 400);
    
    await window.hermesAPI.setConnectionConfig("remote", remoteUrl, apiKey);
    setStatus("connecting");
    onModeChange?.("remote");
    // Test connection after saving
    testConnection(remoteUrl, apiKey);
  }, [mode, remoteUrl, apiKey, onModeChange, testConnection]);

  const handleTestConnection = useCallback(async () => {
    await testConnection(remoteUrl, apiKey);
  }, [remoteUrl, apiKey, testConnection]);

  const StatusIcon = (): React.JSX.Element => {
    switch (status) {
      case "connected":
        return <CheckCircle size={14} className="cloud-toggle-status-icon cloud-toggle-status--connected" />;
      case "connecting":
        return <Loader2 size={14} className="cloud-toggle-status-icon cloud-toggle-status--connecting" />;
      case "error":
        return <XCircle size={14} className="cloud-toggle-status-icon cloud-toggle-status--error" />;
      default:
        return <CloudOff size={14} className="cloud-toggle-status-icon cloud-toggle-status--disconnected" />;
    }
  };

  const statusLabel = (): string => {
    switch (status) {
      case "connected":
        return "Connected";
      case "connecting":
        return "Connecting...";
      case "error":
        return statusMessage || "Connection error";
      default:
        return mode === "remote" ? "Disconnected" : "Local mode";
    }
  };

  if (compact) {
    // Compact inline toggle for header/sidebar use
    return (
      <div className={`cloud-toggle-compact ${transitioning ? "cloud-toggle-compact--transitioning" : ""}`}>
        <button
          className={`cloud-toggle-mode-btn ${mode === "local" ? "active" : ""} ${transitionDirection === "to-cloud" ? "transitioning-to-cloud" : ""} ${transitionDirection === "to-local" ? "transitioning-to-local" : ""}`}
          onClick={() => handleModeToggle(mode === "local" ? "remote" : "local")}
          title={`Switch to ${mode === "local" ? "cloud" : "local"} mode`}
        >
          {mode === "local" ? (
            <CloudOff size={14} />
          ) : (
            <Cloud size={14} />
          )}
        </button>
        <StatusIcon />
      </div>
    );
  }

  return (
    <div className={`cloud-toggle ${transitioning ? "cloud-toggle--transitioning" : ""} ${errorShake ? "cloud-toggle--error-shake" : ""} ${transitionDirection === "to-cloud" ? "cloud-toggle--to-cloud" : ""} ${transitionDirection === "to-local" ? "cloud-toggle--to-local" : ""}`}>
      <div className="cloud-toggle-header">
        <div className="cloud-toggle-title">
          {mode === "local" ? <CloudOff size={16} /> : <Cloud size={16} />}
          <span>Cloud Mode</span>
          {transitioning && (
            <span className="cloud-toggle-transition-indicator">
              <Zap size={12} className="transition-icon" />
            </span>
          )}
        </div>
        <div className="cloud-toggle-status">
          <StatusIcon />
          <span className={`cloud-toggle-status-text cloud-toggle-status--${status}`}>
            {statusLabel()}
          </span>
        </div>
      </div>

      <div className={`cloud-toggle-modes ${transitioning ? "cloud-toggle-modes--transitioning" : ""}`}>
        <button
          className={`cloud-toggle-mode-btn ${mode === "local" ? "active" : ""} ${transitionDirection === "to-local" ? "cloud-toggle-mode-btn--switching" : ""}`}
          onClick={() => handleModeToggle("local")}
          disabled={transitioning}
        >
          <CloudOff size={16} />
          <span>Local</span>
          {transitionDirection === "to-local" && (
            <span className="cloud-toggle-mode-btn-transition-dot" />
          )}
        </button>
        <button
          className={`cloud-toggle-mode-btn ${mode === "remote" ? "active" : ""} ${transitionDirection === "to-cloud" ? "cloud-toggle-mode-btn--switching" : ""}`}
          onClick={() => handleModeToggle("remote")}
          disabled={transitioning}
        >
          <Cloud size={16} />
          <span>Cloud</span>
          {transitionDirection === "to-cloud" && (
            <span className="cloud-toggle-mode-btn-transition-dot" />
          )}
        </button>
      </div>

      {showConfig && mode === "remote" && (
        <div className={`cloud-toggle-config ${transitioning ? "cloud-toggle-config--hidden" : ""}`}>
          <div className="cloud-toggle-config-inner">
            <div className="cloud-toggle-field">
              <label>Remote URL</label>
              <input
                type="url"
                value={remoteUrl}
                onChange={(e) => setRemoteUrl(e.target.value)}
                placeholder="http://192.168.1.100:8642"
              />
            </div>
            <div className="cloud-toggle-field">
              <label>API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Bearer token (API_SERVER_KEY)"
              />
            </div>
            <div className="cloud-toggle-actions">
              <button
                className="btn btn-secondary"
                onClick={handleTestConnection}
                disabled={testing || !remoteUrl}
              >
                {testing ? (
                  <>
                    <Loader2 size={14} className="cloud-toggle-btn-spinner" />
                    Testing...
                  </>
                ) : (
                  "Test"
                )}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSaveRemote}
                disabled={!remoteUrl || transitioning}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {statusMessage && status === "error" && (
        <div className="cloud-toggle-error">
          <AlertCircle size={12} />
          <span>{statusMessage}</span>
        </div>
      )}
      
      {/* Connection progress indicator */}
      {status === "connecting" && (
        <div className="cloud-toggle-progress">
          <div className="cloud-toggle-progress-bar" />
        </div>
      )}
    </div>
  );
}

export default CloudModeToggle;
