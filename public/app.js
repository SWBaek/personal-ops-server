const body = document.body;
const currentDate = document.querySelector("#current-date");
const viewKicker = document.querySelector("#view-kicker");
const viewTitle = document.querySelector("#view-title");
const assistantView = document.querySelector("#assistant-view");
const projectOverview = document.querySelector("#project-overview");
const projectsView = document.querySelector("#projects-view");
const projectsRefresh = document.querySelector("#projects-refresh");
const projectsStatus = document.querySelector("#projects-status");
const projectsList = document.querySelector("#projects-list");
const projectDetail = document.querySelector("#project-detail");
const projectDetailEmpty = document.querySelector("#project-detail-empty");
const projectDetailContent = document.querySelector("#project-detail-content");
const projectDetailName = document.querySelector("#project-detail-name");
const projectDetailAliases = document.querySelector("#project-detail-aliases");
const projectCoverage = document.querySelector("#project-coverage");
const projectUpdated = document.querySelector("#project-updated");
const projectBriefSections = document.querySelector("#project-brief-sections");
const projectSourceList = document.querySelector("#project-source-list");
const projectBack = document.querySelector("#project-back");
const projectBriefRequest = document.querySelector("#project-brief-request");
const contextProjectList = document.querySelector("#context-project-list");
const contextProjectsOpen = document.querySelector("#context-projects-open");
const inboxView = document.querySelector("#inbox-view");
const inboxList = document.querySelector("#inbox-list");
const inboxStatus = document.querySelector("#inbox-status");
const inboxCount = document.querySelector("#inbox-count");
const inboxRefresh = document.querySelector("#inbox-refresh");
const debugView = document.querySelector("#debug-view");
const debugSummary = document.querySelector("#debug-summary");
const debugDataset = document.querySelector("#debug-dataset");
const debugLimit = document.querySelector("#debug-limit");
const debugRefresh = document.querySelector("#debug-refresh");
const debugStatus = document.querySelector("#debug-status");
const debugTableWrap = document.querySelector("#debug-table-wrap");
const debugTableHead = document.querySelector("#debug-table-head");
const debugTableBody = document.querySelector("#debug-table-body");
const assistantComposer = document.querySelector("#assistant-composer");
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
const mobileDebugButton = document.querySelector("#mobile-debug-button");
const assistantProfileForm = document.querySelector("#assistant-profile-form");
const assistantProfileName = document.querySelector("#assistant-profile-name");
const assistantOwnerAddress = document.querySelector("#assistant-owner-address");
const assistantRoleDescription = document.querySelector("#assistant-role-description");
const assistantCommunicationStyle = document.querySelector("#assistant-communication-style");
const assistantWorkingPrinciples = document.querySelector("#assistant-working-principles");
const assistantTimezone = document.querySelector("#assistant-timezone");
const assistantProfileVersion = document.querySelector("#assistant-profile-version");
const assistantProfileStatus = document.querySelector("#assistant-profile-status");
const assistantProfileSubmit = document.querySelector("#assistant-profile-submit");
const aiRuntimeStatus = document.querySelector("#ai-runtime-status");
const previewAssistantName = document.querySelector("#preview-assistant-name");

let providerOptions = [];
let conversationId = "";
let conversationProvider = "";
let activeJobId = "";
let activeEventSource = null;
let toastTimer = null;
let pendingResetMode = "";
let activeInboxStatus = "pending";
let assistantProfile = { name: "주 비서" };
let selectedProjectId = "";
let loadedProjects = [];
let selectedProjectBrief = null;

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
    description: "현재 애플리케이션의 수집 자료, 비서 메모, 작업, 모든 비서 대화와 AI 작업 기록이 영구 삭제되고 비서 구성이 기본값으로 돌아갑니다. CLI 로그인, 관리형 AI 런타임과 Tailscale 설정은 유지됩니다.",
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
    if (["비서", "프로젝트 개요", "프로젝트", "받은함", "디버그"].includes(button.dataset.view)) {
      showView(button.dataset.view);
      return;
    }
    showToast(`${button.dataset.view} 화면은 구조 확정 후 연결됩니다.`);
  });
}

