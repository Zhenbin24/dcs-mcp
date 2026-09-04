#!/usr/bin/env node
// DCS Cloud MCP Server (v2: bootstrap-only)
//
// This MCP server handles ONLY bootstrap for the WorkBuddy Connector:
//   1. Download the dcs CLI binary for the current platform from GitHub
//      Releases (SHA256-verified, auto-updated to the latest release).
//   2. Log in with the Personal Access Token (PAT) the user pasted into the
//      WorkBuddy form (passed via the DCS_PAT env var, never argv).
// The single `dcs_setup` tool returns the binary path + version + login
// status. The host AI then runs dcs commands DIRECTLY in its terminal —
// login state persists in ~/.dcs/config.yaml and is shared with any dcs
// process of the same user, so no further MCP round-trips are needed.
// The 20 former wrapper tools were removed: the CLI is the API now
// (see skills/SKILL.md for the usage contract).

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
// Mirrors in priority order. China users hit Gitee first; on failure we fall
// back to GitHub. Each mirror carries a release base (WITHOUT the tag) and a
// version-check API. Asset names are identical across mirrors, so only the
// base differs.
const MIRRORS = [
  {
    name: "gitee",
    releaseBase: "https://gitee.com/caolei-bnu/dcs_cli/releases/download",
    versionApi: "https://gitee.com/api/v5/repos/caolei-bnu/dcs_cli/releases/latest",
  },
  {
    name: "github",
    releaseBase: "https://github.com/BGIResearch/dcs_cli/releases/download",
    versionApi: "https://api.github.com/repos/BGIResearch/dcs_cli/releases/latest",
  },
];

// Fallback tag when the version API is unreachable. Also the tag used when
// DCS_RELEASE_BASE pins a specific release (env override skips mirror selection
// AND version auto-update — the operator pinned a release on purpose).
const DEFAULT_TAG = "v1.2.0";

// Legacy override: if set, use this single source verbatim (it already includes
// the tag, e.g. ".../releases/download/v1.1.0"). Disables mirror selection and
// auto-update so an operator who pins a release isn't surprised by a switch.
const DCS_RELEASE_BASE = process.env.DCS_RELEASE_BASE || "";

// Per-platform asset names. Mac picks by CPU arch (Intel = amd64, Apple Silicon
// = arm64) so it runs natively without Rosetta. URL is built dynamically from
// the selected mirror + tag (see assetUrl).
const PLATFORM_ASSET = {
  win32: { name: "dcs.exe" },
  linux: { name: "dcs-linux-amd64" },
  darwin:
    process.arch === "arm64"
      ? { name: "dcs-darwin-arm64" }
      : { name: "dcs-darwin-amd64" },
};

const BIN_CACHE_DIR = path.join(os.homedir(), ".workbuddy", "connectors", "dcs-cloud", "bin");
const HASH_CACHE_FILE = path.join(BIN_CACHE_DIR, ".sha256");
const MIRROR_CACHE_FILE = path.join(BIN_CACHE_DIR, "mirror.cache");
const MIRROR_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

let DCS_BIN = null;
let activeMirror = null; // resolved on first use; see selectMirror()

function assetUrl(mirror, tag, assetName) {
  return `${mirror.releaseBase}/${tag}/${assetName}`;
}

