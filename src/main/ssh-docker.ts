import {
  sshExec,
  shellQuote,
  buildRemoteHermesCmd,
  REMOTE_HERMES_CLI_CANDIDATES,
  REMOTE_HERMES_LAUNCHER_CANDIDATES,
} from "./ssh-remote";
import type { SshConfig } from "./ssh-tunnel";

// Docker-backed Hermes installs (issue #432): a valid deployment where the
// Hermes Agent runs inside a container (Coolify, compose, NAS app stores) and
// the host has no `hermes` binary and no real `~/.hermes`. Instead of teaching
// every SSH code path about containers, Desktop provisions the two host-side
// artifacts the EXISTING SSH machinery already understands:
//
//   1. the per-user launcher hook (`~/.config/hermes-desktop/remote-hermes`,
//      first probe in buildRemoteHermesCmd) — a `docker exec` wrapper that
//      routes the Hermes CLI into the selected container, and
//   2. a `~/.hermes` symlink to the container's mounted data volume, so every
//      remote file read/write (config, .env, sessions, logs, profiles) sees
//      the real Hermes home.
//
// After provisioning, CLI execution, gateway lifecycle, dashboard ensure, and
// all file access work unchanged — no container plumbing in the core paths.

export const HERMES_DOCKER_IMAGE = "nousresearch/hermes-agent";

// Mount destination the official image keeps its Hermes home at.
export const HERMES_CONTAINER_DATA_DIR = "/opt/data";

// The launcher hook Desktop manages. First entry of the probe list so a
// provisioned Docker target wins over PATH fallbacks; the second entry stays
// reserved for user-managed wrappers.
const MANAGED_LAUNCHER_PATH = REMOTE_HERMES_LAUNCHER_CANDIDATES[0];

// Marker parsed back during inspection to show which container the hook
// currently routes to, and to distinguish Desktop-managed hooks from
// user-authored ones (which provisioning must not overwrite).
const LAUNCHER_MARKER_PREFIX = "# managed by Hermes Desktop (docker:";

// docker container names: [a-zA-Z0-9][a-zA-Z0-9_.-]*. Names reach us from
// `docker ps` output relayed through the renderer, so validate before
// embedding into any remote script.
export function isValidDockerContainerName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name);
}

export type {
  SshHermesDockerContainer,
  SshHermesTargetInspection,
  SshDockerProvisionResult,
} from "../shared/ssh-docker";
import type {
  SshHermesTargetInspection,
  SshDockerProvisionResult,
} from "../shared/ssh-docker";

function pythonJson(payload: unknown): string {
  return JSON.stringify(payload);
}

function sshPython(
  config: SshConfig,
  script: string,
  timeoutMs = 30000,
): Promise<string> {
  return sshExec(config, "python3 -", script, timeoutMs);
}

/**
 * The launcher hook provisioning writes to the remote. TTY flags mirror what
 * an interactive `ssh -t` session needs (`hermes setup`) while keeping
 * non-interactive pipes clean; HOME/HERMES_HOME pin the CLI to the container's
 * data dir regardless of the exec user's passwd entry.
 */
export function buildDockerLauncherScript(
  containerName: string,
  cliPath: string,
  execUser: string,
): string {
  if (!isValidDockerContainerName(containerName)) {
    throw new Error(`Invalid Docker container name: ${containerName}`);
  }
  const userArgs = execUser ? `-u ${shellQuote(execUser)} ` : "";
  return [
    "#!/bin/sh",
    `${LAUNCHER_MARKER_PREFIX}${containerName})`,
    "# Routes the Hermes CLI into the Docker container running Hermes Agent.",
    "# Regenerate from Hermes Desktop: Settings -> Connection -> SSH.",
    "set -eu",
    `container=${shellQuote(containerName)}`,
    'tty_args=""',
    'if [ -t 0 ] && [ -t 1 ]; then tty_args="-it"; elif [ -t 0 ]; then tty_args="-i"; fi',
    `exec docker exec $tty_args ${userArgs}-e HOME=${HERMES_CONTAINER_DATA_DIR} -e HERMES_HOME=${HERMES_CONTAINER_DATA_DIR} "$container" ${shellQuote(cliPath)} "$@"`,
    "",
  ].join("\n");
}

/**
 * Remote python that surveys the SSH target in one round trip: host install,
 * ~/.hermes state, launcher hook state, and running official Hermes
 * containers with their data mounts. Exported for unit tests.
 */
