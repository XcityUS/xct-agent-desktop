import type { ConnectionConfig, SshConnectionConfig } from "./config";

type StartResult = { success: boolean; error?: string };

export interface OfficeStartDependencies {
  getConnectionConfig: () => ConnectionConfig;
  isGatewayRunning: (profile?: string) => boolean;
  startGateway: (profile?: string) => boolean;
  sshGatewayStatus: (config: SshConnectionConfig) => Promise<boolean>;
  sshStartGateway: (config: SshConnectionConfig) => Promise<void>;
  startSshTunnel: (config: SshConnectionConfig) => Promise<void>;
  stopSshTunnel: () => void;
  sshReadRemoteApiKey: (config: SshConnectionConfig) => Promise<string>;
  setSshRemoteApiKey: (key: string) => void;
  startClaw3dAll: () => StartResult;
  stopClaw3dAll: () => void;
  waitForClaw3dReady: () => Promise<boolean>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function startOfficeStack(
  profile: string | undefined,
  deps: OfficeStartDependencies,
): Promise<StartResult> {
  let sshTunnelStarted = false;
  try {
    const conn = deps.getConnectionConfig();

    if (conn.mode === "ssh") {
      if (!(await deps.sshGatewayStatus(conn.ssh))) {
        await deps.sshStartGateway(conn.ssh);
      }
      await deps.startSshTunnel(conn.ssh);
      sshTunnelStarted = true;
      deps.setSshRemoteApiKey(await deps.sshReadRemoteApiKey(conn.ssh));
    } else if (conn.mode === "local" && !deps.isGatewayRunning(profile)) {
      deps.startGateway(profile);
    }

    const result = deps.startClaw3dAll();
    if (!result.success) return result;

    if (
      (conn.mode === "local" || conn.mode === "ssh") &&
      !(await deps.waitForClaw3dReady())
    ) {
      deps.stopClaw3dAll();
      if (conn.mode === "ssh" && sshTunnelStarted) {
        deps.stopSshTunnel();
      }
      return {
        success: false,
        error:
          "Office started but did not become ready in time. Check Office logs and try again.",
      };
    }

    return result;
  } catch (error) {
    if (sshTunnelStarted) {
      deps.stopSshTunnel();
    }
    return { success: false, error: errorMessage(error) };
  }
}