// ---------------------------------------------------------------------------
// Mirror selection: pick the first reachable mirror in priority order, cache
// the choice for 24h so we don't re-probe on every startup. If every probe fails,
// returns the first mirror and lets the download throw a clear error. Skipped
// entirely when DCS_RELEASE_BASE is set (operator pinned a single source).
// ---------------------------------------------------------------------------
function loadCachedMirror() {
  try {
    if (!fs.existsSync(MIRROR_CACHE_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(MIRROR_CACHE_FILE, "utf-8"));
    if (Date.now() - raw.ts > MIRROR_CACHE_TTL_MS) return null;
    return MIRRORS.find((m) => m.name === raw.name) || null;
  } catch {
    return null;
  }
}

function saveCachedMirror(name) {
  try {
    fs.mkdirSync(BIN_CACHE_DIR, { recursive: true });
    fs.writeFileSync(MIRROR_CACHE_FILE, JSON.stringify({ name, ts: Date.now() }), "utf-8");
  } catch (e) {
    console.error(`[dcs-cloud] Failed to save mirror cache: ${e.message}`);
  }
}

// HEAD the SHA256SUMS for the default tag — small file, full TLS+CDN path.
async function probeMirror(mirror) {
  const url = assetUrl(mirror, DEFAULT_TAG, "SHA256SUMS");
  const res = await fetchWithRetry(url, { retries: 1, baseDelayMs: 300 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return mirror;
}

async function selectMirror() {
  if (activeMirror) return activeMirror;
  // 1) Trust a fresh cache hit — avoids re-probing on every startup.
  const cached = loadCachedMirror();
  if (cached) {
    activeMirror = cached;
    console.log(`[dcs-cloud] using cached mirror: ${cached.name}`);
    return cached;
  }
  // 2) No cache: probe mirrors in priority order, first OK wins.
  for (const m of MIRRORS) {
    try {
      await probeMirror(m);
      activeMirror = m;
      saveCachedMirror(m.name);
      console.log(`[dcs-cloud] selected mirror: ${m.name}`);
      return m;
    } catch (e) {
      console.error(`[dcs-cloud] mirror ${m.name} probe failed: ${e.message}`);
    }
  }
  // 3) All probes failed: use first mirror, let download surface the real error.
  activeMirror = MIRRORS[0];
  return activeMirror;
}

// ---------------------------------------------------------------------------
// Version check: query the active mirror's release API for the latest tag.
// Returns null on failure so callers fall back to DEFAULT_TAG.
// ---------------------------------------------------------------------------
async function fetchLatestVersion() {
  if (DCS_RELEASE_BASE) {
    // Operator pinned a release via env; don't second-guess it.
    return DCS_RELEASE_BASE.match(/\/v[\d.]+/)?.[0]?.slice(1) || DEFAULT_TAG;
  }
  const m = await selectMirror();
  try {
    const res = await fetchWithRetry(m.versionApi, { retries: 2, baseDelayMs: 300 });
    const data = await res.json();
    return data?.tag_name || null;
  } catch (e) {
    console.error(`[dcs-cloud] version check failed (${m.name}): ${e.message}`);
    return null;
  }
}

function getCachedHash() {
  try {
    if (fs.existsSync(HASH_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(HASH_CACHE_FILE, "utf-8"));
    }
  } catch {}
  return null;
}

function saveCachedHash({ asset, hash, tag }) {
  try {
    fs.writeFileSync(
      HASH_CACHE_FILE,
      JSON.stringify({ asset, hash, tag, ts: Date.now() }),
      "utf-8"
    );
  } catch (e) {
    console.error(`[dcs-cloud] Failed to save hash cache: ${e.message}`);
  }
}

function getCachedTag() {
  return getCachedHash()?.tag || null;
}

function hashPrefix(hex) {
  return hex ? `${hex.slice(0, 8)}...` : "unknown";
}

// Stream-read a file and return its SHA256 hex digest.
function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function getRemoteAssetHash(mirror, tag, assetName) {
  const sums = await fetchSha256Sums(mirror, tag);
  return sums.get(assetName) || null;
}

// Local hash: trust the .sha256 cache when it already matches the remote hash;
// otherwise stream-hash the binary on disk (source of truth).
async function getLocalAssetHash(filePath, assetName, remoteHash) {
  const cached = getCachedHash();
  if (
    cached?.asset === assetName &&
    cached?.hash &&
    remoteHash &&
    cached.hash === remoteHash &&
    fs.existsSync(filePath)
  ) {
    return cached.hash;
  }
  return sha256File(filePath);
}

// Retry a fetch with exponential backoff. Transient network blips shouldn't
// permanently block binary download / checksum verification.
async function fetchWithRetry(url, { retries = 3, baseDelayMs = 500 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw new Error(`fetch failed after ${retries + 1} attempts (${url}): ${lastErr}`);
}

// Fetch SHA256SUMS from the given mirror+tag and parse into Map<assetName, sha256Hex>.
// Format per line: "<64-hex-hash>  <filename>" (GNU coreutils; tolerate 1-2 spaces,
// optional leading "*" binary-mode marker, blank/comment lines). MUST be fetched
// from the same mirror as the binary so the hashes actually match the bytes.
async function fetchSha256Sums(mirror, tag) {
  const url = assetUrl(mirror, tag, "SHA256SUMS");
  const res = await fetchWithRetry(url);
  const text = await res.text();
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
    if (m) map.set(m[2], m[1].toLowerCase());
  }
  return map;
}

// Download the dcs binary for the current platform if not already cached.
// Verifies the SHA256 against the release's SHA256SUMS before writing to disk;
// a mismatch (tampering / corruption) is refused — the buffer never lands on
// disk and is never executed.
//
// Auto-update: resolves the latest release tag, fetches the remote SHA256 for
// this platform's asset, and compares it to the cached binary. Download only
// when the local file is missing or its hash differs — including same-tag
// hotfixes where the version string does not change.
//
// Mirror fallback: tries the primary mirror first; on download/hash failure,
// switches to the other mirror and retries once. This is the "static priority
// + failure fallback" scheme — China users hit Gitee first, fall back to
// GitHub only when Gitee is unreachable.
async function ensureDcsBinary() {
  if (DCS_BIN) return DCS_BIN;
  const p = PLATFORM_ASSET[process.platform];
  if (!p) {
    throw new Error(`Unsupported platform: ${process.platform}. Supported: win32, linux, darwin.`);
  }

  const target = path.join(BIN_CACHE_DIR, p.name);
  const tempTarget = `${target}.download`;
  fs.mkdirSync(BIN_CACHE_DIR, { recursive: true });

  const latestVersion = await fetchLatestVersion();
  const tag = latestVersion || DEFAULT_TAG;

  // Build the ordered list of mirrors to try. Under DCS_RELEASE_BASE (legacy
  // pin), we synthesize a single-source mirror so the rest of the flow is
  // uniform. Otherwise: primary first, then the other mirror as fallback.
  let mirrorsToTry;
  if (DCS_RELEASE_BASE) {
    mirrorsToTry = [{ name: "pinned", releaseBase: DCS_RELEASE_BASE.replace(/\/v[\d.]+$/, ""), versionApi: "" }];
  } else {
    const primary = await selectMirror();
    const fallback = MIRRORS.find((m) => m.name !== primary.name);
    mirrorsToTry = fallback ? [primary, fallback] : [primary];
  }

  // Hash check: fetch remote SHA256 for the latest tag and compare to local.
  let remoteHash = null;
  let hashMirror = null;
  for (const m of mirrorsToTry) {
    try {
      remoteHash = await getRemoteAssetHash(m, tag, p.name);
      if (remoteHash) {
        hashMirror = m;
        break;
      }
    } catch (e) {
      console.error(`[dcs-cloud] remote hash check from ${m.name} failed: ${e.message}`);
    }
  }

  if (remoteHash && fs.existsSync(target)) {
    try {
      const localHash = await getLocalAssetHash(target, p.name, remoteHash);
      if (localHash === remoteHash) {
        saveCachedHash({ asset: p.name, hash: localHash, tag });
        if (hashMirror && !DCS_RELEASE_BASE) {
          activeMirror = hashMirror;
          saveCachedMirror(hashMirror.name);
        }
        console.log(
          `[dcs-cloud] dcs binary up to date (${tag}, sha256 ${hashPrefix(localHash)})`
        );
        DCS_BIN = target;
        return DCS_BIN;
      }
      console.log(
        `[dcs-cloud] Updating dcs binary (sha256 ${hashPrefix(localHash)} → ${hashPrefix(remoteHash)})`
      );
    } catch (e) {
      console.error(`[dcs-cloud] local hash check failed: ${e.message}`);
    }
  } else if (!fs.existsSync(target)) {
    console.log(`[dcs-cloud] dcs binary not cached, downloading ${p.name} (${tag})`);
  } else if (!remoteHash) {
    console.error(`[dcs-cloud] could not fetch remote hash for ${tag}; continuing with cached binary`);
    DCS_BIN = target;
    return DCS_BIN;
  }

  // Download when missing or hash differs. Try each mirror in order.
  let lastErr;
  for (const m of mirrorsToTry) {
    try {
      const buf = await downloadAndVerify(m, tag, p.name);
      // Write to a temp file first; only replace the live binary after verify
      // succeeds so a failed download never leaves the user without dcs.
      await fs.promises.writeFile(tempTarget, buf);
      if (process.platform !== "win32") fs.chmodSync(tempTarget, 0o755);
      try {
        if (fs.existsSync(target)) fs.unlinkSync(target);
      } catch (e) {
        await fs.promises.unlink(tempTarget).catch(() => {});
        throw new Error(`Failed to replace old binary: ${e.message}`);
      }
      fs.renameSync(tempTarget, target);

      const verifiedHash = crypto.createHash("sha256").update(buf).digest("hex");
      const currentVersion = latestVersion || tag || "unknown";
      saveCachedHash({ asset: p.name, hash: verifiedHash, tag: currentVersion });
      // Persist the winning mirror so next startup skips the probe.
      if (!DCS_RELEASE_BASE) {
        activeMirror = m;
        saveCachedMirror(m.name);
      }
      console.log(`[dcs-cloud] Downloaded dcs ${currentVersion} (${p.name}) from ${m.name}`);
      DCS_BIN = target;
      return DCS_BIN;
    } catch (e) {
      console.error(`[dcs-cloud] download from ${m.name} failed: ${e.message}`);
      lastErr = e;
      try {
        if (fs.existsSync(tempTarget)) fs.unlinkSync(tempTarget);
      } catch {}
    }
  }

  // Download failed: keep serving the previous binary if we still have one.
  if (fs.existsSync(target)) {
    console.error(
      `[dcs-cloud] Update to ${tag} failed; continuing with cached binary`
    );
    DCS_BIN = target;
    return DCS_BIN;
  }

  throw new Error(
    `Failed to download dcs binary from any mirror. Last error: ${lastErr?.message || lastErr}`
  );
}

// Download one asset + its SHA256SUMS from the same mirror, verify the hash,
// and return the verified buffer. Throws on any failure (network, missing
// hash entry, hash mismatch) so the caller can fall back to the next mirror.
async function downloadAndVerify(mirror, tag, assetName) {
  // 1) Download binary into an in-memory buffer (with retry).
  const res = await fetchWithRetry(assetUrl(mirror, tag, assetName));
  const buf = Buffer.from(await res.arrayBuffer());

  // 2) Fetch + parse SHA256SUMS from the SAME mirror (with retry).
  const sums = await fetchSha256Sums(mirror, tag);
  const expected = sums.get(assetName);
  if (!expected) {
    throw new Error(
      `SHA256SUMS does not contain an entry for "${assetName}". Refusing to execute unverified binary.`
    );
  }

  // 3) Verify hash. On mismatch: do NOT write, do NOT chmod, do NOT cache.
  const actual = crypto.createHash("sha256").update(buf).digest("hex");
  if (actual !== expected) {
    throw new Error(
      `dcs binary SHA256 mismatch for ${assetName}: expected ${expected}, got ${actual}. ` +
      `Possible tampering or corrupted download. Refusing to execute.`
    );
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
// Sanitize subprocess output before folding it into an error message that gets
// returned to the AI: (1) redact anything that looks like a PAT or bearer token,
// (2) truncate to keep error messages bounded. dcs CLI errors occasionally echo
// the token or internal URLs; without this they'd be sent to the LLM.
const REDACT_PATTERNS = [
  /dcs_pat_[A-Za-z0-9_\-]+/g,        // DCS Personal Access Token (dcs_pat_ prefix)
  /Bearer\s+[A-Za-z0-9_\-\.=]+/g,    // HTTP bearer tokens
  /--token\s+\S+/g,                  // any leaked --token <value> argv echo
];
const MAX_ERR_LEN = 500;
function sanitizeOutput(s) {
  let out = s == null ? "" : String(s);
  for (const re of REDACT_PATTERNS) out = out.replace(re, "***REDACTED***");
  if (out.length > MAX_ERR_LEN) out = out.slice(0, MAX_ERR_LEN) + "...(truncated)";
  return out;
}

// Default per-subprocess timeout (ms). Guards against the dcs CLI hanging on
// network issues or deadlocks — without this, a stuck child would block the
// MCP server forever (mcp.json's timeout only covers the MCP protocol layer,
// not the spawned subprocess). Override per-call via opts.timeout.
const DEFAULT_CMD_TIMEOUT_MS = 30000;

function runCmd(bin, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: { ...process.env, ...(opts.env || {}) },
      ...opts.spawnOpts,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = opts.timeout ?? DEFAULT_CMD_TIMEOUT_MS;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      // SIGTERM first; escalate to SIGKILL after a 2s grace period if it survives.
      try { child.kill("SIGTERM"); } catch {}
      setTimeout(() => {
        if (!child.killed) {
          try { child.kill("SIGKILL"); } catch {}
        }
      }, 2000);
      resolve({
        code: -1,
        stdout,
        stderr: `command timed out after ${timeout}ms: ${bin} ${args.join(" ")}`,
        timedOut: true,
      });
    }, timeout);
    // Keep the timer from keeping the event loop alive if the process exits fast.
    timer.unref?.();
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (e) => finish({ code: -1, stdout, stderr: String(e) }));
    child.on("close", (code) => finish({ code, stdout, stderr }));
  });
}