export function buildInspectSshHermesTargetCommand(
  remotePort?: number,
  selectedDockerContainerName = "",
): string {
  return `
import json, os, re, shutil, subprocess

remote_port = ${Number.isFinite(remotePort) ? String(remotePort) : "None"}
selected_name = ${pythonJson(selectedDockerContainerName)}
cli_candidates = ${pythonJson(REMOTE_HERMES_CLI_CANDIDATES)}
launcher_path = ${pythonJson(MANAGED_LAUNCHER_PATH)}
marker_prefix = ${pythonJson(LAUNCHER_MARKER_PREFIX)}
image_re = r"(^|/)nousresearch/hermes-agent(:|@|$)"

def run(args, timeout=8):
    try:
        return subprocess.run(
            args, check=False, text=True, capture_output=True, timeout=timeout
        ).stdout.strip()
    except Exception:
        return ""

def expanded(path):
    return os.path.expandvars(os.path.expanduser(path))

host_install_found = any(
    os.path.isfile(expanded(p)) and os.access(expanded(p), os.X_OK)
    for p in cli_candidates
)

home = expanded("$HOME/.hermes")
if os.path.islink(home):
    home_state, home_target = "symlink", os.readlink(home)
elif os.path.exists(home):
    home_state, home_target = "directory", None
else:
    home_state, home_target = "missing", None

host_home_found = home_state == "directory" and any(
    os.path.exists(os.path.join(home, name))
    for name in ("config.yaml", "state.db", ".env", "profiles")
)

launcher = expanded(launcher_path)
launcher_state, launcher_container = "missing", None
if os.path.isfile(launcher) and os.access(launcher, os.X_OK):
    launcher_state = "custom"
    try:
        with open(launcher) as f:
            head = f.read(4096)
        for line in head.splitlines():
            if line.startswith(marker_prefix) and line.endswith(")"):
                launcher_state = "docker"
                launcher_container = line[len(marker_prefix):-1]
                break
    except Exception:
        pass

def matches_published_port(ports, port):
    if not port:
        return False
    for entry in (ports or "").split(","):
        entry = entry.strip()
        if "->" not in entry:
            continue
        published = entry.split("->", 1)[0].strip()
        if published.rsplit(":", 1)[-1] == str(port):
            return True
    return False

containers, seen = [], set()
docker_available = bool(shutil.which("docker"))
if docker_available:
    ancestor_names = set(run([
        "docker", "ps",
        "--filter", "ancestor=" + ${pythonJson(HERMES_DOCKER_IMAGE)},
        "--format", "{{.Names}}",
    ]).splitlines())
    rows = run(["docker", "ps", "--format", "{{.ID}}\\t{{.Names}}\\t{{.Image}}\\t{{.Ports}}"])
    for row in rows.splitlines():
        parts = row.split("\\t", 3)
        if len(parts) < 4:
            continue
        cid, name, image, ports = parts
        if name in seen:
            continue
        if name not in ancestor_names and not re.search(image_re, image or ""):
            continue
        seen.add(name)
        data_home = run([
            "docker", "inspect", name, "--format",
            '{{range .Mounts}}{{if eq .Destination "' + ${pythonJson(
              HERMES_CONTAINER_DATA_DIR,
            )} + '"}}{{.Source}}{{end}}{{end}}',
        ])
        containers.append({
            "id": cid,
            "name": name,
            "image": image,
            "ports": ports,
            "dataHome": data_home,
            "matchesRemotePort": matches_published_port(ports, remote_port),
        })

print(json.dumps({
    "hostInstallFound": bool(host_install_found and host_home_found),
    "hermesHomeState": home_state,
    "hermesHomeTarget": home_target,
    "launcherState": launcher_state,
    "launcherContainerName": launcher_container,
    "dockerAvailable": docker_available,
    "dockerContainers": containers,
    "selectedDockerContainerName": selected_name,
}))
`.trim();
}

/** Map raw remote inspection JSON to a typed result. Exported for unit tests. */
export function parseSshHermesTargetInspection(
  raw: string,
  selectedDockerContainerName: string,
): SshHermesTargetInspection {
  const parsed = JSON.parse(raw.trim() || "{}") as Partial<
    SshHermesTargetInspection
  >;
  const dockerContainers = Array.isArray(parsed.dockerContainers)
    ? parsed.dockerContainers
    : [];
  const selected = selectedDockerContainerName.trim();
  const selectedContainerMissing =
    selected.length > 0 && !dockerContainers.some((c) => c.name === selected);
  const selectedContainer = dockerContainers.find((c) => c.name === selected);
  const missingDockerHome =
    selectedContainer !== undefined && !selectedContainer.dataHome;
  return {
    hostInstallFound: Boolean(parsed.hostInstallFound),
    hermesHomeState: parsed.hermesHomeState || "missing",
    hermesHomeTarget: parsed.hermesHomeTarget || null,
    launcherState: parsed.launcherState || "missing",
    launcherContainerName: parsed.launcherContainerName || null,
    dockerAvailable: Boolean(parsed.dockerAvailable),
    dockerContainers,
    selectedDockerContainerName: selected,
    error: selectedContainerMissing
      ? `Configured Hermes Docker container "${selected}" is not running or is not ${HERMES_DOCKER_IMAGE}`
      : missingDockerHome
        ? `Hermes Docker container "${selected}" has no host mount for ${HERMES_CONTAINER_DATA_DIR}`
        : undefined,
  };
}