projectsRefresh.addEventListener("click", () => void loadProjects());
inboxRefresh.addEventListener("click", () => void loadInbox());
debugRefresh.addEventListener("click", () => void loadDebug());
debugDataset.addEventListener("change", () => void loadDebugDataset());
debugLimit.addEventListener("change", () => void loadDebugDataset());
for (const button of document.querySelectorAll("[data-inbox-status]")) {
  button.addEventListener("click", () => {
    activeInboxStatus = button.dataset.inboxStatus;
    for (const tab of document.querySelectorAll("[data-inbox-status]")) {
      const active = tab === button;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    }
    void loadInbox();
  });
}

for (const button of document.querySelectorAll("[data-prototype-action]")) {
  button.addEventListener("click", () => showToast(`${button.dataset.prototypeAction} 기능은 현재 UI 시안입니다.`));
}

for (const button of document.querySelectorAll("[data-project-chat]")) {
  button.addEventListener("click", () => prepareProjectChat(""));
}
contextProjectsOpen.addEventListener("click", () => showView("프로젝트"));
projectBack.addEventListener("click", () => {
  selectedProjectId = "";
  selectedProjectBrief = null;
  projectDetail.classList.remove("has-selection");
  projectDetailContent.hidden = true;
  projectDetailEmpty.hidden = false;
  projectsView.classList.remove("detail-open");
});
projectBriefRequest.addEventListener("click", () => {
  prepareProjectChat(selectedProjectBrief?.project.name || "");
});

document.querySelector("#search-button").addEventListener("click", () => showToast("통합 검색은 다음 화면 설계에서 연결합니다."));
document.querySelector("#attach-button").addEventListener("click", () => showToast("자료 추가 흐름은 UI 구조 확정 후 연결합니다."));
document.querySelector("#settings-button").addEventListener("click", openSettings);
document.querySelector("#mobile-settings-button").addEventListener("click", openSettings);
mobileDebugButton.addEventListener("click", () => {
  settingsDialog.close();
  showView("디버그");
});
settingsClose.addEventListener("click", () => settingsDialog.close());
settingsDialog.addEventListener("click", (event) => {
  if (event.target === settingsDialog) settingsDialog.close();
});

for (const button of document.querySelectorAll("[data-reset-mode]")) {
  button.addEventListener("click", () => showResetConfirmation(button.dataset.resetMode));
}
confirmationCancel.addEventListener("click", hideResetConfirmation);
confirmationSubmit.addEventListener("click", performDataReset);
assistantProfileForm.addEventListener("submit", (event) => void saveAssistantProfile(event));

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

aiProvider.addEventListener("change", () => void changeAiProvider());
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

function showView(view, loadData = true) {
  const overviewActive = view === "프로젝트 개요";
  const projectsActive = view === "프로젝트";
  const inboxActive = view === "받은함";
  const debugActive = view === "디버그";
  body.classList.toggle("overview-active", overviewActive);
  body.classList.toggle("projects-active", projectsActive);
  body.classList.toggle("inbox-active", inboxActive);
  body.classList.toggle("debug-active", debugActive);
  assistantView.hidden = overviewActive || projectsActive || inboxActive || debugActive;
  assistantComposer.hidden = overviewActive || projectsActive || inboxActive || debugActive;
  projectOverview.hidden = !overviewActive;
  projectsView.hidden = !projectsActive;
  inboxView.hidden = !inboxActive;
  debugView.hidden = !debugActive;
  viewKicker.textContent = overviewActive
    ? "PERSONAL OPS"
    : projectsActive
      ? "운영 상태"
    : inboxActive
      ? "비서 메모"
      : debugActive
        ? "개발 도구"
        : assistantProfile.name;
  viewTitle.textContent = overviewActive
    ? "프로젝트 개요"
    : projectsActive
      ? "프로젝트"
    : inboxActive
      ? "받은함"
      : debugActive
        ? "데이터 디버그"
        : "운영 브리핑";
  setContextOpen(false);

  for (const button of document.querySelectorAll("[data-view]")) {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }

  if (overviewActive) projectOverview.scrollTo({ top: 0 });
  else if (projectsActive && loadData) void loadProjects();
  else if (inboxActive && loadData) void loadInbox();
  else if (debugActive && loadData) void loadDebug();
  else aiMessage.focus();
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
  void loadAssistantSettings();
}

