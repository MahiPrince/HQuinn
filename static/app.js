const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
const statusChip = document.querySelector("#bridge-status");
const sendButton = document.querySelector("#send-button");
const messageInput = document.querySelector("#message");
const helperText = document.querySelector("#helper-text");
const resultCard = document.querySelector("#result-card");
const resultKicker = document.querySelector("#result-kicker");
const resultTitle = document.querySelector("#result-title");
const resultMessage = document.querySelector("#result-message");
const resultDetails = document.querySelector("#result-details");
const browserSessionId = localStorage.getItem("hquinn-demo-session") || crypto.randomUUID().replaceAll("-", "");
localStorage.setItem("hquinn-demo-session", browserSessionId);

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
  return body;
}

function setBridgeStatus(online, mode) {
  statusChip.classList.toggle("online", online);
  statusChip.classList.toggle("offline", !online);
  statusChip.innerHTML = `<span class="status-dot"></span>${online ? (mode === "echo" ? "Laptop connected · safe test" : "Local intelligence connected") : "Laptop bridge offline"}`;
}

async function refreshHealth() {
  try {
    const health = await jsonFetch("/api/health");
    setBridgeStatus(Boolean(health.bridge?.online), health.bridge?.mode);
  } catch {
    setBridgeStatus(false, "offline");
  }
}

function showProgress(status) {
  resultCard.classList.remove("hidden");
  resultKicker.textContent = status === "queued" ? "Queued on Render" : "Processing on your laptop";
  resultTitle.textContent = status === "queued" ? "Waiting for the laptop bridge." : "The round trip is in progress.";
  resultMessage.textContent = status === "queued"
    ? "The hosted service accepted the request and is waiting for the outbound connector."
    : "The connector claimed the job and is preparing the response.";
  resultDetails.replaceChildren();
}

function detailTile(title, text) {
  const tile = document.createElement("div");
  tile.className = "detail-tile";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const span = document.createElement("span");
  span.textContent = text;
  tile.append(strong, span);
  return tile;
}

function showResult(result) {
  const assistant = result?.assistant || {};
  resultKicker.textContent = "Round trip complete";
  resultTitle.textContent = assistant.title || "The local connector responded.";
  resultMessage.textContent = assistant.message || JSON.stringify(result, null, 2);
  const primary = result?.configuration?.primary?.length || 0;
  const supporting = result?.configuration?.supporting?.length || 0;
  const gates = result?.validationGates?.length || 0;
  resultDetails.replaceChildren(
    detailTile("Path", "Render → laptop → Render"),
    detailTile("Mode", result?.demo?.mode || "Local intelligence"),
    detailTile("Structured output", `${primary} primary · ${supporting} supporting · ${gates} validation gates`),
  );
}

function showError(error) {
  resultCard.classList.remove("hidden");
  resultKicker.textContent = "Test stopped";
  resultTitle.textContent = "The relay did not complete.";
  resultMessage.textContent = error.message || String(error);
  resultDetails.replaceChildren();
}

async function waitForJob(jobId) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const job = await jsonFetch(`/api/jobs/${jobId}`);
    if (job.status === "complete") return job.result;
    if (job.status === "failed") throw new Error(job.error || "The laptop bridge reported an error.");
    showProgress(job.status);
    await sleep(1000);
  }
  throw new Error("The demo timed out while waiting for the laptop.");
}

async function runTest() {
  const message = messageInput.value.trim();
  if (!message) return;
  sendButton.disabled = true;
  messageInput.disabled = true;
  helperText.textContent = "Submitting the test job…";
  try {
    const created = await jsonFetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify({
        sessionId: browserSessionId,
        message,
        workspaceState: { demo: true },
      }),
    });
    showProgress(created.status);
    const result = await waitForJob(created.jobId);
    showResult(result);
    helperText.textContent = "Connection verified. The same bridge can now be switched to local Codex mode.";
    await refreshHealth();
  } catch (error) {
    showError(error);
    helperText.textContent = "Check the hosted service and local bridge, then try again.";
  } finally {
    sendButton.disabled = false;
    messageInput.disabled = false;
  }
}

sendButton.addEventListener("click", runTest);
refreshHealth();
setInterval(refreshHealth, 5000);

