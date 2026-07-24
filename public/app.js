import DOMPurify from "/vendor/dompurify.js";
import { marked } from "/vendor/marked.js";

const $ = (selector) => document.querySelector(selector);
const MARKDOWN_TAGS = [
  "a", "blockquote", "br", "code", "del", "em", "h1", "h2", "h3", "h4", "h5", "h6",
  "hr", "li", "ol", "p", "pre", "strong", "table", "tbody", "td", "th", "thead", "tr", "ul",
];
const MARKDOWN_ATTRIBUTES = ["href", "title"];
const state = {
  workspace: null,
  options: [],
  conversation: null,
  messages: [],
  activeJobId: null,
  eventSource: null,
  connectionState: "disconnected",
  clockTimer: null,
  profile: null,
};

const conversation = $("#conversation");
const intro = $("#conversation-intro");
const messages = $("#messages");
const form = $("#message-form");
const input = $("#message-input");
const providerSelect = $("#provider-select");
const modelSelect = $("#model-select");
const reasoningSelect = $("#reasoning-select");
const sendButton = $("#send-button");
const cancelButton = $("#cancel-button");
const composerStatus = $("#composer-status");
const setupDialog = $("#setup-dialog");
const setupForm = $("#setup-form");
const setupCancel = $("#setup-cancel");
const workspacePath = $("#workspace-path");
const grantCodex = $("#grant-codex");
const grantGrok = $("#grant-grok");
const setupValidation = $("#setup-validation");
const contextPanel = $("#context-panel");
const scrim = $("#scrim");
const settingsDialog = $("#settings-dialog");
const diffDialog = $("#diff-dialog");

start().catch(showError);

async function start() {
  const [workspace, options, profile] = await Promise.all([
    request("/api/workspace/status"),
    request("/api/ai/options"),
    request("/api/assistant/profile"),
  ]);
  state.workspace = workspace;
  state.options = options.providers;
  state.profile = profile.profile;
  renderProviderOptions();
  renderProfile();
  renderWorkspace();
  bindEvents();
  if (!workspace.configured) {
    workspacePath.value = workspace.suggestedRoot || "";
    setupCancel.hidden = true;
    setupDialog.showModal();
    return;
  }
  await ensureConversation();
  await loadReceipts();
}

function bindEvents() {
  form.addEventListener("submit", sendMessage);
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
  });
  providerSelect.addEventListener("change", async () => {
    updateDependentOptions();
    if (!state.conversation || providerSelect.value === state.conversation.provider) return;
    try {
      const result = await request(`/api/ai/conversations/${state.conversation.id}/provider`, {
        method: "POST",
        body: JSON.stringify(selection()),
      });
      state.conversation = result.conversation;
      toast(`${result.conversation.provider} 새 세션으로 전환했습니다.`);
      renderMessages();
    } catch (error) {
      showError(error);
      providerSelect.value = state.conversation.provider;
      updateDependentOptions();
    }
  });
  cancelButton.addEventListener("click", async () => {
    if (!state.activeJobId) return;
    await request(`/api/ai/jobs/${state.activeJobId}/cancel`, { method: "POST" });
    toast("취소를 요청했습니다.");
  });
  setupForm.addEventListener("submit", configureWorkspace);
  setupCancel.addEventListener("click", () => setupDialog.close());
  $("#workspace-edit").addEventListener("click", openWorkspaceSettings);
  $("#settings-open").addEventListener("click", () => settingsDialog.showModal());
  $("#mobile-settings").addEventListener("click", () => settingsDialog.showModal());
  $("#settings-close").addEventListener("click", () => settingsDialog.close());
  $("#profile-form").addEventListener("submit", saveProfile);
  $("#mobile-context").addEventListener("click", openContext);
  $("#context-close").addEventListener("click", closeContext);
  scrim.addEventListener("click", closeContext);
  $("#receipts-refresh").addEventListener("click", loadReceipts);
  $("#diff-close").addEventListener("click", () => diffDialog.close());
}