async function loadAssistantSettings() {
  assistantProfileStatus.textContent = "";
  try {
    const [profileResult, runtimeResult] = await Promise.all([
      request("/api/assistant/profile"),
      request("/api/system/runtime"),
    ]);
    applyAssistantProfile(profileResult.profile);
    const runtime = runtimeResult.runtime;
    aiRuntimeStatus.textContent = `${runtime.mode === "managed" ? "관리형" : "사용자 지정"} · ${runtime.environment}`;
    aiRuntimeStatus.dataset.isolated = String(runtime.isolated);
  } catch (error) {
    assistantProfileStatus.textContent = error.message;
    aiRuntimeStatus.textContent = "확인 실패";
  }
}

function applyAssistantProfile(profile) {
  assistantProfile = profile;
  assistantProfileName.value = profile.name;
  assistantOwnerAddress.value = profile.ownerAddress;
  assistantRoleDescription.value = profile.roleDescription;
  assistantCommunicationStyle.value = profile.communicationStyle;
  assistantWorkingPrinciples.value = profile.workingPrinciples;
  assistantTimezone.value = profile.timezone;
  assistantProfileVersion.textContent = `버전 ${profile.version}`;
  previewAssistantName.textContent = profile.name;
  if (!body.classList.contains("overview-active")
    && !body.classList.contains("projects-active")
    && !body.classList.contains("inbox-active")
    && !body.classList.contains("debug-active")) {
    viewKicker.textContent = profile.name;
  }
}

async function saveAssistantProfile(event) {
  event.preventDefault();
  if (!window.confirm("이 구성을 앞으로의 비서 응답에 적용할까요? 시스템 보안과 승인 규칙은 변경되지 않습니다.")) return;
  assistantProfileSubmit.disabled = true;
  assistantProfileStatus.textContent = "비서 구성을 적용하는 중…";
  try {
    const result = await request("/api/assistant/profile", {
      method: "PUT",
      body: JSON.stringify({
        confirmation: "UPDATE_ASSISTANT_PROFILE",
        name: assistantProfileName.value,
        ownerAddress: assistantOwnerAddress.value,
        roleDescription: assistantRoleDescription.value,
        communicationStyle: assistantCommunicationStyle.value,
        workingPrinciples: assistantWorkingPrinciples.value,
        timezone: assistantTimezone.value,
      }),
    });
    applyAssistantProfile(result.profile);
    assistantProfileStatus.textContent = "새 비서 구성을 적용했습니다.";
    showToast("비서 구성이 변경되었습니다.");
  } catch (error) {
    assistantProfileStatus.textContent = error.message;
  } finally {
    assistantProfileSubmit.disabled = false;
  }
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
    if (pendingResetMode === "all") {
      await loadAssistantSettings();
      await loadProjects();
    }
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
  conversationProvider = "";
  dynamicTranscript.replaceChildren();
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
  conversationProvider = conversation.provider;
  aiProvider.value = conversation.provider;
  refreshModelControls();
  if ([...aiModel.options].some((option) => option.value === conversation.defaultModel)) aiModel.value = conversation.defaultModel;
  if ([...aiReasoning.options].some((option) => option.value === conversation.defaultReasoningEffort)) aiReasoning.value = conversation.defaultReasoningEffort;
  updateModelSummary();
}

async function changeAiProvider() {
  const requestedProvider = aiProvider.value;
  const previousProvider = conversationProvider;
  refreshModelControls();
  updateModelSummary();

  if (!conversationId || !previousProvider || requestedProvider === previousProvider) return;
  if (activeJobId) {
    restoreProviderSelection(previousProvider);
    aiStatus.textContent = "응답이 끝난 뒤 제공자를 변경해주세요";
    return;
  }

  const providerLabel = aiProvider.selectedOptions[0]?.textContent ?? requestedProvider;
  if (!window.confirm(`${providerLabel}(으)로 전환할까요? 현재 대화는 보관하고 새 AI 문맥을 시작합니다.`)) {
    restoreProviderSelection(previousProvider);
    return;
  }

  const model = aiModel.value;
  const reasoningEffort = aiReasoning.value;
  aiProvider.disabled = true;
  aiModel.disabled = true;
  aiReasoning.disabled = true;
  newContext.disabled = true;
  aiStatus.textContent = `${providerLabel}(으)로 전환하는 중…`;
  try {
    const result = await request(`/api/ai/conversations/${encodeURIComponent(conversationId)}/reset`, {
      method: "POST",
      body: JSON.stringify({
        provider: requestedProvider,
        model,
        reasoningEffort,
      }),
    });
    conversationId = result.conversation.id;
    dynamicTranscript.replaceChildren();
    applyConversation(result.conversation);
    modelMenu.open = false;
    aiStatus.textContent = `${providerLabel}(으)로 전환했습니다`;
    aiMessage.focus();
  } catch (error) {
    restoreProviderSelection(previousProvider);
    aiStatus.textContent = error.message;
  } finally {
    aiProvider.disabled = false;
    aiModel.disabled = false;
    aiReasoning.disabled = false;
    newContext.disabled = false;
  }
}

