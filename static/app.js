const STORE_KEY = "hquinn-hosted-copilot-v1";
const API_SESSION_KEY = "hquinn-codex-session-v1";
const LIVE_ACK_KEY = "hquinn-live-data-ack-v1";
const SIDEBAR_KEY = "hquinn-sidebar-collapsed-v1";
const CSRF_TOKEN = document.querySelector('meta[name="csrf-token"]')?.content || "";

const elements = {
  conversationEyebrow: document.querySelector("#conversationEyebrow"),
  conversationTitle: document.querySelector("#conversationTitle"),
  phaseControl: document.querySelector("#phaseControl"),
  messages: document.querySelector("#messages"),
  messageScroll: document.querySelector("#messageScroll"),
  suggestionRow: document.querySelector("#suggestionRow"),
  composerForm: document.querySelector("#composerForm"),
  composerInput: document.querySelector("#composerInput"),
  composerNote: document.querySelector("#composerNote"),
  sendButton: document.querySelector(".send-button"),
  workspaceList: document.querySelector("#workspaceList"),
  workspaceTitle: document.querySelector("#workspaceTitle"),
  versionPill: document.querySelector("#versionPill"),
  saveStatus: document.querySelector("#saveStatus"),
  readinessStrip: document.querySelector("#readinessStrip"),
  impactBanner: document.querySelector("#impactBanner"),
  workspaceTabs: document.querySelector("#workspaceTabs"),
  workspaceContent: document.querySelector("#workspaceContent"),
  requirementsDialog: document.querySelector("#requirementsDialog"),
  requirementsForm: document.querySelector("#requirementsForm"),
  privacyButton: document.querySelector("#privacyButton"),
  privacyDialog: document.querySelector("#privacyDialog"),
  privacyForm: document.querySelector("#privacyForm"),
  privacyConsent: document.querySelector("#privacyConsent"),
  appGrid: document.querySelector("#appGrid"),
  sidebar: document.querySelector("#sidebar"),
  sidebarCollapse: document.querySelector("#sidebarCollapse"),
  toast: document.querySelector("#toast"),
  intelligenceStatus: document.querySelector("#intelligenceStatus"),
};

function newApiSessionId() {
  const randomPart = window.crypto?.randomUUID
    ? window.crypto.randomUUID().replaceAll("-", "")
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `efs_${randomPart}`;
}

function getApiSessionId() {
  try {
    const saved = localStorage.getItem(API_SESSION_KEY);
    if (saved && /^[A-Za-z0-9_-]{12,80}$/.test(saved)) return saved;
    const generated = newApiSessionId();
    localStorage.setItem(API_SESSION_KEY, generated);
    return generated;
  } catch {
    return newApiSessionId();
  }
}

let apiSessionId = getApiSessionId();
let isThinking = false;
let intelligenceState = "starting";
let bridgeMode = "offline";
let pendingPrivacyMessage = "";
let toastTimer;

function createState() {
  return {
    mode: "new",
    selectedTab: "requirements",
    phase: "Discovery",
    version: 0,
    consultationTitle: "Start with whatever you know",
    requirements: {},
    platform: null,
    packageDecision: null,
    samplePrep: "unknown",
    ups: "unknown",
    impact: null,
    configuration: { approach: null, primary: [], supporting: [], tertiary: [] },
    alternatives: [],
    validationGates: [],
    packageCandidates: [],
    evidence: [],
    unknowns: [],
    conflicts: [],
    suggestions: [],
    messages: [],
    history: [],
    undoStack: [],
  };
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY));
    if (!parsed || !Array.isArray(parsed.messages)) return createState();
    return {
      ...createState(),
      ...parsed,
      requirements: parsed.requirements || {},
      configuration: { ...createState().configuration, ...(parsed.configuration || {}) },
      alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives.filter((item) => item?.fit !== "weak").slice(0, 1) : [],
      validationGates: Array.isArray(parsed.validationGates) ? parsed.validationGates.slice(0, 8) : [],
      packageCandidates: Array.isArray(parsed.packageCandidates) ? parsed.packageCandidates.filter((item) => item?.fit === "strong").slice(0, 1) : [],
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
      unknowns: Array.isArray(parsed.unknowns) ? parsed.unknowns.slice(0, 5) : [],
      conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts.slice(0, 5) : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 2) : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
      undoStack: Array.isArray(parsed.undoStack) ? parsed.undoStack.slice(-10) : [],
    };
  } catch {
    return createState();
  }
}

let state = loadState();

function sidebarStartsCollapsed() {
  try { return localStorage.getItem(SIDEBAR_KEY) === "yes"; } catch { return false; }
}

function setSidebarCollapsed(collapsed) {
  elements.appGrid.classList.toggle("is-sidebar-collapsed", collapsed);
  elements.sidebarCollapse.setAttribute("aria-label", collapsed ? "Expand configurations" : "Collapse configurations");
  elements.sidebarCollapse.title = collapsed ? "Expand configurations" : "Collapse configurations";
  try { localStorage.setItem(SIDEBAR_KEY, collapsed ? "yes" : "no"); } catch { /* The layout still works without persistence. */ }
}