async function ensureConversation() {
  const conversations = await request("/api/ai/conversations");
  if (conversations.conversations.length) {
    state.conversation = conversations.conversations[0];
  } else {
    const firstGranted = state.workspace.configuration.codexGranted ? "codex" : "grok";
    providerSelect.value = firstGranted;
    updateDependentOptions();
    const created = await request("/api/ai/conversations", {
      method: "POST",
      body: JSON.stringify(selection()),
    });
    state.conversation = created.conversation;
  }
  providerSelect.value = state.conversation.provider;
  updateDependentOptions();
  if ([...modelSelect.options].some((option) => option.value === state.conversation.defaultModel)) {
    modelSelect.value = state.conversation.defaultModel;
  }
  if ([...reasoningSelect.options].some((option) => option.value === state.conversation.defaultReasoningEffort)) {
    reasoningSelect.value = state.conversation.defaultReasoningEffort;
  }
  await loadConversation();
}

async function loadConversation() {
  if (!state.conversation) return;
  const result = await request(`/api/ai/conversations/${state.conversation.id}`);
  state.conversation = result.conversation;
  state.messages = result.messages;
  renderMessages();
  const pending = state.messages.find((message) =>
    message.role === "assistant" && message.status === "pending" && message.jobId);
  if (pending) {
    state.activeJobId = pending.jobId;
    setBusy(true, "활성 작업을 다시 추적하고 있습니다.");
    followJob(pending.jobId);
  }
}

async function sendMessage(event) {
  event.preventDefault();
  const value = input.value.trim();
  if (!value || !state.conversation || state.activeJobId) return;
  const userMessage = {
    id: uuid(),
    role: "user",
    content: value,
    provider: state.conversation.provider,
    model: modelSelect.value,
    status: "completed",
  };
  state.messages.push(userMessage);
  input.value = "";
  input.style.height = "auto";
  renderMessages();
  setBusy(true, "선택한 CLI가 WorkOS에서 바로 답변합니다.");
  try {
    const result = await request(`/api/ai/conversations/${state.conversation.id}/messages`, {
      method: "POST",
      body: JSON.stringify({
        clientRequestId: uuid(),
        message: value,
        model: modelSelect.value,
        reasoningEffort: reasoningSelect.value,
      }),
    });
    state.messages = state.messages.filter((message) => message.id !== userMessage.id);
    state.messages.push(result.userMessage, result.assistantMessage);
    state.activeJobId = result.job.id;
    renderMessages();
    followJob(result.job.id);
  } catch (error) {
    state.messages = state.messages.filter((message) => message.id !== userMessage.id);
    setBusy(false);
    showError(error);
  }
}

function followJob(jobId) {
  state.eventSource?.close();
  const source = new EventSource(`/api/ai/jobs/${jobId}/events`);
  state.eventSource = source;
  state.connectionState = "connecting";
  source.onopen = () => {
    state.connectionState = "connected";
    renderMessages();
  };
  source.addEventListener("snapshot", (event) => applySnapshot(JSON.parse(event.data)));
  source.addEventListener("liveness", (event) => {
    const liveness = JSON.parse(event.data);
    const message = state.messages.find((item) => item.jobId === jobId && item.role === "assistant");
    if (message) {
      message.liveness = liveness;
      renderMessages();
    }
  });
  source.addEventListener("status", (event) => {
    const status = JSON.parse(event.data).status;
    composerStatus.textContent = status === "planning"
      ? "WorkOS에서 요청을 처리하고 있습니다."
      : "승인된 범위에서 WorkOS를 수정하고 있습니다.";
  });
  source.addEventListener("activity", (event) => {
    const activity = JSON.parse(event.data).activity;
    const message = state.messages.find((item) => item.jobId === jobId && item.role === "assistant");
    if (message) {
      message.activity = [...(message.activity || []), activity];
      renderMessages();
    }
  });
  source.addEventListener("approval_required", (event) => {
    applySnapshot(JSON.parse(event.data));
    finishFollow(false, "위험 작업의 실행 범위를 확인해주세요.");
  });
  source.addEventListener("completed", async (event) => {
    applySnapshot(JSON.parse(event.data));
    finishFollow(true, "완료했습니다.");
    await Promise.all([loadReceipts(), refreshWorkspace()]);
  });
  source.addEventListener("failed", async (event) => {
    const payload = JSON.parse(event.data);
    applySnapshot(payload);
    finishFollow(false, payload.error || "요청을 완료하지 못했습니다.");
    await refreshWorkspace();
  });
  source.onerror = () => {
    if (!state.activeJobId) return;
    state.connectionState = "recovering";
    composerStatus.textContent = "연결 복구 중 · 서버 작업은 계속될 수 있습니다.";
    renderMessages();
  };
  clearInterval(state.clockTimer);
  state.clockTimer = setInterval(renderMessages, 1_000);
}