function restoreProviderSelection(provider) {
  aiProvider.value = provider;
  refreshModelControls();
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
    renderProjectBriefMessage(node, message);
    renderGrounding(node, message);
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
    renderProjectBriefMessage(assistantNode, data.message);
    renderGrounding(assistantNode, data.message);
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
    renderProjectBriefMessage(assistantNode, data.message);
    renderGrounding(assistantNode, data.message);
    assistantNode.classList.remove("streaming");
    aiStatus.textContent = "응답 완료";
    source.close();
    finishRequest();
    void refreshInboxCount();
    void loadProjects();
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

async function loadProjects() {
  projectsStatus.hidden = false;
  projectsStatus.textContent = "프로젝트를 불러오는 중…";
  try {
    const result = await request("/api/projects");
    loadedProjects = result.projects;
    renderContextProjects(loadedProjects);
    projectsList.replaceChildren(...loadedProjects.map(buildProjectListItem));
    if (!loadedProjects.length) {
      projectsStatus.textContent = "아직 확인된 프로젝트가 없습니다. 비서 대화에서 프로젝트 정보를 전달해 주세요.";
      selectedProjectId = "";
      selectedProjectBrief = null;
      projectDetailContent.hidden = true;
      projectDetailEmpty.hidden = false;
      projectsView.classList.remove("detail-open");
      return;
    }
    projectsStatus.hidden = true;
    if (selectedProjectId && loadedProjects.some((project) => project.id === selectedProjectId)) {
      await loadProjectDetail(selectedProjectId);
    } else if (window.matchMedia("(min-width: 961px)").matches) {
      await loadProjectDetail(loadedProjects[0].id);
    }
  } catch (error) {
    projectsStatus.textContent = error.message;
  }
}

function buildProjectListItem(project) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "projects-list-item";
  button.dataset.projectId = project.id;
  button.setAttribute("aria-pressed", String(project.id === selectedProjectId));
  const mark = document.createElement("span");
  mark.className = "project-list-mark";
  mark.textContent = project.name.slice(0, 2).toLocaleUpperCase("ko-KR");
  const copy = document.createElement("span");
  const name = document.createElement("strong");
  name.textContent = project.name;
  const status = document.createElement("small");
  status.textContent = project.coverage === "complete"
    ? "근거 분류 완료"
    : project.coverageReasons.join(" · ") || "coverage 확인 필요";
  copy.append(name, status);
  const coverage = document.createElement("em");
  coverage.className = `coverage-dot coverage-${project.coverage}`;
  coverage.textContent = project.coverage;
  button.append(mark, copy, coverage);
  button.addEventListener("click", () => void loadProjectDetail(project.id));
  return button;
}

async function loadProjectDetail(projectId) {
  selectedProjectId = projectId;
  for (const item of projectsList.querySelectorAll("[data-project-id]")) {
    const selected = item.dataset.projectId === projectId;
    item.classList.toggle("active", selected);
    item.setAttribute("aria-pressed", String(selected));
  }
  projectDetailEmpty.hidden = true;
  projectDetailContent.hidden = false;
  projectDetail.classList.add("has-selection");
  projectsView.classList.add("detail-open");
  projectDetailName.textContent = "불러오는 중…";
  projectBriefSections.replaceChildren();
  projectSourceList.replaceChildren();
  try {
    const result = await request(`/api/projects/${encodeURIComponent(projectId)}`);
    selectedProjectBrief = result.brief;
    renderProjectDetail(result.brief);
  } catch (error) {
    projectDetailName.textContent = "프로젝트를 불러오지 못했습니다.";
    projectCoverage.className = "project-coverage coverage-partial";
    projectCoverage.textContent = error.message;
  }
}