setSidebarCollapsed(sidebarStartsCollapsed());

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function saveState() {
  elements.saveStatus.textContent = "Saving…";
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    window.setTimeout(() => { elements.saveStatus.textContent = "Saved locally"; }, 220);
  } catch {
    elements.saveStatus.textContent = "Local save unavailable";
  }
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2400);
}

function workspaceSnapshot() {
  return {
    mode: state.mode,
    selectedTab: state.selectedTab,
    phase: state.phase,
    version: state.version,
    consultationTitle: state.consultationTitle,
    requirements: structuredClone(state.requirements),
    platform: state.platform,
    packageDecision: state.packageDecision,
    samplePrep: state.samplePrep,
    ups: state.ups,
    impact: state.impact,
    configuration: structuredClone(state.configuration),
    alternatives: structuredClone(state.alternatives),
    validationGates: structuredClone(state.validationGates),
    packageCandidates: structuredClone(state.packageCandidates),
    evidence: structuredClone(state.evidence),
    unknowns: structuredClone(state.unknowns),
    conflicts: structuredClone(state.conflicts),
    suggestions: structuredClone(state.suggestions),
    history: structuredClone(state.history),
  };
}

function rememberSnapshot() {
  state.undoStack.push(workspaceSnapshot());
  state.undoStack = state.undoStack.slice(-10);
}

function materialState() {
  return JSON.stringify({
    requirements: state.requirements,
    platform: state.platform,
    packageDecision: state.packageDecision,
    samplePrep: state.samplePrep,
    ups: state.ups,
    phase: state.phase,
    configuration: state.configuration,
    alternatives: state.alternatives,
    validationGates: state.validationGates,
    packageCandidates: state.packageCandidates,
    unknowns: state.unknowns,
    conflicts: state.conflicts,
  });
}

function addHistory(title, detail) {
  state.version += 1;
  state.history.unshift({ version: state.version, title, detail, time: "Just now" });
}

function calculateReadiness() {
  const fields = ["application", "matrix", "method", "throughput", "region", "scope"];
  const requirementPoints = fields.filter((key) => state.requirements[key]).length * 6;
  const primaryPoints = Math.min(25, (state.configuration.primary || []).length * 7);
  const supportingPoints = Math.min(12, (state.configuration.supporting || []).length * 4);
  const tertiaryPoints = Math.min(8, (state.configuration.tertiary || []).length * 2);
  const validationPoints = Math.min(10, state.validationGates.filter((gate) => gate.status === "pass").length * 2);
  const approachPoints = state.configuration.approach || state.packageDecision ? 3 : 0;
  return Math.min(94, requirementPoints + primaryPoints + supportingPoints + tertiaryPoints + validationPoints + approachPoints);
}

function statusChip(label, kind = "unknown") {
  return `<span class="status-chip ${escapeHTML(kind)}">${escapeHTML(label)}</span>`;
}

function renderSidebar() {
  const hasConsultation = state.messages.length || Object.values(state.requirements).some(Boolean);
  elements.workspaceList.innerHTML = `
    <div class="section-label">Recent</div>
    ${hasConsultation ? `
      <button class="workspace-row is-selected" data-session="current" data-search="${escapeHTML(state.consultationTitle)}">
        <span class="workspace-icon blue">EF</span>
        <span class="workspace-copy"><strong>${escapeHTML(state.consultationTitle)}</strong><small>${escapeHTML(state.phase)} · v${escapeHTML(state.version)}</small></span>
        <span class="row-chevron">›</span>
      </button>` : `<div class="sidebar-empty">No saved consultations yet</div>`}`;
}

function renderPhase() {
  const phases = ["Discovery", "Primary", "Workflow", "Validate"];
  const activeIndex = Math.max(0, phases.indexOf(state.phase));
  elements.phaseControl.innerHTML = phases.map((phase, index) => {
    const className = index === activeIndex ? "is-active" : index < activeIndex ? "is-complete" : "";
    return `<button class="phase-step ${className}" data-phase="${phase}">${index < activeIndex ? "✓ " : ""}${phase}</button>`;
  }).join("");
}

function renderAssistant(message) {
  const paragraphs = (message.paragraphs || []).map((paragraph) => `<p>${escapeHTML(paragraph)}</p>`).join("");
  const confidence = message.confidence
    ? `<span class="confidence-chip ${escapeHTML(message.confidence)}">${escapeHTML(message.confidence)} evidence confidence</span>`
    : "";
  const sources = (message.sources || []).length
    ? `<div class="evidence-line">${message.sources.map((source) => `<button class="evidence-chip" data-tab="evidence">${escapeHTML(source)}</button>`).join("")}</div>`
    : "";
  return `<div class="message assistant-message"><div class="assistant-avatar">Q</div><div class="assistant-copy">${message.title ? `<h3>${escapeHTML(message.title)}</h3>` : ""}${confidence}${paragraphs}${sources}</div></div>`;
}