// ---- auth status (dcs has no `auth status`; use `config show` token_status) ----
async function dcsAuthStatus() {
  try {
    if (!DCS_BIN) await ensureDcsBinary();
    const { code, stdout } = await runCmd(DCS_BIN, ["config", "show", "--output", "json", "--no-history"]);
    if (code !== 0) return false;
    const status = JSON.parse(stdout.trim())?.data?.token_status;
    return !!status && status !== "none";
  } catch {
    return false;
  }
}

// Login via DCS_PAT env var. We deliberately do NOT pass --token <PAT>: that
// would put the PAT in the child process argv, leaking it via `ps` / process
// explorers / audit logs. The dcs CLI reads DCS_PAT from env when no token
// argument is supplied (per `dcs auth login --help`: "No PAT arg -> reads
// DCS_PAT env var"). runCmd already inherits process.env into the child, so
// DCS_PAT is visible to dcs without ever touching argv.
async function dcsLogin() {
  if (!DCS_BIN) await ensureDcsBinary();
  const { code, stdout, stderr } = await runCmd(DCS_BIN, [
    "auth", "login", "--output", "json", "--no-history",
  ]);
  if (code !== 0) {
    throw new Error(`dcs auth login failed: ${sanitizeOutput(stderr || stdout)}`.trim());
  }
}