function renderProjectDetail(brief) {
  projectDetailName.textContent = brief.project.name;
  projectDetailAliases.textContent = brief.project.aliases.length
    ? `별칭 · ${brief.project.aliases.join(" · ")}`
    : "등록된 별칭 없음";
  projectCoverage.className = `project-coverage coverage-${brief.coverage}`;
  projectCoverage.textContent = coverageText(brief.coverage, brief.coverageReasons);
  projectUpdated.textContent = `마지막 갱신 ${formatDateTime(brief.project.updatedAt)} · 기준 ${formatDateTime(brief.asOf)} · ${brief.timezone}`;
  const referenceMap = new Map(brief.references.map((reference) => [reference.referenceId, reference]));
  const sectionDefinitions = [
    ["outcomes", "결과"],
    ["currentState", "현재 상태"],
    ["openActions", "열린 Action과 날짜"],
    ["decisions", "결정"],
    ["dependencies", "의존성"],
    ["risks", "위험"],
    ["meetings", "관련 회의"],
    ["judgments", "사용자 판단 필요"],
    ["conflictsAndUnknowns", "충돌과 미확인 사항"],
  ];
  projectBriefSections.replaceChildren(...sectionDefinitions.map(([key, label]) =>
    buildProjectSection(label, brief.sections[key] || [], referenceMap, brief.coverage)));
  projectSourceList.replaceChildren(...brief.references.map(buildProjectSourceChip));
  if (!brief.references.length) {
    const empty = document.createElement("p");
    empty.className = "project-section-empty";
    empty.textContent = "연결된 출처가 없습니다.";
    projectSourceList.append(empty);
  }
}

function buildProjectSection(label, items, referenceMap, coverage) {
  const section = document.createElement("section");
  section.className = "project-brief-section";
  const heading = document.createElement("div");
  heading.className = "project-section-heading";
  const kicker = document.createElement("p");
  kicker.textContent = String(items.length).padStart(2, "0");
  const title = document.createElement("h3");
  title.textContent = label;
  heading.append(kicker, title);
  const list = document.createElement("div");
  list.className = "project-fact-list";
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "project-section-empty";
    empty.textContent = coverage === "complete"
      ? "현재 분류된 근거에는 기록이 없습니다."
      : "확인된 기록이 없습니다. coverage가 완전하지 않아 부재를 단정하지 않습니다.";
    list.append(empty);
  } else {
    for (const item of items) {
      const article = document.createElement("article");
      const text = document.createElement("p");
      text.textContent = formatProjectFact(item);
      const sources = document.createElement("div");
      sources.className = "project-item-sources";
      for (const referenceId of item.referenceIds) {
        const reference = referenceMap.get(referenceId);
        if (reference) sources.append(buildProjectSourceChip(reference, true));
      }
      article.append(text, sources);
      list.append(article);
    }
  }
  section.append(heading, list);
  return section;
}

function buildProjectSourceChip(reference, compact = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `project-source-chip${compact ? " compact" : ""}`;
  button.textContent = `${reference.summary} · v${reference.version}`;
  button.title = reference.referenceId;
  button.addEventListener("click", () => void openMemoSource(reference.memoId, reference.version));
  return button;
}

function formatProjectFact(item) {
  const details = [];
  if (item.status) details.push(item.status);
  if (item.plannedOn) details.push(`계획 ${item.plannedOn}`);
  if (item.dueOn) details.push(`기한 ${item.dueOn}`);
  if (item.occurredAt) details.push(item.occurredAt);
  return `${item.text}${details.length ? ` · ${details.join(" · ")}` : ""}`;
}

function coverageText(coverage, reasons = []) {
  if (coverage === "complete") return "Complete · 현재 메모가 모두 분류되었고 snapshot 전체를 조회했습니다.";
  if (coverage === "partial") return `Partial · ${reasons.join(" · ") || "일부 근거를 완전히 분류하거나 조회하지 못했습니다."}`;
  return `Unknown · ${reasons.join(" · ") || "프로젝트와 조회 범위를 확정하지 못했습니다."}`;
}