function renderWelcome() {
  return `<div class="welcome-card">
    <div class="welcome-icon">Q</div>
    <h2>What does the customer need to accomplish?</h2>
    <p>Start with whatever you know. I’ll build the best-supported starting point, state the assumptions that matter, and refine it with you as more information becomes available.</p>
    <div class="starter-grid">
      <button class="starter-button" data-prompt="Recommend a practical starting build for a targeted analysis workflow, using reasonable evidence-backed assumptions where details are missing.">Start a targeted analysis build</button>
      <button class="starter-button" data-prompt="Help me choose between targeted quantitation and unknown screening.">Compare targeted and unknown screening</button>
      <button class="starter-button" data-prompt="Build an environmental water analysis workflow, starting with qualifying questions.">Build an environmental workflow</button>
      <button class="starter-button" data-prompt="Review an existing list of CMD SKUs and explain the likely use case and gaps.">Review an existing SKU list</button>
    </div>
  </div>`;
}

function renderMessages() {
  if (!state.messages.length) {
    elements.messages.innerHTML = renderWelcome();
    return;
  }
  const messages = state.messages.map((message) => {
    if (message.type === "user") return `<div class="message message-user"><div class="user-bubble">${escapeHTML(message.text)}</div></div>`;
    return renderAssistant(message);
  }).join("");
  const thinking = isThinking
    ? `<div class="message assistant-message intelligence-thinking"><div class="assistant-avatar">Q</div><div class="assistant-copy"><div class="thinking-line"><span></span><span></span><span></span></div><small>Checking controlled CMD EFS evidence and tracing configuration impact…</small></div></div>`
    : "";
  elements.messages.innerHTML = messages + thinking;
}

function requirementValue(key) {
  if (key === "throughput") return state.requirements.throughput ? `${state.requirements.throughput} samples/day` : "Not provided";
  if (key === "scope") return state.requirements.scope === "end-to-end" ? "End-to-end workflow" : state.requirements.scope === "instrument" ? "Instrument workflow only" : "Not provided";
  if (key === "samplePrep") return { customer_owned: "Customer-owned", include: "Include in solution", not_required: "Not required", unknown: "Not confirmed" }[state.samplePrep] || "Not confirmed";
  if (key === "ups") return { required: "Required — sizing to confirm", not_required: "Not required", unknown: "Not confirmed" }[state.ups] || "Not confirmed";
  return state.requirements[key] || "Not provided";
}

function requirementConfirmed(key) {
  if (key === "samplePrep") return state.samplePrep !== "unknown";
  if (key === "ups") return state.ups !== "unknown";
  return Boolean(state.requirements[key]);
}

