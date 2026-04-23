import { useState, useCallback, useEffect } from "react";
import Chat, { ChatMessage } from "../Chat/Chat";
import Sessions from "../Sessions/Sessions";
import Agents from "../Agents/Agents";
import Settings from "../Settings/Settings";
import Skills from "../Skills/Skills";
import Soul from "../Soul/Soul";
import Memory from "../Memory/Memory";
import Tools from "../Tools/Tools";
import Gateway from "../Gateway/Gateway";
import Office from "../Office/Office";
import Models from "../Models/Models";
import Schedules from "../Schedules/Schedules";
import RemoteNotice from "../../components/RemoteNotice";
import hermeslogo from "../../assets/xct-agent.png";
import {
  ChatBubble,
  Clock,
  Users,
  Settings as SettingsIcon,
  Puzzle,
  Sparkles,
  Brain,
  Wrench,
  Signal,
  Building,
  Layers,
  Timer,
  Download,
} from "../../assets/icons";
import type { LucideIcon } from "lucide-react";

type View =
  | "chat"
  | "sessions"
  | "agents"
  | "office"
  | "models"
  | "skills"
  | "soul"
  | "memory"
  | "tools"
  | "schedules"
  | "gateway"
  | "settings";

const NAV_ITEMS: { view: View; icon: LucideIcon; label: string }[] = [
  { view: "chat", icon: ChatBubble, label: "Chat" },
  { view: "sessions", icon: Clock, label: "Sessions" },
  { view: "agents", icon: Users, label: "Profiles" },
  { view: "office", icon: Building, label: "Office" },
  { view: "models", icon: Layers, label: "Models" },
  { view: "skills", icon: Puzzle, label: "Skills" },
  { view: "soul", icon: Sparkles, label: "Persona" },
  { view: "memory", icon: Brain, label: "Memory" },
  { view: "tools", icon: Wrench, label: "Tools" },
  { view: "schedules", icon: Timer, label: "Schedules" },
  { view: "gateway", icon: Signal, label: "Gateway" },
  { view: "settings", icon: SettingsIcon, label: "Settings" },
];