function renderContextProjects(projects) {
  contextProjectList.replaceChildren();
  if (!projects.length) {
    const empty = document.createElement("p");
    empty.className = "context-empty";
    empty.textContent = "아직 확인된 프로젝트가 없습니다.";
    contextProjectList.append(empty);
    return;
  }
  for (const project of projects.slice(0, 4)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "project-row";
    const symbol = document.createElement("span");
    symbol.className = "project-symbol";
    symbol.textContent = project.name.slice(0, 2);
    const copy = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = project.name;
    const small = document.createElement("small");
    small.textContent = project.coverage === "complete" ? "근거 분류 완료" : "coverage 확인 필요";
    copy.append(strong, small);
    button.append(symbol, copy);
    button.addEventListener("click", () => {
      selectedProjectId = project.id;
      showView("프로젝트");
    });
    contextProjectList.append(button);
  }
}

function prepareProjectChat(projectName) {
  showView("비서", false);
  aiMessage.value = projectName
    ? `${projectName} 프로젝트의 현재 상태, 열린 Action, 결정, 의존성, 위험, 관련 회의와 제가 판단할 점을 브리핑해 주세요.`
    : "새 프로젝트의 이름, 원하는 결과, 현재 상태와 알고 있는 행동·결정·위험을 말씀드릴게요.";
  resizeComposer();
  aiMessage.focus();
}

async function loadInbox() {
  inboxStatus.hidden = false;
  inboxStatus.textContent = "메모를 불러오는 중…";
  inboxList.replaceChildren();
  try {
    const result = await request(`/api/inbox?status=${encodeURIComponent(activeInboxStatus)}`);
    const items = activeInboxStatus === "confirmed" ? result.memos : result.proposals;
    inboxCount.textContent = String(activeInboxStatus === "pending" ? items.length : Number(inboxCount.textContent || 0));
    if (!items.length) {
      inboxStatus.textContent = activeInboxStatus === "pending"
        ? "확인을 기다리는 메모가 없습니다."
        : activeInboxStatus === "confirmed"
          ? "아직 저장된 비서 메모가 없습니다."
          : "거절된 메모가 없습니다.";
      return;
    }
    inboxStatus.hidden = true;
    inboxList.replaceChildren(...items.map(buildInboxItem));
  } catch (error) {
    inboxStatus.textContent = error.message;
  }
}

async function refreshInboxCount() {
  try {
    const result = await request("/api/inbox?status=pending");
    inboxCount.textContent = String(result.proposals.length);
  } catch {
    inboxCount.textContent = "0";
  }
}

function buildInboxItem(item) {
  const article = document.createElement("article");
  article.className = "inbox-item";
  if (item.id) article.id = `memo-${item.id}`;
  const heading = document.createElement("div");
  heading.className = "inbox-item-heading";
  const copy = document.createElement("div");
  const label = document.createElement("small");
  label.textContent = item.status === "pending" ? "확인 대기" : item.status === "rejected" ? "거절됨" : `저장됨 · 버전 ${item.currentVersion}`;
  const title = document.createElement("h3");
  title.textContent = item.memo.summary;
  copy.append(label, title);
  const time = document.createElement("time");
  time.textContent = new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    .format(new Date(item.updatedAt || item.createdAt));
  heading.append(copy, time);

  const facets = document.createElement("div");
  facets.className = "inbox-facets";
  for (const facet of item.memo.facets) {
    const row = document.createElement("p");
    row.innerHTML = `<strong>${escapeHtml(facetLabel(facet.kind))}</strong><span>${escapeHtml(facet.text)}</span>`;
    facets.append(row);
  }

  const source = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "원문 보기";
  const quote = document.createElement("blockquote");
  quote.textContent = item.rawText;
  source.append(summary, quote);
  article.append(heading, facets, source);
  if (item.status === "pending") {
    const hint = document.createElement("p");
    hint.className = "inbox-confirm-hint";
    hint.textContent = "비서 대화에서 ‘저장해’, ‘고쳐줘’, ‘저장하지 마’라고 말씀하세요.";
    article.append(hint);
  }
  return article;
}