function renderRequirements() {
  const rows = [
    ["Application", "application"], ["Matrix", "matrix"], ["Method", "method"],
    ["Throughput", "throughput"], ["Region", "region"], ["Quote boundary", "scope"],
    ["Sample preparation", "samplePrep"], ["UPS", "ups"], ["Nitrogen / gas", "nitrogen"],
  ];
  const refinements = [...state.unknowns, ...state.conflicts.map((item) => `Source conflict: ${item}`)];
  const visibleRefinements = refinements.slice(0, 3);
  return `<div class="panel-intro"><div><h3>Working requirements</h3><p>Use what is known now; refine assumptions when better information arrives.</p></div><button class="action-button" data-action="edit-requirements">Edit</button></div>
    <div class="requirement-grid"><ul class="requirement-list">${rows.map(([label, key]) => {
      const confirmed = requirementConfirmed(key);
      return `<li class="requirement-item"><span>${label}</span><strong>${escapeHTML(requirementValue(key))}</strong>${statusChip(confirmed ? "Confirmed" : "Unknown", confirmed ? "confirmed" : "unknown")}</li>`;
    }).join("")}</ul></div>
    ${visibleRefinements.length ? `<div class="unknowns-card"><h4>Most useful refinements</h4><ul>${visibleRefinements.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>${refinements.length > visibleRefinements.length ? `<small>${refinements.length - visibleRefinements.length} additional detail${refinements.length - visibleRefinements.length === 1 ? " is" : "s are"} tracked without blocking the working build.</small>` : ""}</div>` : ""}`;
}

function buildItem(item) {
  const glyph = String(item.name || "Item").split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
  const labels = { verified: "Verified", candidate: "Candidate", qualify: "Qualify", unknown: "Unknown", external: "External", missing: "Missing" };
  const metadata = [item.sku ? `SKU ${item.sku}` : null, item.quantity ? `Qty ${item.quantity}` : null, ...(item.evidence || [])].filter(Boolean);
  return `<li class="build-item"><div class="build-main"><span class="item-glyph">${escapeHTML(glyph)}</span><span class="item-copy"><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.reason)}</small></span>${statusChip(labels[item.status] || "Qualify", item.status || "qualify")}</div>${metadata.length ? `<div class="item-meta">${metadata.map((value) => `<span class="mini-chip">${escapeHTML(value)}</span>`).join("")}</div>` : ""}</li>`;
}

function packageCard(candidate) {
  const exceptions = candidate.exceptions || [];
  return `<section class="approach-card ${candidate.fit === "strong" ? "is-package" : ""}">
    <div class="approach-copy"><span class="package-symbol">ABC</span><div><span class="question-number">${escapeHTML(candidate.fit || "conditional")} package fit</span><strong>${escapeHTML(candidate.name)}</strong><small>${escapeHTML(candidate.rationale)}${candidate.salesOrg ? ` · Sales org ${escapeHTML(candidate.salesOrg)}` : ""}</small></div></div>
    <div class="approach-actions">${statusChip(candidate.fit || "conditional", candidate.fit === "strong" ? "confirmed" : "qualify")}<button class="text-button" data-prompt="Use ${escapeHTML(candidate.name)} as the configuration baseline and show every exception, addition, removal, and open validation gate.">Use as baseline</button></div>
    ${exceptions.length ? `<div class="package-exceptions"><strong>Exceptions and open checks</strong><ul>${exceptions.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul></div>` : ""}
  </section>`;
}

function renderBuild() {
  const sections = [
    ["1 · Primary analytical system", "The minimum analytical core selected for the stated outcome.", state.configuration.primary || []],
    ["2 · Supporting workflow", "Preparation, separation, automation, and dependent capabilities.", state.configuration.supporting || []],
    ["3 · Site, software, service, and tertiary layer", "Items required to install, operate, control, support, or release the solution.", state.configuration.tertiary || []],
  ];
  const hasItems = sections.some(([, , items]) => items.length);
  if (!hasItems && !state.packageCandidates.length) return `<div class="empty-panel"><div class="empty-icon">Q</div><h3>No supported starting configuration yet</h3><p>Keep describing the customer outcome in whatever detail is available. HQuinn will start the build as soon as the evidence supports a credible direction.</p></div>`;
  return `<div class="panel-intro"><div><h3>Progressive configuration</h3><p>Primary, supporting, and tertiary layers remain separate so a requirement change can reopen only the affected decisions.</p></div><button class="action-button" data-action="edit-requirements">Edit requirements</button></div>
    ${state.configuration.approach ? `<section class="approach-card"><div class="approach-copy"><span class="package-symbol">AI</span><div><span class="question-number">Configuration approach</span><strong>${escapeHTML(state.configuration.approach)}</strong></div></div></section>` : ""}
    ${state.packageCandidates.map(packageCard).join("")}
    ${sections.map(([title, subtitle, items]) => `<section class="card"><div class="card-header"><div><h4>${title}</h4><small>${subtitle}</small></div><span class="stage-pill ${items.length ? "review" : "pending"}">${items.length ? `${items.length} items` : "Open"}</span></div>${items.length ? `<ul class="build-list">${items.map(buildItem).join("")}</ul>` : `<div class="source-excerpt">No supported item has been selected for this layer yet.</div>`}</section>`).join("")}`;
}

function renderAlternatives() {
  const packages = state.packageCandidates.length ? `<div class="panel-intro"><div><h3>Package candidates</h3><p>A close package is a starting signal, never automatic proof of a complete quote.</p></div></div>${state.packageCandidates.map(packageCard).join("")}` : "";
  const alternatives = state.alternatives.length ? `<div class="panel-intro"><div><h3>Compare viable solution branches</h3><p>Fit expresses evidence-backed requirement alignment, not commercial approval.</p></div></div><div class="alternative-grid">${state.alternatives.map((item, index) => `<article class="alternative-card ${index === 0 ? "is-selected" : ""}">${statusChip(item.type || "Alternative", index === 0 ? "candidate" : "external")}<h4>${escapeHTML(item.name)}</h4><p>${escapeHTML(item.rationale)}</p><div class="fit-score">${escapeHTML(item.fit)}<small> requirement fit</small></div>${item.tradeoffs?.length ? `<div class="alternative-detail"><strong>Trade-offs</strong><ul>${item.tradeoffs.map((value) => `<li>${escapeHTML(value)}</li>`).join("")}</ul></div>` : ""}${item.gates?.length ? `<div class="alternative-detail"><strong>Open gates</strong><ul>${item.gates.map((value) => `<li>${escapeHTML(value)}</li>`).join("")}</ul></div>` : ""}<button class="primary-button" data-prompt="Evaluate ${escapeHTML(item.name)} as the preferred route and trace the impact on the entire current configuration.">Evaluate this route</button></article>`).join("")}</div>` : "";
  return packages || alternatives ? packages + alternatives : `<div class="empty-panel"><div class="empty-icon">↔</div><h3>Focused on the recommended route</h3><p>A second route will appear only when it is a credible alternative with a meaningful customer trade-off.</p></div>`;
}

function validationItem(gate) {
  const glyph = gate.status === "pass" ? "✓" : gate.status === "block" ? "×" : "!";
  return `<li class="check-item"><span class="check-glyph ${escapeHTML(gate.status)}">${glyph}</span><span class="check-copy"><strong>${escapeHTML(gate.title)}</strong><small>${escapeHTML(gate.detail)}</small></span>${statusChip(gate.status === "pass" ? "Pass" : gate.status === "block" ? "Blocked" : "Open", gate.status === "pass" ? "confirmed" : gate.status === "block" ? "missing" : "qualify")}</li>`;
}

function renderValidation() {
  const readiness = calculateReadiness();
  const blocked = state.validationGates.some((gate) => gate.status === "block");
  return `<div class="panel-intro"><div><h3>Validation gates</h3><p>Evidence confidence, configuration completeness, and quote release remain separate decisions.</p></div></div>
    <div class="validation-summary"><div class="validation-score" style="background:conic-gradient(var(--blue) 0 ${readiness}%, #e8e8ec ${readiness}% 100%)"><span>${readiness}%</span></div><div><h4>${blocked ? "Quote release remains blocked" : state.validationGates.length ? "Configuration direction is progressing" : "Validation has not started"}</h4><p>Current CPQ, compatibility, regional, availability, service, licensing, and price checks still govern release.</p></div></div>
    ${state.validationGates.length ? `<ul class="check-list">${state.validationGates.map(validationItem).join("")}</ul>` : `<div class="source-excerpt">Ask the copilot to validate the proposed solution when a supported direction is available.</div>`}`;
}

function renderEvidence() {
  return `<div class="panel-intro"><div><h3>Evidence used in this consultation</h3><p>Each conclusion is tied to its source role and boundary.</p></div><span class="count-pill">${state.evidence.length} sources</span></div>
    ${state.evidence.length ? `<ul class="source-list">${state.evidence.map((source) => `<li class="source-item"><details><summary><span class="source-title"><strong><span class="source-kind">Evidence</span>${escapeHTML(source.title)}</strong><small>${escapeHTML(source.id)} · ${escapeHTML([source.path, source.locator].filter(Boolean).join(" · "))}</small></span></summary><div class="source-excerpt">${escapeHTML(source.supports)}</div></details></li>`).join("")}</ul>` : `<div class="empty-panel"><div class="empty-icon">E</div><h3>No controlled evidence has been cited yet</h3><p>The copilot will add source-specific support as it qualifies and builds the solution.</p></div>`}`;
}

function renderHistory() {
  return `<div class="panel-intro"><div><h3>Decision history</h3><p>Material workspace changes create visible, reversible versions.</p></div>${state.undoStack.length ? `<button class="action-button" data-action="undo-change">Undo latest</button>` : ""}</div>
    ${state.history.length ? `<ul class="history-list">${state.history.map((item) => `<li class="history-item"><span class="history-version">v${escapeHTML(item.version)}</span><span class="history-copy"><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.detail)} · ${escapeHTML(item.time)}</small></span></li>`).join("")}</ul>` : `<div class="source-excerpt">No material configuration decision has been recorded yet.</div>`}`;
}

function renderWorkspace() {
  const readiness = calculateReadiness();
  elements.workspaceTitle.textContent = state.mode === "new" ? "Ready to build" : "Working configuration";
  elements.versionPill.textContent = state.version ? `v${state.version}` : "New";
  const hasWorkingBuild = (state.configuration.primary || []).length > 0;
  elements.readinessStrip.innerHTML = `<div class="readiness-copy"><strong><span>Working solution maturity</span><span>${readiness}%</span></strong><div class="progress-track"><div class="progress-fill" style="width:${readiness}%"></div></div></div><span class="readiness-status">${state.mode === "new" ? "Ready for a requirement" : readiness >= 85 ? "Ready for final checks" : hasWorkingBuild ? "Working build available" : "Building the first direction"}</span>`;
  if (state.impact) {
    elements.impactBanner.hidden = false;
    elements.impactBanner.innerHTML = `<strong>Change impact:</strong> ${escapeHTML(state.impact)}<div class="impact-banner-actions"><button data-tab="build">Review affected items</button>${state.undoStack.length ? `<button data-action="undo-change">Undo change</button>` : ""}</div>`;
  } else {
    elements.impactBanner.hidden = true;
    elements.impactBanner.replaceChildren();
  }
  elements.workspaceTabs.querySelectorAll("button").forEach((button) => button.classList.toggle("is-active", button.dataset.tab === state.selectedTab));
  const panels = { requirements: renderRequirements, build: renderBuild, alternatives: renderAlternatives, validation: renderValidation, evidence: renderEvidence, history: renderHistory };
  elements.workspaceContent.innerHTML = (panels[state.selectedTab] || renderRequirements)();
}

function renderSuggestions() {
  elements.suggestionRow.innerHTML = state.suggestions.slice(0, 2).map((prompt) => `<button class="suggestion-chip" data-prompt="${escapeHTML(prompt)}">${escapeHTML(prompt)}</button>`).join("");
}

function render() {
  const active = state.mode !== "new";
  elements.conversationEyebrow.textContent = active ? "ACTIVE CONSULTATION · EFS" : "NEW CONSULTATION";
  elements.conversationTitle.textContent = state.consultationTitle;
  renderSidebar();
  renderPhase();
  renderMessages();
  renderSuggestions();
  renderWorkspace();
  saveState();
}

function renderIntelligenceStatus() {
  const content = {
    connected: ["Local intelligence connected", "The hosted conversation is connected to Codex and the controlled CMD EFS corpus on the laptop."],
    unavailable: ["Laptop bridge offline", "The laptop intelligence bridge is unavailable. No scripted answer will be substituted."],
    starting: ["Connecting to laptop…", "The hosted workspace is connecting to the controlled local EFS corpus."],
  }[intelligenceState];
  elements.intelligenceStatus.innerHTML = `<span class="pulse-dot"></span> ${content[0]}`;
  elements.intelligenceStatus.classList.toggle("is-unavailable", intelligenceState === "unavailable");
  elements.composerNote.textContent = `${content[1]}${bridgeMode === "live" ? " Non-confidential prototype use only." : ""} Final BOMs still require CPQ and regional validation.`;
}

async function checkIntelligence() {
  try {
    const health = await jsonFetch("/api/health");
    bridgeMode = health.bridge?.mode || "offline";
    intelligenceState = health.intelligence === "connected" ? "connected" : "unavailable";
  } catch {
    bridgeMode = "offline";
    intelligenceState = "unavailable";
  }
  renderIntelligenceStatus();
}

function privacyAcknowledged() {
  try { return sessionStorage.getItem(LIVE_ACK_KEY) === "yes"; } catch { return false; }
}

function openPrivacyDialog(message = "") {
  pendingPrivacyMessage = message;
  elements.privacyConsent.checked = privacyAcknowledged();
  elements.privacyDialog.showModal();
}

function sleep(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
  return body;
}

function workspaceForIntelligence() {
  return {
    consultationTitle: state.consultationTitle,
    mode: state.mode,
    phase: state.phase,
    version: state.version,
    requirements: state.requirements,
    platform: state.platform,
    packageDecision: state.packageDecision,
    samplePrep: state.samplePrep,
    ups: state.ups,
    currentConfiguration: state.configuration,
    currentAlternatives: state.alternatives,
    currentValidationGates: state.validationGates,
    currentPackageCandidates: state.packageCandidates,
    currentUnknowns: state.unknowns,
    currentConflicts: state.conflicts,
    recentConversation: state.messages.slice(-8).map((message) => ({
      role: message.type === "user" ? "user" : "assistant",
      text: message.type === "user" ? message.text : [message.title, ...(message.paragraphs || [])].filter(Boolean).join(" "),
    })),
  };
}

async function waitForRelayJob(jobId) {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const job = await jsonFetch(`/api/jobs/${encodeURIComponent(jobId)}`);
    if (job.status === "complete") return job.result;
    if (job.status === "failed") throw new Error(job.error || "The laptop bridge could not complete the request.");
    elements.composerNote.textContent = job.status === "processing"
      ? "Codex is checking controlled CMD EFS evidence on the laptop. This can take a few minutes."
      : "The request is queued and waiting for the laptop bridge.";
    await sleep(1000);
  }
  throw new Error("The request timed out while waiting for the laptop. The visible conversation has been preserved so you can try again.");
}

async function askThroughRelay(message) {
  const created = await jsonFetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": CSRF_TOKEN },
    body: JSON.stringify({ sessionId: apiSessionId, message, workspaceState: workspaceForIntelligence(), liveConsent: privacyAcknowledged() }),
  });
  return waitForRelayJob(created.jobId);
}

