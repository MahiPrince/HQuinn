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
const resultEvidenceDrawer = document.querySelector("#result-evidence-drawer");
const resultEvidence = document.querySelector("#result-evidence");
const privacyMode = document.querySelector("#privacy-mode");
const dataBadge = document.querySelector("#data-badge");
const liveConsentRow = document.querySelector("#live-consent-row");
const liveConsent = document.querySelector("#live-consent");
const browserSessionId = localStorage.getItem("hquinn-demo-session") || crypto.randomUUID().replaceAll("-", "");
localStorage.setItem("hquinn-demo-session", browserSessionId);
let bridgeOnline = false;
let bridgeMode = "offline";
let isSubmitting = false;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
  return body;
}

function updateSubmitState() {
  const liveAcknowledged = bridgeMode !== "live" || liveConsent.checked;
  sendButton.disabled = isSubmitting || !bridgeOnline || !liveAcknowledged;
}

function setBridgeStatus(online, mode) {
  bridgeOnline = online;
  bridgeMode = online ? mode : "offline";
  statusChip.classList.toggle("online", online);
  statusChip.classList.toggle("offline", !online);
  statusChip.innerHTML = `<span class="status-dot"></span>${online ? (mode === "echo" ? "Laptop connected · safe test" : "Local intelligence connected") : "Laptop bridge offline"}`;
  const isLive = online && mode === "live";
  liveConsentRow.classList.toggle("hidden", !isLive);
  privacyMode.textContent = !online ? "Laptop offline" : isLive ? "Live local intelligence" : "Connection-only test";
  privacyMode.classList.toggle("live", isLive);
  dataBadge.textContent = isLive ? "Non-confidential test only" : "No private data";
  helperText.textContent = !online
    ? "Start the local bridge before submitting."
    : isLive
      ? "Acknowledge the live-data boundary to enable this request."
      : "Connection-only mode returns a transport confirmation without using CMD evidence.";
  updateSubmitState();
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
  resultEvidence.replaceChildren();
  resultEvidenceDrawer.classList.add("hidden");
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

function evidenceSection(title, items, formatter) {
  if (!items.length) return null;
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  heading.textContent = title;
  const list = document.createElement("ul");
  items.forEach((item) => {
    const row = document.createElement("li");
    row.textContent = formatter(item);
    list.append(row);
  });
  section.append(heading, list);
  return section;
}

function showResult(result) {
  const assistant = result?.assistant || {};
  const paragraphs = Array.isArray(assistant.paragraphs)
    ? assistant.paragraphs.filter((paragraph) => typeof paragraph === "string" && paragraph.trim())
    : [];
  resultKicker.textContent = "Round trip complete";
  resultTitle.textContent = assistant.title || "The local connector responded.";
  resultMessage.textContent = assistant.message || paragraphs.join("\n\n") || "The local intelligence returned a structured response.";
  const primary = result?.configuration?.primary?.length || 0;
  const supporting = result?.configuration?.supporting?.length || 0;
  const gates = result?.validationGates?.length || 0;
  const evidence = Array.isArray(result?.evidence) ? result.evidence : [];
  const unknowns = Array.isArray(result?.unknowns) ? result.unknowns : [];
  const validationGates = Array.isArray(result?.validationGates) ? result.validationGates : [];
  resultDetails.replaceChildren(
    detailTile("Path", "Render → laptop → Render"),
    detailTile("Mode", result?.demo?.mode || "Local intelligence"),
    detailTile("Structured output", `${primary} primary · ${supporting} supporting · ${gates} validation gates`),
    detailTile("Evidence confidence", result?.confidence || "Not stated"),
  );
  const sections = [
    evidenceSection("Evidence used", evidence, (item) => [item.title, item.path, item.locator].filter(Boolean).join(" · ")),
    evidenceSection("Still unknown", unknowns, (item) => String(item)),
    evidenceSection("Validation gates", validationGates, (item) => [item.title, item.detail].filter(Boolean).join(": ")),
  ].filter(Boolean);
  resultEvidence.replaceChildren(...sections);
  resultEvidenceDrawer.classList.toggle("hidden", sections.length === 0);
}

function showError(error) {
  resultCard.classList.remove("hidden");
  resultKicker.textContent = "Test stopped";
  resultTitle.textContent = "The relay did not complete.";
  resultMessage.textContent = error.message || String(error);
  resultDetails.replaceChildren();
  resultEvidence.replaceChildren();
  resultEvidenceDrawer.classList.add("hidden");
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
  if (!bridgeOnline) return showError(new Error("The laptop bridge is offline."));
  if (bridgeMode === "live" && !liveConsent.checked) {
    return showError(new Error("Acknowledge the live-data notice before submitting."));
  }
  isSubmitting = true;
  updateSubmitState();
  messageInput.disabled = true;
  helperText.textContent = bridgeMode === "live" ? "Sending to the local CMD EFS intelligence…" : "Submitting the connection test…";
  try {
    const created = await jsonFetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify({
        sessionId: browserSessionId,
        message,
        liveConsent: bridgeMode === "live" && liveConsent.checked,
        workspaceState: {
          demo: true,
          dataClassification: "non-confidential test",
          privacyAcknowledged: bridgeMode === "live" && liveConsent.checked,
        },
      }),
    });
    showProgress(created.status);
    const result = await waitForJob(created.jobId);
    showResult(result);
    helperText.textContent = bridgeMode === "live"
      ? "Local intelligence responded. Review the evidence, assumptions, and validation gates."
      : "Connection verified. The bridge is ready for local intelligence mode.";
    liveConsent.checked = false;
    await refreshHealth();
  } catch (error) {
    showError(error);
    helperText.textContent = "Check the hosted service and local bridge, then try again.";
  } finally {
    isSubmitting = false;
    messageInput.disabled = false;
    updateSubmitState();
  }
}

sendButton.addEventListener("click", runTest);
liveConsent.addEventListener("change", updateSubmitState);
refreshHealth();
setInterval(refreshHealth, 5000);

