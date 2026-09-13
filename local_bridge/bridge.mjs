const renderBase = String(process.env.HQUINN_RENDER_URL || "").trim().replace(/\/+$/, "");
const bridgeToken = String(process.env.HQUINN_BRIDGE_TOKEN || "").trim();
const localBase = String(process.env.HQUINN_LOCAL_URL || "http://127.0.0.1:8765").trim().replace(/\/+$/, "");
const mode = String(process.env.HQUINN_BRIDGE_MODE || "echo").trim().toLowerCase();
const version = "0.1.0";

if (!/^https:\/\//i.test(renderBase) && process.env.HQUINN_ALLOW_HTTP !== "1") {
  throw new Error("HQUINN_RENDER_URL must use HTTPS.");
}
if (bridgeToken.length < 32) throw new Error("HQUINN_BRIDGE_TOKEN is missing or too short.");
if (!new Set(["echo", "live"]).has(mode)) throw new Error("HQUINN_BRIDGE_MODE must be echo or live.");

let stopping = false;
let consecutiveErrors = 0;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function request(path, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${renderBase}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${bridgeToken}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    if (response.status === 204) return null;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Relay returned HTTP ${response.status}.`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function bridgeIdentity() {
  return { mode, version };
}

function echoResult(message) {
  return {
    assistant: {
      title: "Secure relay confirmed.",
      message: `The connector running on your laptop received this message from Render and returned the response successfully.\n\nReceived: “${message}”`,
    },
    packageCandidates: [],
    configuration: {
      primary: [{
        name: "Hosted-to-local bridge handshake",
        sku: "DEMO-ONLY",
        quantity: 1,
        status: "Connection verified",
        reason: "This is a transport test and not a product recommendation.",
        evidence: ["Local bridge echo mode"],
      }],
      supporting: [],
      tertiary: [],
    },
    alternatives: [],
    validationGates: ["No customer, quote, SKU, or private evidence was used in this test."],
    evidence: [{
      source: "Connection-only test",
      locator: "Local bridge",
      authority: "Demo",
      supports: "Render-to-laptop round-trip connectivity",
    }],
    unknowns: [],
    demo: { mode: "Connection-only echo" },
  };
}

async function liveResult(jobRequest) {
  const localRequest = {
    sessionId: String(jobRequest?.sessionId || "").slice(0, 80),
    message: String(jobRequest?.message || "").slice(0, 8000),
    workspaceState: jobRequest?.workspaceState && typeof jobRequest.workspaceState === "object"
      ? jobRequest.workspaceState
      : {},
  };
  if (!localRequest.sessionId || !localRequest.message) {
    throw new Error("The relay supplied an invalid local-intelligence request.");
  }
  const health = await fetch(`${localBase}/api/health`, { cache: "no-store" });
  if (!health.ok) throw new Error("The local intelligence service is not available.");
  const response = await fetch(`${localBase}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(localRequest),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Local intelligence returned HTTP ${response.status}.`);
  return body;
}

async function processJob(job) {
  console.log(`Claimed job ${job.jobId.slice(0, 8)} in ${mode} mode.`);
  const heartbeatTimer = setInterval(() => {
    request("/bridge/heartbeat", {
      method: "POST",
      body: JSON.stringify(bridgeIdentity()),
    }, 15000).catch(() => {});
  }, 8000);
  try {
    const result = mode === "echo"
      ? echoResult(job.request.message)
      : await liveResult(job.request);
    await request(`/bridge/jobs/${encodeURIComponent(job.jobId)}/result`, {
      method: "POST",
      body: JSON.stringify({ ok: true, result, bridge: bridgeIdentity() }),
    });
    console.log(`Completed job ${job.jobId.slice(0, 8)}.`);
  } catch (error) {
    const message = error?.message || String(error);
    console.error(`Job ${job.jobId.slice(0, 8)} failed: ${message}`);
    await request(`/bridge/jobs/${encodeURIComponent(job.jobId)}/result`, {
      method: "POST",
      body: JSON.stringify({ ok: false, error: message, bridge: bridgeIdentity() }),
    }).catch((reportError) => console.error(`Could not report failure: ${reportError.message}`));
  } finally {
    clearInterval(heartbeatTimer);
  }
}

async function loop() {
  console.log(`HQuinn laptop bridge ${version}`);
  console.log(`Render: ${renderBase}`);
  console.log(`Mode: ${mode === "echo" ? "connection-only (no private data)" : "live local intelligence"}`);
  console.log("Press Ctrl+C to stop.\n");
  while (!stopping) {
    try {
      const job = await request("/bridge/claim", {
        method: "POST",
        body: JSON.stringify(bridgeIdentity()),
      });
      consecutiveErrors = 0;
      if (job) await processJob(job);
      else await delay(1500);
    } catch (error) {
      consecutiveErrors += 1;
      const waitMs = Math.min(30000, 1000 * (2 ** Math.min(consecutiveErrors, 5)));
      console.error(`Bridge connection failed: ${error?.message || error}. Retrying in ${Math.round(waitMs / 1000)}s.`);
      await delay(waitMs);
    }
  }
}

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

await loop();