function renderProjectBriefMessage(messageNode, message) {
  const content = messageNode.querySelector(".message-body");
  const paragraph = content.querySelector(":scope > p");
  content.querySelector(".message-project-brief")?.remove();
  paragraph.hidden = false;
  if (message.role !== "assistant" || !message.projectBrief) return;

  const brief = message.projectBrief;
  paragraph.hidden = true;
  const panel = document.createElement("section");
  panel.className = "message-project-brief";
  const header = document.createElement("header");
  const copy = document.createElement("div");
  const kicker = document.createElement("p");
  kicker.textContent = "PROJECT BRIEF";
  const title = document.createElement("h3");
  title.textContent = brief.project.name;
  copy.append(kicker, title);
  const coverage = document.createElement("span");
  coverage.className = `message-coverage coverage-${message.coverage || brief.coverage}`;
  coverage.textContent = message.coverage || brief.coverage;
  header.append(copy, coverage);
  const coverageNote = document.createElement("p");
  coverageNote.className = "message-coverage-note";
  coverageNote.textContent = coverageText(message.coverage || brief.coverage, brief.coverageReasons);
  const sections = document.createElement("div");
  sections.className = "message-brief-grid";
  const referenceMap = new Map(brief.references.map((reference) => [reference.referenceId, reference]));
  const definitions = [
    ["outcomes", "결과"],
    ["currentState", "현재 상태"],
    ["openActions", "열린 Action과 날짜"],
    ["decisions", "결정"],
    ["dependencies", "의존성"],
    ["risks", "위험"],
    ["meetings", "관련 회의"],
    ["judgments", "사용자 판단 필요"],
    ["conflictsAndUnknowns", "충돌과 미확인 사항"],
  ];
  sections.append(...definitions.map(([key, label]) =>
    buildProjectSection(label, brief.sections[key] || [], referenceMap, message.coverage || brief.coverage)));
  panel.append(header, coverageNote, sections);
  const meta = content.querySelector(":scope > small");
  content.insertBefore(panel, meta);
}

function renderGrounding(messageNode, message) {
  const content = messageNode.querySelector(".message-body");
  content.querySelector(".grounding-panel")?.remove();
  if (message.role !== "assistant" || !message.groundingStatus) return;

  const panel = document.createElement("div");
  panel.className = `grounding-panel grounding-${message.groundingStatus}`;
  const label = document.createElement("span");
  label.className = "grounding-label";
  label.textContent = ({
    grounded: "저장 근거",
    insufficient: "저장 근거 부족",
    conflicting: "근거 충돌",
    not_applicable: "",
  })[message.groundingStatus] || "";
  if (label.textContent) panel.append(label);
  if (message.coverage) {
    const coverage = document.createElement("span");
    coverage.className = `grounding-coverage coverage-${message.coverage}`;
    coverage.textContent = `coverage ${message.coverage}`;
    panel.append(coverage);
  }

  for (const source of message.sources || []) {
    const link = document.createElement("a");
    link.className = "grounding-source";
    link.href = `#memo-${source.memoId}`;
    link.textContent = `${source.summary} · v${source.version}`;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      void openMemoSource(source.memoId, source.version);
    });
    panel.append(link);
  }

  for (const conflict of message.groundingConflicts || []) {
    const note = document.createElement("span");
    note.className = "grounding-conflict";
    note.textContent = conflict;
    panel.append(note);
  }

  if (panel.childElementCount) content.append(panel);
}

async function openMemoSource(memoId, version = null) {
  activeInboxStatus = "confirmed";
  for (const tab of document.querySelectorAll("[data-inbox-status]")) {
    const active = tab.dataset.inboxStatus === "confirmed";
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  }
  showView("받은함", false);
  if (version !== null) {
    inboxStatus.hidden = false;
    inboxStatus.textContent = "고정된 메모 버전을 불러오는 중…";
    inboxList.replaceChildren();
    try {
      const result = await request(
        `/api/inbox/${encodeURIComponent(memoId)}/versions/${encodeURIComponent(version)}`,
      );
      const memoVersion = result.memoVersion;
      const item = buildInboxItem({
        id: memoVersion.memoId,
        currentVersion: memoVersion.version,
        memo: memoVersion.memo,
        rawText: memoVersion.rawText,
        createdAt: memoVersion.createdAt,
        updatedAt: memoVersion.createdAt,
        projectionStatus: memoVersion.projectionStatus,
      });
      item.classList.add("source-highlight");
      const pin = document.createElement("p");
      pin.className = "version-pin-note";
      pin.textContent = `답변에서 사용한 고정 출처 · memo:${memoVersion.memoId}:v${memoVersion.version}`;
      item.prepend(pin);
      inboxList.append(item);
      inboxStatus.hidden = true;
    } catch (error) {
      inboxStatus.textContent = error.message;
    }
    return;
  }
  await loadInbox();
  const target = document.querySelector(`#memo-${CSS.escape(memoId)}`);
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
  target?.classList.add("source-highlight");
  if (target) setTimeout(() => target.classList.remove("source-highlight"), 1800);
}

