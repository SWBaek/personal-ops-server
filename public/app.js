const body = document.body;
const currentDate = document.querySelector("#current-date");
const contextPanel = document.querySelector("#context-panel");
const contextToggles = document.querySelectorAll(".context-toggle");
const contextClose = document.querySelector(".context-close");
const contextScrim = document.querySelector(".context-scrim");
const toast = document.querySelector("#toast");
const aiForm = document.querySelector("#ai-form");
const aiMessage = document.querySelector("#ai-message");
const aiSubmit = document.querySelector("#ai-submit");
const aiCancel = document.querySelector("#ai-cancel");
const aiStatus = document.querySelector("#ai-status");
const aiTranscript = document.querySelector("#ai-transcript");
const dynamicTranscript = document.querySelector("#dynamic-transcript");
const conversationScroller = document.querySelector(".conversation");
const aiProvider = document.querySelector("#ai-provider");
const aiModel = document.querySelector("#ai-model");
const aiReasoning = document.querySelector("#ai-reasoning");
const modelSummary = document.querySelector("#model-summary");
const modelMenu = document.querySelector(".model-menu");
const newContext = document.querySelector("#new-context");
const settingsDialog = document.querySelector("#settings-dialog");
const settingsClose = document.querySelector("#settings-close");
const destructiveConfirmation = document.querySelector("#destructive-confirmation");
const confirmationTitle = document.querySelector("#confirmation-title");
const confirmationDescription = document.querySelector("#confirmation-description");
const confirmationCancel = document.querySelector("#confirmation-cancel");
const confirmationSubmit = document.querySelector("#confirmation-submit");
const settingsStatus = document.querySelector("#settings-status");

let providerOptions = [];
let conversationId = "";
let activeJobId = "";
let activeEventSource = null;
let toastTimer = null;
let pendingResetMode = "";

const resetModes = {
  chat: {
    title: "대화 기록을 삭제할까요?",
    description: "모든 비서 대화, 메시지, 응답 사용량과 AI 작업 기록이 영구 삭제됩니다.",
    actionLabel: "대화 기록 삭제",
    endpoint: "/api/ai/history/clear",
    confirmation: "DELETE_AI_HISTORY",
    success: "대화 기록을 모두 삭제했습니다.",
  },
  all: {
    title: "모든 데이터를 초기화할까요?",
    description: "현재 애플리케이션의 수집 자료, 작업, 모든 비서 대화와 AI 작업 기록이 영구 삭제됩니다. CLI 로그인과 서버 설정은 유지됩니다.",
    actionLabel: "모든 데이터 초기화",
    endpoint: "/api/system/reset-data",
    confirmation: "RESET_ALL_DATA",
    success: "애플리케이션 데이터를 모두 초기화했습니다.",
  },
};

currentDate.textContent = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  weekday: "short",
}).format(new Date());

for (const toggle of contextToggles) {
  toggle.addEventListener("click", () => setContextOpen(!body.classList.contains("context-open")));
}
contextClose.addEventListener("click", () => setContextOpen(false));
contextScrim.addEventListener("click", () => setContextOpen(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setContextOpen(false);
});

for (const button of document.querySelectorAll("[data-view]")) {
  button.addEventListener("click", () => {
    if (button.dataset.view === "비서") return;
    showToast(`${button.dataset.view} 화면은 구조 확정 후 연결됩니다.`);
  });
}

for (const button of document.querySelectorAll("[data-prototype-action]")) {
  button.addEventListener("click", () => showToast(`${button.dataset.prototypeAction} 기능은 현재 UI 시안입니다.`));
}

document.querySelector("#search-button").addEventListener("click", () => showToast("통합 검색은 다음 화면 설계에서 연결합니다."));
document.querySelector("#attach-button").addEventListener("click", () => showToast("자료 추가 흐름은 UI 구조 확정 후 연결합니다."));
document.querySelector("#settings-button").addEventListener("click", openSettings);
document.querySelector("#mobile-settings-button").addEventListener("click", openSettings);
settingsClose.addEventListener("click", () => settingsDialog.close());
settingsDialog.addEventListener("click", (event) => {
  if (event.target === settingsDialog) settingsDialog.close();
});