function applySnapshot(snapshot) {
  const index = state.messages.findIndex((item) => item.id === snapshot.message.id);
  const previous = index >= 0 ? state.messages[index] : null;
  const message = {
    ...snapshot.message,
    activity: snapshot.activity,
    receipt: snapshot.receipt,
    liveness: previous?.liveness,
  };
  if (index >= 0) state.messages[index] = message;
  else state.messages.push(message);
  renderMessages();
}

function finishFollow(success, text) {
  state.eventSource?.close();
  state.eventSource = null;
  state.connectionState = "disconnected";
  clearInterval(state.clockTimer);
  state.clockTimer = null;
  state.activeJobId = null;
  setBusy(false, text);
  if (!success) toast(text);
}

function renderMessages() {
  const stayAtBottom = conversation.scrollHeight - conversation.scrollTop - conversation.clientHeight < 80;
  intro.hidden = state.messages.length > 0;
  messages.replaceChildren(...state.messages.map(renderMessage));
  if (stayAtBottom) requestAnimationFrame(() => conversation.scrollTo({ top: conversation.scrollHeight }));
}

function renderMessage(message) {
  const article = document.createElement("article");
  article.className = `message ${message.role}`;
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = message.role === "user" ? "OWNER" : `${message.provider || "AI"} · ${message.status || ""}`;
  const body = document.createElement("div");
  body.className = "message-content";
  const content = message.content || "";
  if (message.role === "assistant" && message.status === "pending") {
    body.append(renderProgressCard(message));
  } else if (message.role === "assistant") renderAssistantMarkdown(body, content);
  else body.textContent = content;
  bubble.append(meta, body);
  if (message.status === "pending" && message.activity?.length) {
    const list = document.createElement("div");
    list.className = "activity-list";
    for (const activity of message.activity) {
      const item = document.createElement("div");
      item.className = "activity-item";
      item.textContent = activity.summary;
      list.append(item);
    }
    bubble.append(list);
  }
  if (message.role === "assistant" && message.status !== "pending" && message.activity?.length) {
    const details = document.createElement("details");
    details.className = "run-details";
    const summary = document.createElement("summary");
    summary.textContent = `실행 정보 · ${formatDuration(runElapsedMs(message))}`;
    const phases = document.createElement("div");
    phases.textContent = message.activity.map((item) => item.summary).join(" · ");
    details.append(summary, phases);
    bubble.append(details);
  }
  if (message.plan && message.status === "pending" && message.plan.requiresApproval) {
    bubble.append(renderPlan(message));
  }
  if (message.receiptId || message.receipt) {
    const receipt = document.createElement("div");
    receipt.className = "receipt-chip";
    receipt.textContent = `Receipt · ${(message.receiptId || message.receipt.id).slice(0, 8)} · 로컬 Git commit 완료`;
    bubble.append(receipt);
  }
  article.append(bubble);
  return article;
}

function renderProgressCard(message) {
  const liveness = message.liveness;
  const card = document.createElement("section");
  card.className = "progress-card";
  const title = document.createElement("strong");
  title.textContent = livenessLabel(liveness);
  const phase = document.createElement("div");
  phase.className = "progress-phase";
  phase.textContent = `현재 단계 · ${phaseLabel(liveness?.phase || "starting")}`;
  const metrics = document.createElement("dl");
  for (const [label, value] of [
    ["전체 경과", formatDuration(runElapsedMs(message))],
    ["마지막 신호", liveness?.lastProviderSignalAt
      ? `${formatDuration(Date.now() - Date.parse(liveness.lastProviderSignalAt))} 전`
      : "아직 없음"],
    ["CLI 프로세스", processLabel(liveness?.processState || "starting")],
    ["실시간 연결", state.connectionState === "connected" ? "연결됨"
      : state.connectionState === "recovering" ? "복구 중" : "연결 중"],
  ]) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    metrics.append(dt, dd);
  }
  card.append(title, phase, metrics);
  return card;
}