function facetLabel(kind) {
  return ({ note: "메모", action: "행동", decision: "결정", knowledge: "지식", preference: "선호", open_question: "열린 질문" })[kind] || kind;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[character]);
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

async function loadDebug() {
  debugStatus.hidden = false;
  debugStatus.textContent = "SQLite 상태를 불러오는 중…";
  debugTableWrap.hidden = true;
  try {
    const result = await request("/api/debug/summary");
    const selected = debugDataset.value;
    debugDataset.replaceChildren(...result.summary.datasets.map((dataset) => {
      const option = document.createElement("option");
      option.value = dataset.id;
      option.textContent = `${dataset.label} (${dataset.count})`;
      return option;
    }));
    if ([...debugDataset.options].some((option) => option.value === selected)) {
      debugDataset.value = selected;
    }
    renderDebugSummary(result.summary);
    await loadDebugDataset();
  } catch (error) {
    debugStatus.textContent = error.message;
  }
}

async function loadDebugDataset() {
  if (!debugDataset.value) return;
  debugStatus.hidden = false;
  debugStatus.textContent = "행 데이터를 불러오는 중…";
  debugTableWrap.hidden = true;
  try {
    const result = await request(`/api/debug/data/${encodeURIComponent(debugDataset.value)}?limit=${encodeURIComponent(debugLimit.value)}`);
    renderDebugTable(result.rows);
  } catch (error) {
    debugStatus.textContent = error.message;
  }
}

function renderDebugSummary(summary) {
  const total = summary.datasets.reduce((sum, dataset) => sum + dataset.count, 0);
  const cards = [
    { label: "전체 행", value: total },
    { label: "확정 메모", value: summary.datasets.find((item) => item.id === "assistant_memos")?.count || 0 },
    { label: "메모 제안", value: summary.datasets.find((item) => item.id === "intake_proposals")?.count || 0 },
    { label: "AI 작업 상태", value: summary.activeAiJobs ? "처리 중" : "대기" },
  ];
  debugSummary.replaceChildren(...cards.map((card) => {
    const article = document.createElement("article");
    const strong = document.createElement("strong");
    strong.textContent = String(card.value);
    const span = document.createElement("span");
    span.textContent = card.label;
    article.append(strong, span);
    return article;
  }));
}

function renderDebugTable(rows) {
  debugTableHead.replaceChildren();
  debugTableBody.replaceChildren();
  if (!rows.length) {
    debugStatus.hidden = false;
    debugStatus.textContent = "이 테이블에는 아직 데이터가 없습니다.";
    return;
  }
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const headerRow = document.createElement("tr");
  for (const column of columns) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = column;
    headerRow.append(cell);
  }
  debugTableHead.append(headerRow);
  for (const row of rows) {
    const tableRow = document.createElement("tr");
    for (const column of columns) {
      const cell = document.createElement("td");
      const value = row[column];
      cell.textContent = value === null
        ? "NULL"
        : typeof value === "object"
          ? JSON.stringify(value, null, 2)
          : String(value ?? "");
      tableRow.append(cell);
    }
    debugTableBody.append(tableRow);
  }
  debugStatus.hidden = true;
  debugTableWrap.hidden = false;
}

function setBusy(busy) {
  aiSubmit.disabled = busy;
  aiCancel.hidden = !busy;
  aiCancel.disabled = false;
  newContext.disabled = busy;
  aiProvider.disabled = busy;
  aiModel.disabled = busy;
  aiReasoning.disabled = busy;
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
void loadAssistantSettings();
void refreshInboxCount();
void loadProjects();