function applyCodexResponse(response) {
  if (!response || typeof response !== "object") throw new Error("The local intelligence returned no structured response.");
  const before = materialState();
  const snapshot = workspaceSnapshot();
  state.mode = "ai";
  if (response.consultationTitle) state.consultationTitle = response.consultationTitle;
  const patch = response.workspacePatch || {};
  for (const key of ["application", "matrix", "method", "throughput", "region", "scope", "nitrogen"]) {
    if (patch[key] !== null && patch[key] !== undefined) state.requirements[key] = patch[key];
  }
  if (patch.samplePrep) state.samplePrep = patch.samplePrep;
  if (patch.ups) state.ups = patch.ups;
  if (patch.platform) state.platform = patch.platform;
  if (patch.packageDecision) state.packageDecision = patch.packageDecision;
  if (patch.phase) state.phase = patch.phase;
  if (patch.selectedTab) state.selectedTab = patch.selectedTab;
  state.impact = patch.impact || null;
  if (response.configuration) state.configuration = response.configuration;
  if (Array.isArray(response.alternatives)) state.alternatives = response.alternatives.filter((item) => item?.fit !== "weak").slice(0, 1);
  if (Array.isArray(response.validationGates)) state.validationGates = response.validationGates;
  if (Array.isArray(response.packageCandidates)) state.packageCandidates = response.packageCandidates.filter((item) => item?.fit === "strong").slice(0, 1);
  if (Array.isArray(response.unknowns)) state.unknowns = response.unknowns.slice(0, 5);
  if (Array.isArray(response.conflicts)) state.conflicts = response.conflicts.slice(0, 5);
  if (Array.isArray(response.suggestions)) state.suggestions = response.suggestions.slice(0, 2);
  if (Array.isArray(response.evidence) && response.evidence.length) {
    state.evidence = [...response.evidence, ...state.evidence].filter((source, index, all) => index === all.findIndex((candidate) => candidate.id === source.id && candidate.path === source.path)).slice(0, 40);
  }
  if (before !== materialState()) {
    state.undoStack.push(snapshot);
    state.undoStack = state.undoStack.slice(-10);
    addHistory(response.changeSummary || "Copilot updated the working solution", patch.impact || "The structured workspace changed after reviewing the requirement and evidence.");
  }
  const paragraphs = [...(response.assistant?.paragraphs || [])];
  state.messages.push({
    type: "assistant",
    title: response.assistant?.title || "I reviewed the controlled CMD EFS evidence.",
    paragraphs,
    confidence: response.confidence,
    sources: (response.evidence || []).map((source) => `${source.id} · ${source.title}`),
  });
}