export async function sshInspectHermesTarget(
  config: SshConfig,
  selectedDockerContainerName = "",
): Promise<SshHermesTargetInspection> {
  const selected = selectedDockerContainerName.trim();
  try {
    const out = await sshPython(
      config,
      buildInspectSshHermesTargetCommand(config.remotePort, selected),
      15000,
    );
    return parseSshHermesTargetInspection(out, selected);
  } catch (error) {
    return {
      hostInstallFound: false,
      hermesHomeState: "missing",
      hermesHomeTarget: null,
      launcherState: "missing",
      launcherContainerName: null,
      dockerAvailable: false,
      dockerContainers: [],
      selectedDockerContainerName: selected,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Remote python that validates one container and probes how to execute the
 * Hermes CLI inside it: which docker-exec user can use the data dir and where
 * the CLI lives. Read-only — writes happen in the apply step. Exported for
 * unit tests.
 */
export function buildProbeSshDockerTargetCommand(containerName: string): string {
  if (!isValidDockerContainerName(containerName)) {
    throw new Error(`Invalid Docker container name: ${containerName}`);
  }
  return `
import json, re, subprocess, sys

container = ${pythonJson(containerName)}
data_dir = ${pythonJson(HERMES_CONTAINER_DATA_DIR)}
image_name = ${pythonJson(HERMES_DOCKER_IMAGE)}
image_re = r"(^|/)nousresearch/hermes-agent(:|@|$)"
cli_candidates = ["/opt/hermes/.venv/bin/hermes", "/opt/hermes/venv/bin/hermes", "hermes"]

def fail(msg):
    print(json.dumps({"ok": False, "error": msg}))
    sys.exit(0)

def run(args, timeout=15):
    return subprocess.run(args, check=False, text=True, capture_output=True, timeout=timeout)

running = run(["docker", "ps", "--format", "{{.Names}}"])
if running.returncode != 0:
    fail("Docker is not available for this SSH user: " + (running.stderr.strip() or "docker ps failed"))
if container not in running.stdout.splitlines():
    fail('Container "%s" is not running.' % container)

image = run(["docker", "inspect", container, "--format", "{{.Config.Image}}"]).stdout.strip()
if not re.search(image_re, image):
    fail('Container "%s" does not run the official %s image (found: %s).' % (container, image_name, image or "unknown"))

data_home = run([
    "docker", "inspect", container, "--format",
    '{{range .Mounts}}{{if eq .Destination "' + data_dir + '"}}{{.Source}}{{end}}{{end}}',
]).stdout.strip()
if not data_home:
    fail('Container "%s" has no host mount for %s, so its Hermes home is not reachable over SSH.' % (container, data_dir))

# Resolve which docker-exec user can use the Hermes home inside the container:
# container default first, then the official image's service user.
exec_user, cli_path = None, None
for candidate_user in (None, "hermes"):
    user_args = ["-u", candidate_user] if candidate_user else []
    probe = run(["docker", "exec"] + user_args + [container, "sh", "-c", "test -r %s && test -w %s" % (data_dir, data_dir)])
    if probe.returncode != 0:
        continue
    for candidate_cli in cli_candidates:
        found = run(["docker", "exec"] + user_args + [container, "sh", "-c", "command -v %s" % candidate_cli])
        if found.returncode == 0 and found.stdout.strip():
            exec_user, cli_path = candidate_user or "", found.stdout.strip()
            break
    if cli_path:
        break
if cli_path is None:
    fail('Could not find a usable Hermes CLI inside container "%s".' % container)

print(json.dumps({"ok": True, "dataHome": data_home, "execUser": exec_user, "cliPath": cli_path}))
`.trim();
}

/**
 * Remote python that writes the launcher hook and the ~/.hermes symlink, then
 * verifies the launcher answers `--version`. Refuses to overwrite a
 * user-authored launcher or a real (non-empty) ~/.hermes directory. The
 * launcher script text is built locally (buildDockerLauncherScript) and passed
 * through as data. Exported for unit tests.
 */
export function buildApplySshDockerTargetCommand(
  launcherScript: string,
  dataHome: string,
): string {
  return `
import json, os, subprocess, sys, tempfile

launcher_path = ${pythonJson(MANAGED_LAUNCHER_PATH)}
marker_prefix = ${pythonJson(LAUNCHER_MARKER_PREFIX)}
launcher_script = ${pythonJson(launcherScript)}
data_home = ${pythonJson(dataHome)}
warnings = []

def fail(msg):
    print(json.dumps({"ok": False, "error": msg, "warnings": warnings}))
    sys.exit(0)

def expanded(path):
    return os.path.expandvars(os.path.expanduser(path))

launcher = expanded(launcher_path)
if os.path.exists(launcher):
    managed = False
    try:
        with open(launcher) as f:
            managed = any(line.startswith(marker_prefix) for line in f.read(4096).splitlines())
    except Exception:
        pass
    if not managed:
        fail("A custom launcher already exists at %s. Remove it or point it at the container yourself." % launcher)

os.makedirs(os.path.dirname(launcher), exist_ok=True)
fd, tmp = tempfile.mkstemp(dir=os.path.dirname(launcher))
with os.fdopen(fd, "w") as f:
    f.write(launcher_script)
os.chmod(tmp, 0o755)
os.replace(tmp, launcher)

home = expanded("$HOME/.hermes")
if os.path.islink(home):
    old = os.readlink(home)
    if os.path.realpath(home) != os.path.realpath(data_home):
        os.remove(home)
        os.symlink(data_home, home)
        warnings.append("Re-pointed the ~/.hermes symlink from %s to %s." % (old, data_home))
elif os.path.isdir(home):
    if os.listdir(home):
        fail("~/.hermes already exists as a real directory on the host. Move it aside (e.g. mv ~/.hermes ~/.hermes.host-backup) and set up again.")
    os.rmdir(home)
    os.symlink(data_home, home)
elif os.path.exists(home):
    fail("~/.hermes already exists and is not a directory or symlink.")
else:
    os.symlink(data_home, home)

version = subprocess.run([launcher, "--version"], check=False, text=True, capture_output=True, timeout=60)
if version.returncode != 0:
    fail("Launcher verification failed: " + (version.stderr.strip() or "hermes --version failed"))

if not os.path.exists(os.path.join(home, "config.yaml")):
    warnings.append("No config.yaml in the Hermes home yet - run setup once the connection is saved.")

print(json.dumps({"ok": True, "version": version.stdout.strip(), "warnings": warnings}))
`.trim();
}

export async function sshProvisionDockerTarget(
  config: SshConfig,
  containerName: string,
): Promise<SshDockerProvisionResult> {
  const name = containerName.trim();
  const failure = (error: string): SshDockerProvisionResult => ({
    ok: false,
    containerName: name,
    dataHome: "",
    execUser: "",
    cliPath: "",
    version: "",
    warnings: [],
    error,
  });
  if (!isValidDockerContainerName(name)) {
    return failure(`Invalid Docker container name: ${name}`);
  }
  try {
    const probeOut = await sshPython(
      config,
      buildProbeSshDockerTargetCommand(name),
      60000,
    );
    const probe = JSON.parse(probeOut.trim() || "{}") as {
      ok?: boolean;
      error?: string;
      dataHome?: string;
      execUser?: string;
      cliPath?: string;
    };
    if (!probe.ok || !probe.dataHome || !probe.cliPath) {
      return failure(probe.error || "Could not probe the Docker container.");
    }

    const launcherScript = buildDockerLauncherScript(
      name,
      probe.cliPath,
      probe.execUser || "",
    );
    const applyOut = await sshPython(
      config,
      buildApplySshDockerTargetCommand(launcherScript, probe.dataHome),
      90000,
    );
    const applied = JSON.parse(applyOut.trim() || "{}") as {
      ok?: boolean;
      error?: string;
      version?: string;
      warnings?: string[];
    };
    if (!applied.ok) {
      return {
        ...failure(applied.error || "Could not set up the Docker target."),
        dataHome: probe.dataHome,
        execUser: probe.execUser || "",
        cliPath: probe.cliPath,
        warnings: Array.isArray(applied.warnings) ? applied.warnings : [],
      };
    }

    // End-to-end check through the REAL runtime path: the same probe chain
    // every SSH feature uses must now resolve to the provisioned launcher.
    const version = await sshExec(
      config,
      buildRemoteHermesCmd(["--version"], " 2>/dev/null"),
      undefined,
      30000,
    );
    if (!version.trim()) {
      return failure(
        "Launcher was written but the Hermes CLI probe still returned nothing.",
      );
    }
    return {
      ok: true,
      containerName: name,
      dataHome: probe.dataHome,
      execUser: probe.execUser || "",
      cliPath: probe.cliPath,
      version: version.trim() || applied.version || "",
      warnings: Array.isArray(applied.warnings) ? applied.warnings : [],
    };
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
}