function livenessLabel(liveness) {
  if (!liveness || liveness.processState === "starting") return "시작 중";
  if (liveness.processState === "stopped") return "마무리 처리 중";
  const silence = liveness.lastProviderSignalAt
    ? Date.now() - Date.parse(liveness.lastProviderSignalAt)
    : 0;
  if (silence >= 60_000) return "응답 지연";
  if (silence >= 15_000) return "조용히 처리 중";
  return "실행 중";
}

function phaseLabel(phase) {
  return {
    starting: "시작",
    checking_workos: "WorkOS 확인",
    composing: "답변 구성",
    validating: "검증",
    committing: "커밋",
  }[phase] || "시작";
}

function processLabel(processState) {
  return { starting: "시작 중", running: "실행 중", stopped: "중지됨" }[processState];
}

function runElapsedMs(message) {
  const startedAt = message.liveness?.startedAt || message.createdAt;
  const endAt = message.updatedAt && message.status !== "pending" ? message.updatedAt : Date.now();
  return Math.max(0, Date.parse(endAt) - Date.parse(startedAt));
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) return "0초";
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}분 ${seconds % 60}초` : `${seconds}초`;
}

function renderAssistantMarkdown(container, markdown) {
  const parsed = marked.parse(markdown, { async: false, breaks: true, gfm: true });
  container.classList.add("markdown-body");
  container.innerHTML = DOMPurify.sanitize(parsed, {
    ALLOWED_TAGS: MARKDOWN_TAGS,
    ALLOWED_ATTR: MARKDOWN_ATTRIBUTES,
    ALLOW_DATA_ATTR: false,
  });
  for (const link of container.querySelectorAll("a[href]")) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
}

function renderPlan(message) {
  const card = document.createElement("div");
  card.className = "plan-card";
  const title = document.createElement("strong");
  title.textContent = `승인 필요 · ${message.plan.summary}`;
  const rationale = document.createElement("div");
  rationale.textContent = message.plan.rationale;
  const list = document.createElement("ul");
  for (const value of [
    ...message.plan.operations.map((item) => `작업: ${item}`),
    ...message.plan.expectedPaths.map((item) => `경로: ${item}`),
    ...message.plan.capabilities.filter((item) => item !== "local").map((item) => `확장 도구: ${item}`),
  ]) {
    const li = document.createElement("li");
    li.textContent = value;
    list.append(li);
  }
  const actions = document.createElement("div");
  actions.className = "plan-actions";
  const approve = button("승인하고 실행", "primary-button", async () => {
    const result = await request(`/api/ai/jobs/${message.jobId}/approve`, { method: "POST" });
    state.activeJobId = message.jobId;
    applySnapshot(result.snapshot);
    setBusy(true, "승인된 작업을 실행합니다.");
    followJob(message.jobId);
  });
  const reject = button("거절", "secondary-button", async () => {
    const result = await request(`/api/ai/jobs/${message.jobId}/reject`, { method: "POST" });
    applySnapshot(result.snapshot);
    toast("WorkOS를 변경하지 않았습니다.");
  });
  actions.append(approve, reject);
  card.append(title, rationale, list, actions);
  return card;
}

async function configureWorkspace(event) {
  event.preventDefault();
  setupValidation.hidden = true;
  try {
    const result = await request("/api/workspace/configuration/proposals", {
      method: "POST",
      body: JSON.stringify({
        rootPath: workspacePath.value.trim(),
        codexGranted: grantCodex.checked,
        grokGranted: grantGrok.checked,
      }),
    });
    const validation = result.proposal.validation;
    setupValidation.hidden = false;
    setupValidation.classList.toggle("valid", validation.valid);
    setupValidation.textContent = validation.valid
      ? `✓ Git 저장소와 AGENTS.md를 확인했습니다.\nBranch: ${validation.branch || "(detached)"}\n${validation.dirty ? `미커밋 변경 ${validation.dirtyPaths.length}개 · 읽기만 허용됩니다.` : "Clean worktree · 쓰기 가능"}`
      : validation.errors.join("\n");
    if (!validation.valid) return;
    const confirmed = await request(`/api/workspace/configuration/proposals/${result.proposal.id}/confirm`, {
      method: "POST",
      body: JSON.stringify({ confirmation: "CONNECT_WORKOS" }),
    });
    setupDialog.close();
    state.workspace = {
      configured: true,
      configuration: confirmed.configuration,
      validation: confirmed.validation,
      suggestedRoot: null,
    };
    renderWorkspace();
    await ensureConversation();
    await loadReceipts();
    toast("WorkOS를 연결했습니다.");
  } catch (error) {
    setupValidation.hidden = false;
    setupValidation.classList.remove("valid");
    setupValidation.textContent = error.message;
  }
}

function openWorkspaceSettings() {
  const configuration = state.workspace?.configuration;
  workspacePath.value = configuration?.rootPath || state.workspace?.suggestedRoot || "";
  grantCodex.checked = configuration?.codexGranted ?? true;
  grantGrok.checked = configuration?.grokGranted ?? true;
  setupCancel.hidden = false;
  setupValidation.hidden = true;
  setupDialog.showModal();
}

async function refreshWorkspace() {
  state.workspace = await request("/api/workspace/status");
  renderWorkspace();
}

function renderWorkspace() {
  const rail = $("#rail-workspace");
  const card = $("#workspace-card");
  const badge = $("#git-badge");
  if (!state.workspace?.configured) {
    rail.classList.remove("connected");
    rail.querySelector("span").textContent = "설정 필요";
    badge.className = "status-badge";
    badge.textContent = "WorkOS 설정 필요";
    card.innerHTML = "<strong>연결되지 않음</strong><span>첫 실행 설정에서 WorkOS를 연결하세요.</span>";
    return;
  }
  const { configuration, validation } = state.workspace;
  rail.classList.add("connected");
  rail.querySelector("span").textContent = "WorkOS 연결됨";
  badge.className = `status-badge ${validation.dirty ? "dirty" : "clean"}`;
  badge.textContent = validation.dirty ? `미커밋 변경 ${validation.dirtyPaths.length}개 · 읽기 전용` : "Clean · 쓰기 가능";
  card.replaceChildren();
  const name = document.createElement("strong");
  name.textContent = configuration.rootPath.split(/[\\/]/).filter(Boolean).at(-1) || "WorkOS";
  const path = document.createElement("span");
  path.className = "mono-text";
  path.textContent = configuration.rootPath;
  const branch = document.createElement("span");
  branch.className = "mono-text";
  branch.textContent = `Branch · ${validation.branch || "(detached)"}`;
  const providers = document.createElement("span");
  providers.textContent = `허용 · ${[configuration.codexGranted && "Codex", configuration.grokGranted && "Grok"].filter(Boolean).join(", ")}`;
  card.append(name, path, branch, providers);
  if (validation.dirty) {
    const dirty = document.createElement("span");
    dirty.className = "dirty-note";
    dirty.textContent = "기존 변경을 보호하기 위해 AI 쓰기와 Undo를 차단합니다.";
    card.append(dirty);
  }
}

async function loadReceipts() {
  if (!state.workspace?.configured) return;
  const result = await request("/api/workspace/receipts");
  const list = $("#receipts-list");
  if (!result.receipts.length) {
    list.innerHTML = '<p class="empty">아직 변경 기록이 없습니다.</p>';
    return;
  }
  list.replaceChildren(...result.receipts.map((receipt, index) => {
    const card = document.createElement("article");
    card.className = "receipt-card";
    const title = document.createElement("strong");
    title.textContent = receipt.semanticSummary;
    const meta = document.createElement("small");
    meta.textContent = `${receipt.provider} · ${receipt.changedPaths.length} files · ${new Date(receipt.createdAt).toLocaleString("ko-KR")}`;
    const diff = button("Diff 보기", "", () => showDiff(receipt.id));
    card.append(title, meta, diff);
    if (index === 0 && !receipt.undoneByReceiptId) {
      const undo = button("최근 변경 Undo", "", () => undoReceipt(receipt.id));
      card.append(document.createTextNode(" · "), undo);
    }
    return card;
  }));
}

async function showDiff(receiptId) {
  const result = await request(`/api/workspace/receipts/${receiptId}/diff`);
  $("#diff-content").textContent = result.diff;
  diffDialog.showModal();
}

async function undoReceipt(receiptId) {
  if (!confirm("최신 앱 commit을 새 revert commit으로 되돌릴까요?")) return;
  await request(`/api/workspace/receipts/${receiptId}/undo`, {
    method: "POST",
    body: JSON.stringify({ confirmation: "UNDO_LATEST_RECEIPT" }),
  });
  await Promise.all([loadReceipts(), refreshWorkspace()]);
  toast("최신 Receipt를 Undo했습니다.");
}

function renderProviderOptions() {
  providerSelect.replaceChildren(...state.options.map((provider) => option(provider.id, provider.label)));
  updateDependentOptions();
}

function updateDependentOptions() {
  const provider = state.options.find((item) => item.id === providerSelect.value) || state.options[0];
  if (!provider) return;
  const previousModel = modelSelect.value;
  const previousReasoning = reasoningSelect.value;
  modelSelect.replaceChildren(...provider.models.map((item) => option(item.id, item.label)));
  reasoningSelect.replaceChildren(...provider.reasoningEfforts.map((item) => option(item.id, item.label)));
  if ([...modelSelect.options].some((item) => item.value === previousModel)) modelSelect.value = previousModel;
  if ([...reasoningSelect.options].some((item) => item.value === previousReasoning)) reasoningSelect.value = previousReasoning;
}

function selection() {
  if (!modelSelect.value) throw new Error("구체적인 AI 모델을 선택해주세요.");
  return {
    provider: providerSelect.value,
    model: modelSelect.value,
    reasoningEffort: reasoningSelect.value || "default",
  };
}

function renderProfile() {
  const profile = state.profile;
  $("#assistant-title").textContent = profile.name;
  $("#profile-name").value = profile.name;
  $("#profile-address").value = profile.ownerAddress;
  $("#profile-role").value = profile.roleDescription;
  $("#profile-style").value = profile.communicationStyle;
  $("#profile-principles").value = profile.workingPrinciples;
  $("#profile-timezone").value = profile.timezone;
}

async function saveProfile(event) {
  event.preventDefault();
  const result = await request("/api/assistant/profile", {
    method: "PUT",
    body: JSON.stringify({
      confirmation: "UPDATE_ASSISTANT_PROFILE",
      name: $("#profile-name").value,
      ownerAddress: $("#profile-address").value,
      roleDescription: $("#profile-role").value,
      communicationStyle: $("#profile-style").value,
      workingPrinciples: $("#profile-principles").value,
      timezone: $("#profile-timezone").value,
    }),
  });
  state.profile = result.profile;
  renderProfile();
  settingsDialog.close();
  toast("비서 설정을 저장했습니다.");
}

function setBusy(value, text) {
  sendButton.disabled = value;
  providerSelect.disabled = value;
  modelSelect.disabled = value;
  reasoningSelect.disabled = value;
  cancelButton.hidden = !value;
  if (text) composerStatus.textContent = text;
  else if (!value) composerStatus.textContent = "질문은 CLI가 바로 답하고, 명시적 변경 요청만 계획과 검증을 거칩니다.";
}

function openContext() {
  contextPanel.classList.add("open");
  scrim.classList.add("show");
}
function closeContext() {
  contextPanel.classList.remove("open");
  scrim.classList.remove("show");
}

function option(value, label) {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = label;
  return element;
}

function button(label, className, listener) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = label;
  element.addEventListener("click", () => Promise.resolve(listener()).catch(showError));
  return element;
}

async function request(url, init = {}) {
  const headers = { ...(init.headers || {}) };
  if (init.body !== undefined && !("content-type" in headers)) {
    headers["content-type"] = "application/json";
  }
  const response = await fetch(url, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

let toastTimer;
function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 2600);
}

function showError(error) {
  console.error(error);
  toast(error instanceof Error ? error.message : "요청을 완료하지 못했습니다.");
}