function Layout(): React.JSX.Element {
  const [view, setView] = useState<View>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [activeProfile, setActiveProfile] = useState("default");
  // Lazy mount: only render Office after first visit, then keep mounted
  const [officeVisited, setOfficeVisited] = useState(false);
  // Remote mode — many screens show "not available" instead of empty data
  const [remoteMode, setRemoteMode] = useState(false);

  // Re-check remote mode on tab switch (picks up Settings changes)
  useEffect(() => {
    window.hermesAPI.isRemoteMode().then(setRemoteMode);
  }, [view]);

  // Auto-update state
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<
    "available" | "downloading" | "ready" | null
  >(null);
  const [downloadPercent, setDownloadPercent] = useState(0);

  useEffect(() => {
    const cleanupAvailable = window.hermesAPI.onUpdateAvailable((info) => {
      setUpdateVersion(info.version);
      setUpdateState("available");
    });
    const cleanupProgress = window.hermesAPI.onUpdateDownloadProgress(
      (info) => {
        setDownloadPercent(info.percent);
      },
    );
    const cleanupDownloaded = window.hermesAPI.onUpdateDownloaded(() => {
      setUpdateState("ready");
    });
    return () => {
      cleanupAvailable();
      cleanupProgress();
      cleanupDownloaded();
    };
  }, []);

  async function handleUpdate(): Promise<void> {
    if (updateState === "available") {
      setUpdateState("downloading");
      await window.hermesAPI.downloadUpdate();
    } else if (updateState === "ready") {
      await window.hermesAPI.installUpdate();
    }
  }

  const handleNewChat = useCallback(() => {
    // Abort any in-flight chat before clearing
    window.hermesAPI.abortChat();
    setMessages([]);
    setCurrentSessionId(null);
    setView("chat");
  }, []);

  // Listen for menu IPC events (Cmd+N, Cmd+K from app menu)
  useEffect(() => {
    const cleanupNewChat = window.hermesAPI.onMenuNewChat(() => {
      handleNewChat();
    });
    const cleanupSearch = window.hermesAPI.onMenuSearchSessions(() => {
      setView("sessions");
    });
    return () => {
      cleanupNewChat();
      cleanupSearch();
    };
  }, [handleNewChat]);

  const handleSelectProfile = useCallback((name: string) => {
    setActiveProfile(name);
    setMessages([]);
    setCurrentSessionId(null);
  }, []);

  const handleResumeSession = useCallback(async (sessionId: string) => {
    const dbMessages = await window.hermesAPI.getSessionMessages(sessionId);
    const chatMessages: ChatMessage[] = dbMessages.map((m) => ({
      id: `db-${m.id}`,
      role: m.role === "user" ? "user" : "agent",
      content: m.content,
    }));
    setMessages(chatMessages);
    setCurrentSessionId(sessionId);
    setView("chat");
  }, []);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src={hermeslogo} height={30} alt="" />
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(({ view: v, icon: Icon, label }) => (
            <button
              key={v}
              className={`sidebar-nav-item ${view === v ? "active" : ""}`}
              onClick={() => {
                if (v === "office") setOfficeVisited(true);
                setView(v);
              }}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          {updateState && (
            <button className="sidebar-update-btn" onClick={handleUpdate}>
              <Download size={13} />
              {updateState === "available" && (
                <span>Update v{updateVersion}</span>
              )}
              {updateState === "downloading" && (
                <span>Downloading {downloadPercent}%</span>
              )}
              {updateState === "ready" && <span>Restart to update</span>}
            </button>
          )}
          <div className="sidebar-footer-text">
            {activeProfile === "default" ? "Hermes Agent" : activeProfile}
          </div>
        </div>
      </aside>

      <main className="content">
        <div
          style={{
            display: view === "chat" ? "flex" : "none",
            flex: 1,
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <Chat
            messages={messages}
            setMessages={setMessages}
            sessionId={currentSessionId}
            profile={activeProfile}
            onNewChat={handleNewChat}
          />
        </div>
        {view === "sessions" &&
          (remoteMode ? (
            <RemoteNotice feature="Sessions" />
          ) : (
            <Sessions
              onResumeSession={handleResumeSession}
              onNewChat={handleNewChat}
              currentSessionId={currentSessionId}
            />
          ))}
        {view === "agents" &&
          (remoteMode ? (
            <RemoteNotice feature="Profiles" />
          ) : (
            <Agents
              activeProfile={activeProfile}
              onSelectProfile={handleSelectProfile}
              onChatWith={(name: string) => {
                handleSelectProfile(name);
                setView("chat");
              }}
            />
          ))}
        {officeVisited && (
          <div
            style={{
              display: view === "office" ? "flex" : "none",
              flex: 1,
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <Office visible={view === "office"} />
          </div>
        )}
        {view === "models" && <Models />}
        {view === "skills" &&
          (remoteMode ? (
            <RemoteNotice feature="Skills" />
          ) : (
            <Skills profile={activeProfile} />
          ))}
        {view === "soul" &&
          (remoteMode ? (
            <RemoteNotice feature="Persona" />
          ) : (
            <Soul profile={activeProfile} />
          ))}
        {view === "memory" &&
          (remoteMode ? (
            <RemoteNotice feature="Memory" />
          ) : (
            <Memory profile={activeProfile} />
          ))}
        {view === "tools" &&
          (remoteMode ? (
            <RemoteNotice feature="Tools" />
          ) : (
            <Tools profile={activeProfile} />
          ))}
        {view === "schedules" &&
          (remoteMode ? (
            <RemoteNotice feature="Schedules" />
          ) : (
            <Schedules profile={activeProfile} />
          ))}
        {view === "gateway" &&
          (remoteMode ? (
            <RemoteNotice feature="Gateway" />
          ) : (
            <Gateway profile={activeProfile} />
          ))}
        <div
          style={{
            display: view === "settings" ? "flex" : "none",
            flex: 1,
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <Settings profile={activeProfile} visible={view === "settings"} />
        </div>
      </main>
    </div>
  );
}

export default Layout;