// ---- one-time bootstrap ----
// bootstrapped: login succeeded at least once; skip re-auth on subsequent calls.
// bootstrapError: only caches NON-retryable errors (e.g. DCS_PAT env not set),
// since a missing env var won't change without a process restart. Login failures
// (wrong PAT, network blip) are NOT cached so the user can correct the PAT in
// the WorkBuddy form and retry within the same session without restarting.
let bootstrapped = false;
let bootstrapError = null;
async function ensureAuth() {
  if (bootstrapError) throw bootstrapError;
  if (bootstrapped) return;
  if (await dcsAuthStatus()) {
    bootstrapped = true;
    return;
  }
  const pat = process.env.DCS_PAT;
  if (!pat) {
    bootstrapError = new Error(
      "DCS_PAT is not set. Please create a Personal Access Token in DCS Cloud and paste it into the WorkBuddy connector form."
    );
    throw bootstrapError;
  }
  // Intentionally NOT caching login errors: if dcsLogin throws, bootstrapped
  // stays false and the next call retries — so a corrected PAT takes effect
  // without restarting the server.
  await dcsLogin();
  bootstrapped = true;
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// The only tool. After it succeeds, the AI runs the dcs CLI directly in its
// terminal for ALL operations — login state lives in ~/.dcs/config.yaml and is
// shared with any dcs process of the same user.
const TOOLS = [
  {
    name: "dcs_setup",
    description:
      "Bootstrap the dcs CLI: download/update the platform binary (SHA256-verified, " +
      "auto-updates to the latest release — tries Gitee first then falls back to GitHub) " +
      "and log in with the configured PAT. Returns the binary path, version, and login " +
      "status. After this succeeds, run dcs commands directly in the terminal (always " +
      "append --output json --no-history).",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: async () => {
      await ensureDcsBinary();
      await ensureAuth();
      const p = PLATFORM_ASSET[process.platform];
      const binPath = path.join(BIN_CACHE_DIR, p.name);
      return {
        ok: true,
        bin_path: binPath,
        version: getCachedTag() || "unknown",
        logged_in: true,
        usage:
          `Run "<bin_path> <subcommand> --output json --no-history" in the terminal for all ` +
          `DCS Cloud operations. Quote the path if it contains spaces (Windows: ` +
          `& "C:\\...\\dcs.exe" project ls --output json --no-history).`,
      };
    },
  },
];

function toContent(result) {
  let text;
  if (result === null || result === undefined) text = "(no output)";
  else if (typeof result === "string") text = result;
  else text = JSON.stringify(result, null, 2);
  return { content: [{ type: "text", text }] };
}

async function main() {
  // Pre-download the dcs binary at startup so dcs_setup responds fast.
  try {
    await ensureDcsBinary();
  } catch (e) {
    console.error(`[dcs-cloud-mcp] binary download failed: ${e.message}`);
    // Continue starting the server; dcs_setup will surface a clear error.
  }
  const server = new Server(
    { name: "dcs-cloud-mcp-server", version: "2.0.2" },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    try {
      const result = await tool.handler(args || {});
      return toContent(result);
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message || String(e)}` }], isError: true };
    }
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[dcs-cloud-mcp] ready (bootstrap-only mode)");
}

main().catch((e) => {
  console.error("[dcs-cloud-mcp] fatal:", e);
  process.exit(1);
});