for (const button of document.querySelectorAll("[data-reset-mode]")) {
  button.addEventListener("click", () => showResetConfirmation(button.dataset.resetMode));
}
confirmationCancel.addEventListener("click", hideResetConfirmation);
confirmationSubmit.addEventListener("click", performDataReset);

for (const button of document.querySelectorAll("[data-prompt]")) {
  button.addEventListener("click", () => {
    aiMessage.value = button.dataset.prompt;
    resizeComposer();
    aiMessage.focus();
  });
}

aiMessage.addEventListener("input", resizeComposer);
aiMessage.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    aiForm.requestSubmit();
  }
});

aiProvider.addEventListener("change", () => {
  refreshModelControls();
  updateModelSummary();
});
aiModel.addEventListener("change", updateModelSummary);
aiReasoning.addEventListener("change", updateModelSummary);

newContext.addEventListener("click", async () => {
  if (!conversationId) {
    dynamicTranscript.replaceChildren();
    aiMessage.focus();
    return;
  }
  if (!window.confirm("현재 대화를 보관하고 새 문맥을 시작할까요?")) return;
  newContext.disabled = true;
  aiStatus.textContent = "새 문맥을 준비하는 중…";
  try {
    const result = await request(`/api/ai/conversations/${encodeURIComponent(conversationId)}/reset`, { method: "POST" });
    conversationId = result.conversation.id;
    dynamicTranscript.replaceChildren();
    aiStatus.textContent = "새 문맥이 준비되었습니다";
    applyConversation(result.conversation);
  } catch (error) {
    aiStatus.textContent = error.message;
  } finally {
    newContext.disabled = false;
  }
});

aiCancel.addEventListener("click", async () => {
  if (!activeJobId) return;
  aiCancel.disabled = true;
  aiStatus.textContent = "취소하는 중…";
  try {
    await request(`/api/ai/jobs/${encodeURIComponent(activeJobId)}/cancel`, { method: "POST" });
  } catch (error) {
    aiStatus.textContent = error.message;
    aiCancel.disabled = false;
  }
});

aiForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = aiMessage.value.trim();
  if (!text || activeJobId) return;

  setBusy(true);
  aiStatus.textContent = "요청을 준비하는 중…";
  try {
    if (!conversationId) {
      const created = await request("/api/ai/conversations", {
        method: "POST",
        body: JSON.stringify({
          assistantSlot: 1,
          provider: aiProvider.value,
          model: aiModel.value,
          reasoningEffort: aiReasoning.value,
        }),
      });
      conversationId = created.conversation.id;
      applyConversation(created.conversation);
    }

    const submitted = await request(`/api/ai/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: "POST",
      body: JSON.stringify({
        clientRequestId: createClientRequestId(),
        message: text,
        model: aiModel.value,
        reasoningEffort: aiReasoning.value,
      }),
    });
    appendMessage("user", submitted.userMessage.content);
    const assistantNode = appendMessage("assistant", "", "응답 생성 중…", "streaming");
    aiMessage.value = "";
    resizeComposer();
    activeJobId = submitted.job.id;
    aiStatus.textContent = "비서가 답변하는 중…";
    modelMenu.open = false;
    connectToJob(activeJobId, assistantNode);
  } catch (error) {
    appendMessage("error", error.message);
    aiStatus.textContent = "요청을 완료하지 못했습니다";
    finishRequest();
  }
});

function setContextOpen(open) {
  body.classList.toggle("context-open", open);
  for (const toggle of contextToggles) toggle.setAttribute("aria-expanded", String(open));
  contextPanel.setAttribute("aria-hidden", String(!open && window.matchMedia("(max-width: 960px)").matches));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2200);
}

function openSettings() {
  hideResetConfirmation();
  settingsDialog.showModal();
}

function showResetConfirmation(modeName) {
  const mode = resetModes[modeName];
  if (!mode) return;
  pendingResetMode = modeName;
  confirmationTitle.textContent = mode.title;
  confirmationDescription.textContent = mode.description;
  confirmationSubmit.textContent = mode.actionLabel;
  confirmationSubmit.disabled = false;
  settingsStatus.textContent = "";
  destructiveConfirmation.hidden = false;
  confirmationSubmit.focus();
}

function hideResetConfirmation() {
  pendingResetMode = "";
  destructiveConfirmation.hidden = true;
  confirmationSubmit.disabled = false;
  settingsStatus.textContent = "";
}

async function performDataReset() {
  const mode = resetModes[pendingResetMode];
  if (!mode) return;
  confirmationSubmit.disabled = true;
  confirmationCancel.disabled = true;
  settingsStatus.textContent = "삭제하는 중…";
  try {
    await request(mode.endpoint, {
      method: "POST",
      body: JSON.stringify({ confirmation: mode.confirmation }),
    });
    resetConversationUi();
    settingsDialog.close();
    showToast(mode.success);
  } catch (error) {
    settingsStatus.textContent = error.message;
    confirmationSubmit.disabled = false;
  } finally {
    confirmationCancel.disabled = false;
  }
}

function resetConversationUi() {
  activeEventSource?.close();
  activeEventSource = null;
  activeJobId = "";
  conversationId = "";
  dynamicTranscript.replaceChildren();
  aiProvider.disabled = false;
  aiMessage.value = "";
  resizeComposer();
  setBusy(false);
  aiStatus.textContent = "비서에게 자연어로 지시하세요";
  conversationScroller.scrollTo({ top: 0 });
}

function resizeComposer() {
  aiMessage.style.height = "auto";
  aiMessage.style.height = `${Math.min(aiMessage.scrollHeight, 128)}px`;
}

async function initializeAi() {
  const [options, conversations] = await Promise.all([
    request("/api/ai/options"),
    request("/api/ai/conversations"),
  ]);
  providerOptions = options.providers;
  replaceOptions(aiProvider, providerOptions, aiProvider.value);
  refreshModelControls();

  const conversation = conversations.conversations.find((item) => item.assistantSlot === 1);
  if (conversation) {
    conversationId = conversation.id;
    applyConversation(conversation);
    await loadConversation(conversation.id);
  } else {
    aiStatus.textContent = "비서에게 자연어로 지시하세요";
  }
  updateModelSummary();
}

async function loadConversation(id) {
  const result = await request(`/api/ai/conversations/${encodeURIComponent(id)}`);
  conversationId = result.conversation.id;
  applyConversation(result.conversation);
  renderMessages(result.messages);
  const active = [...result.messages].reverse().find((message) => message.role === "assistant" && ["pending", "streaming"].includes(message.status));
  if (active?.jobId) {
    const node = dynamicTranscript.querySelector(`[data-message-id="${CSS.escape(active.id)}"]`);
    if (node) {
      setBusy(true);
      activeJobId = active.jobId;
      connectToJob(activeJobId, node);
    }
  }
}

function applyConversation(conversation) {
  aiProvider.value = conversation.provider;
  aiProvider.disabled = true;
  refreshModelControls();
  if ([...aiModel.options].some((option) => option.value === conversation.defaultModel)) aiModel.value = conversation.defaultModel;
  if ([...aiReasoning.options].some((option) => option.value === conversation.defaultReasoningEffort)) aiReasoning.value = conversation.defaultReasoningEffort;
  updateModelSummary();
}

function refreshModelControls() {
  const provider = providerOptions.find((item) => item.id === aiProvider.value) ?? providerOptions[0];
  if (!provider) return;
  if (!aiProvider.value) aiProvider.value = provider.id;
  replaceOptions(aiModel, provider.models, aiModel.value);
  replaceOptions(aiReasoning, provider.reasoningEfforts, aiReasoning.value);
}

function replaceOptions(select, options, preferredValue) {
  select.replaceChildren(...options.map((option) => {
    const node = document.createElement("option");
    node.value = option.id;
    node.textContent = option.label;
    return node;
  }));
  if (options.some((option) => option.id === preferredValue)) select.value = preferredValue;
}

function updateModelSummary() {
  const providerLabel = aiProvider.selectedOptions[0]?.textContent ?? "AI";
  const modelLabel = aiModel.selectedOptions[0]?.textContent ?? "기본 모델";
  modelSummary.textContent = `${providerLabel} · ${modelLabel}`;
}

function renderMessages(messages) {
  dynamicTranscript.replaceChildren(...messages.map((message) => {
    const role = message.status === "failed" || message.status === "cancelled" ? "error" : message.role;
    const fallback = message.status === "cancelled" ? "취소된 요청" : message.status === "failed" ? "완료되지 않은 요청" : "";
    const node = buildMessage(role, message.content || fallback, formatMeta(message));
    node.dataset.messageId = message.id;
    if (["pending", "streaming"].includes(message.status)) node.classList.add("streaming");
    return node;
  }));
  scrollConversationToBottom();
}

function appendMessage(role, text, meta = "", stateClass = "") {
  const node = buildMessage(role, text, meta);
  if (stateClass) node.classList.add(stateClass);
  dynamicTranscript.append(node);
  scrollConversationToBottom();
  return node;
}

function scrollConversationToBottom() {
  requestAnimationFrame(() => {
    conversationScroller.scrollTo({ top: conversationScroller.scrollHeight });
  });
}

function buildMessage(role, text, meta = "") {
  const article = document.createElement("article");
  article.className = `turn message-turn ${role}-turn`;
  if (role !== "user") {
    const avatar = document.createElement("div");
    avatar.className = "assistant-avatar";
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#icon-spark");
    icon.append(use);
    avatar.append(icon);
    article.append(avatar);
  }
  const content = document.createElement("div");
  content.className = "message-body";
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  const detail = document.createElement("small");
  detail.textContent = meta;
  content.append(paragraph, detail);
  article.append(content);
  return article;
}

function connectToJob(jobId, assistantNode) {
  activeEventSource?.close();
  const source = new EventSource(`/api/ai/jobs/${encodeURIComponent(jobId)}/events`);
  activeEventSource = source;
  const paragraph = assistantNode.querySelector("p");
  const detail = assistantNode.querySelector("small");

  source.addEventListener("snapshot", (event) => {
    const data = JSON.parse(event.data);
    paragraph.textContent = data.message.content;
    detail.textContent = formatMeta(data.message);
  });
  source.addEventListener("delta", (event) => {
    const data = JSON.parse(event.data);
    paragraph.textContent += data.delta;
    scrollConversationToBottom();
  });
  source.addEventListener("status", (event) => {
    const data = JSON.parse(event.data);
    aiStatus.textContent = data.status === "running" ? "비서가 답변하는 중…" : data.status;
  });
  source.addEventListener("completed", (event) => {
    const data = JSON.parse(event.data);
    paragraph.textContent = data.message.content;
    detail.textContent = formatMeta(data.message, data.streamMode);
    assistantNode.classList.remove("streaming");
    aiStatus.textContent = "응답 완료";
    source.close();
    finishRequest();
  });
  source.addEventListener("failed", (event) => {
    const data = JSON.parse(event.data);
    assistantNode.classList.remove("streaming");
    assistantNode.classList.add("error-turn");
    if (!paragraph.textContent) paragraph.textContent = data.error;
    detail.textContent = data.error;
    aiStatus.textContent = data.job.status === "cancelled" ? "요청 취소됨" : "요청 실패";
    source.close();
    finishRequest();
  });
  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) return;
    source.close();
    aiStatus.textContent = "연결을 복구하는 중…";
    setTimeout(() => void loadConversation(conversationId), 500);
  };
}

function setBusy(busy) {
  aiSubmit.disabled = busy;
  aiCancel.hidden = !busy;
  aiCancel.disabled = false;
  newContext.disabled = busy;
}

function finishRequest() {
  activeEventSource?.close();
  activeEventSource = null;
  activeJobId = "";
  setBusy(false);
  aiMessage.focus();
}

function formatMeta(message, streamMode = "") {
  const parts = [
    message.provider,
    message.model === "default" ? "기본 모델" : message.model,
    message.reasoningEffort === "default" ? "기본 추론" : message.reasoningEffort,
  ];
  if (message.durationMs !== null && message.durationMs !== undefined) parts.push(`${(message.durationMs / 1000).toFixed(1)}초`);
  if (streamMode === "buffered") parts.push("호환 모드");
  return parts.filter(Boolean).join(" · ");
}

function createClientRequestId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

async function request(url, init = {}) {
  const headers = { ...(init.headers || {}) };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(url, { ...init, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `요청 실패 (${response.status})`);
  return data;
}

initializeAi().catch((error) => {
  aiStatus.textContent = error.message;
});