async function handleUserMessage(text) {
  const cleanText = String(text || "").trim();
  if (!cleanText || isThinking) return;
  if (!privacyAcknowledged()) {
    openPrivacyDialog(cleanText);
    return;
  }
  state.messages.push({ type: "user", text: cleanText });
  isThinking = true;
  elements.composerInput.disabled = true;
  elements.sendButton.disabled = true;
  render();
  scrollConversation();
  try {
    applyCodexResponse(await askThroughRelay(cleanText));
    intelligenceState = "connected";
  } catch (error) {
    intelligenceState = "unavailable";
    state.messages.push({ type: "assistant", title: "I couldn’t complete that Codex turn.", paragraphs: [error.message || "The local intelligence bridge is unavailable.", "No configuration change was applied and no scripted answer was substituted."], sources: [] });
  } finally {
    isThinking = false;
    elements.composerInput.disabled = false;
    elements.sendButton.disabled = false;
    renderIntelligenceStatus();
    render();
    elements.composerInput.focus();
    scrollConversation();
  }
}

function scrollConversation() {
  window.requestAnimationFrame(() => elements.messageScroll.scrollTo({ top: elements.messageScroll.scrollHeight, behavior: "smooth" }));
}

function selectTab(tab) {
  state.selectedTab = tab;
  renderWorkspace();
  saveState();
}

function startNewConsultation() {
  try { localStorage.removeItem(API_SESSION_KEY); } catch {}
  apiSessionId = getApiSessionId();
  state = createState();
  render();
  elements.sidebar.classList.remove("is-open");
  elements.composerInput.focus();
}

function undoLatest() {
  const snapshot = state.undoStack.pop();
  if (!snapshot) return showToast("No reversible workspace change is available");
  const messages = state.messages;
  const remainingUndo = state.undoStack;
  state = { ...state, ...snapshot, messages, undoStack: remainingUndo };
  state.impact = "The latest structured workspace change was reversed. Conversation history remains visible.";
  state.messages.push({ type: "assistant", title: "The latest workspace change has been reversed.", paragraphs: ["I restored the preceding structured solution. The conversation remains in the audit trail so the decision is still understandable."], sources: [] });
  render();
  scrollConversation();
}

function openRequirementsDialog() {
  const form = elements.requirementsForm.elements;
  form.application.value = state.requirements.application || "";
  form.matrix.value = state.requirements.matrix || "";
  form.method.value = state.requirements.method || "";
  form.throughput.value = state.requirements.throughput || "";
  form.region.value = state.requirements.region || "";
  form.scope.value = state.requirements.scope || "instrument";
  form.samplePrep.value = state.samplePrep || "unknown";
  form.ups.value = state.ups || "unknown";
  elements.requirementsDialog.showModal();
}

function applyRequirements(formData) {
  const nextRequirements = {
    application: String(formData.get("application") || "").trim(),
    matrix: String(formData.get("matrix") || "").trim(),
    method: String(formData.get("method") || "").trim(),
    throughput: Number(formData.get("throughput") || 0) || null,
    region: String(formData.get("region") || "").trim(),
    scope: String(formData.get("scope") || "instrument"),
    nitrogen: state.requirements.nitrogen || null,
  };
  const nextPrep = String(formData.get("samplePrep") || "unknown");
  const nextUps = String(formData.get("ups") || "unknown");
  if (JSON.stringify([nextRequirements, nextPrep, nextUps]) === JSON.stringify([state.requirements, state.samplePrep, state.ups])) return showToast("No requirements changed");
  rememberSnapshot();
  state.requirements = nextRequirements;
  state.samplePrep = nextPrep;
  state.ups = nextUps;
  state.impact = "Requirements changed; dependent configuration and validation decisions must be reassessed.";
  addHistory("Requirements edited", state.impact);
  const summary = `Reassess the entire solution after these requirement edits: application ${nextRequirements.application || "not provided"}; matrix ${nextRequirements.matrix || "not provided"}; method ${nextRequirements.method || "not provided"}; throughput ${nextRequirements.throughput || "not provided"}; region ${nextRequirements.region || "not provided"}; boundary ${nextRequirements.scope}; sample preparation ${nextPrep}; UPS ${nextUps}. Explain every affected item and preserve unresolved gates.`;
  handleUserMessage(summary);
}

function configurationExportPayload() {
  return {
    title: state.consultationTitle,
    version: state.version,
    phase: state.phase,
    readiness: calculateReadiness(),
    platform: state.platform,
    packageDecision: state.packageDecision,
    samplePrep: state.samplePrep,
    ups: state.ups,
    requirements: state.requirements,
    configuration: state.configuration,
    packageCandidates: state.packageCandidates,
    alternatives: state.alternatives,
    validationGates: state.validationGates,
    unknowns: state.unknowns,
    conflicts: state.conflicts,
    evidence: state.evidence,
    messages: state.messages,
    history: state.history,
  };
}

async function exportConfiguration() {
  if (state.mode === "new") return showToast("Build a configuration before exporting");
  const button = document.querySelector("#exportButton");
  button.disabled = true;
  try {
    const result = await window.HQuinnExcel.downloadConfigurationWorkbook(configurationExportPayload());
    showToast(`Excel configuration exported · ${result.itemCount} build items`);
  } catch (error) {
    showToast(error.message || "The Excel configuration could not be exported");
  } finally {
    button.disabled = false;
  }
}

document.addEventListener("click", (event) => {
  const promptNode = event.target.closest("[data-prompt]");
  if (promptNode) return handleUserMessage(promptNode.dataset.prompt);
  const tabNode = event.target.closest("[data-tab]");
  if (tabNode) return selectTab(tabNode.dataset.tab);
  const phaseNode = event.target.closest("[data-phase]");
  if (phaseNode) return selectTab({ Discovery: "requirements", Primary: "build", Workflow: "build", Validate: "validation" }[phaseNode.dataset.phase]);
  const actionNode = event.target.closest("[data-action]");
  if (!actionNode) return;
  const action = actionNode.dataset.action;
  if (action === "new-workspace" || action === "reset-demo") startNewConsultation();
  else if (action === "edit-requirements") openRequirementsDialog();
  else if (action === "close-dialog") elements.requirementsDialog.close();
  else if (action === "close-privacy") { pendingPrivacyMessage = ""; elements.privacyDialog.close(); }
  else if (action === "undo-change") undoLatest();
});

elements.composerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = elements.composerInput.value;
  elements.composerInput.value = "";
  elements.composerInput.style.height = "auto";
  handleUserMessage(message);
});

elements.composerInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); elements.composerForm.requestSubmit(); }
});

elements.composerInput.addEventListener("input", () => {
  elements.composerInput.style.height = "auto";
  elements.composerInput.style.height = `${Math.min(elements.composerInput.scrollHeight, 120)}px`;
});

elements.requirementsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(elements.requirementsForm);
  elements.requirementsDialog.close();
  applyRequirements(formData);
});

elements.privacyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!elements.privacyConsent.checked) return elements.privacyConsent.reportValidity();
  try { sessionStorage.setItem(LIVE_ACK_KEY, "yes"); } catch { return showToast("This browser could not remember the acknowledgement"); }
  const message = pendingPrivacyMessage;
  pendingPrivacyMessage = "";
  elements.privacyDialog.close();
  if (message) handleUserMessage(message);
});

document.querySelector("#workspaceSearch").addEventListener("input", (event) => {
  const query = event.target.value.trim().toLowerCase();
  elements.workspaceList.querySelectorAll(".workspace-row").forEach((row) => { row.hidden = Boolean(query && !row.dataset.search.toLowerCase().includes(query)); });
});
document.querySelector("#sidebarToggle").addEventListener("click", () => elements.sidebar.classList.toggle("is-open"));
elements.sidebarCollapse.addEventListener("click", () => setSidebarCollapsed(!elements.appGrid.classList.contains("is-sidebar-collapsed")));
document.querySelector("#exportButton").addEventListener("click", exportConfiguration);
document.querySelector("#workspaceMore").addEventListener("click", () => selectTab("history"));
elements.privacyButton.addEventListener("click", () => openPrivacyDialog());

render();
renderIntelligenceStatus();
checkIntelligence();
window.setInterval(checkIntelligence, 5000);
window.requestAnimationFrame(() => { elements.messageScroll.scrollTop = elements.messageScroll.scrollHeight; });
