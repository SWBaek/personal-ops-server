const captureForm = document.querySelector("#capture-form");
const captureBody = document.querySelector("#capture-body");
const captureStatus = document.querySelector("#capture-status");
const taskForm = document.querySelector("#task-form");
const todayList = document.querySelector("#today-list");
const openList = document.querySelector("#open-list");
const providerList = document.querySelector("#provider-list");
const taskTemplate = document.querySelector("#task-template");
const aiForm = document.querySelector("#ai-form");
const aiConversation = document.querySelector("#ai-conversation");
const aiNewConversation = document.querySelector("#ai-new-conversation");
const aiProvider = document.querySelector("#ai-provider");
const aiModel = document.querySelector("#ai-model");
const aiReasoning = document.querySelector("#ai-reasoning");
const aiMessage = document.querySelector("#ai-message");
const aiSubmit = document.querySelector("#ai-submit");
const aiCancel = document.querySelector("#ai-cancel");
const aiStatus = document.querySelector("#ai-status");
const aiTranscript = document.querySelector("#ai-transcript");

let aiProviderOptions = [];
let aiConversations = [];
let currentConversationId = "";
let activeJobId = "";
let activeEventSource = null;

captureForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  captureStatus.textContent = "저장 중…";
  try {
    await request("/api/captures", {
      method: "POST",
      body: JSON.stringify({ body: captureBody.value }),
    });
    captureBody.value = "";
    captureStatus.textContent = "저장됨";
  } catch (error) {
    captureStatus.textContent = error.message;
  }
});

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(taskForm);
  await request("/api/tasks", {
    method: "POST",
    body: JSON.stringify({
      title: form.get("title"),
      scheduledOn: form.get("scheduledOn") || null,
      dueOn: form.get("dueOn") || null,
    }),
  });
  taskForm.reset();
  await refreshTasks();
});

document.querySelector("#refresh").addEventListener("click", refreshAll);
aiProvider.addEventListener("change", refreshAiControls);
aiConversation.addEventListener("change", async () => {
  currentConversationId = aiConversation.value;
  if (currentConversationId) await loadConversation(currentConversationId);
  else resetConversationComposer();
});
aiNewConversation.addEventListener("click", () => {
  aiConversation.value = "";
  currentConversationId = "";
  resetConversationComposer();
  aiMessage.focus();
});
aiCancel.addEventListener("click", async () => {
  if (!activeJobId) return;
  aiCancel.disabled = true;
  aiStatus.textContent = "취소 중…";
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

  setAiBusy(true);
  aiStatus.textContent = "요청 저장 중…";
  try {
    if (!currentConversationId) {
      const created = await request("/api/ai/conversations", {
        method: "POST",
        body: JSON.stringify({
          provider: aiProvider.value,
          model: aiModel.value,
          reasoningEffort: aiReasoning.value,
        }),
      });
      currentConversationId = created.conversation.id;
      await refreshAiConversations(currentConversationId, false);
      applyConversationControls(created.conversation);
    }

    const submitted = await request(
      `/api/ai/conversations/${encodeURIComponent(currentConversationId)}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          clientRequestId: crypto.randomUUID(),
          message: text,
          model: aiModel.value,
          reasoningEffort: aiReasoning.value,
        }),
      },
    );
    appendAiMessage("user", submitted.userMessage.content);
    const assistantNode = appendAiMessage("assistant", "", "응답 생성 중…", "streaming");
    aiMessage.value = "";
    activeJobId = submitted.job.id;
    aiStatus.textContent = submitted.duplicate ? "기존 요청에 다시 연결 중…" : "응답 받는 중…";
    connectToAiJob(activeJobId, assistantNode);
    await refreshAiConversations(currentConversationId, false);
  } catch (error) {
    appendAiMessage("error", error.message);
    aiStatus.textContent = "요청 실패";
    finishAiRequest();
  }
});

async function refreshAll() {
  await Promise.all([refreshTasks(), refreshProviders()]);
  await refreshAiOptions();
  await refreshAiConversations(currentConversationId, true);
}

async function refreshTasks() {
  const [today, open] = await Promise.all([
    request("/api/tasks?view=today"),
    request("/api/tasks?view=open"),
  ]);
  renderTasks(todayList, today.tasks, "오늘로 잡힌 행동이 없습니다.");
  renderTasks(openList, open.tasks, "열린 행동이 없습니다.");
}

async function refreshProviders() {
  const data = await request("/api/ai/providers");
  providerList.replaceChildren(
    ...data.providers.map((provider) => {
      const item = document.createElement("div");
      item.className = `provider ${provider.available ? "available" : "unavailable"}`;
      const name = document.createElement("strong");
      name.textContent = provider.id;
      const state = document.createElement("span");
      state.textContent = provider.available ? provider.version : "사용 불가";
      item.append(name, state);
      return item;
    }),
  );
}

async function refreshAiOptions() {
  const data = await request("/api/ai/options");
  const selectedProvider = aiProvider.value;
  aiProviderOptions = data.providers;
  replaceSelectOptions(aiProvider, data.providers, selectedProvider);
  refreshAiControls();
}

async function refreshAiConversations(preferredId = "", loadSelected = true) {
  const data = await request("/api/ai/conversations");
  aiConversations = data.conversations;
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "새 대화";
  const options = data.conversations.map((conversation) => {
    const option = document.createElement("option");
    option.value = conversation.id;
    option.textContent = `${conversation.title} · ${conversation.provider}`;
    return option;
  });
  aiConversation.replaceChildren(placeholder, ...options);
  const selected = data.conversations.find((conversation) => conversation.id === preferredId)
    ?? (!preferredId ? data.conversations[0] : null);
  currentConversationId = selected?.id ?? "";
  aiConversation.value = currentConversationId;
  if (loadSelected) {
    if (selected) await loadConversation(selected.id);
    else resetConversationComposer();
  }
}

async function loadConversation(id) {
  const data = await request(`/api/ai/conversations/${encodeURIComponent(id)}`);
  currentConversationId = data.conversation.id;
  applyConversationControls(data.conversation);
  renderAiMessages(data.messages);
  const active = [...data.messages].reverse().find(
    (message) => message.role === "assistant" && ["pending", "streaming"].includes(message.status),
  );
  if (active?.jobId) {
    const node = aiTranscript.querySelector(`[data-message-id="${CSS.escape(active.id)}"]`)
      ?? appendAiMessage("assistant", active.content, formatStoredMeta(active), "streaming");
    setAiBusy(true);
    activeJobId = active.jobId;
    connectToAiJob(activeJobId, node);
  } else {
    finishAiRequest();
  }
}

function resetConversationComposer() {
  currentConversationId = "";
  aiProvider.disabled = false;
  refreshAiControls();
  aiTranscript.replaceChildren(emptyAiTranscript());
  aiStatus.textContent = "새 대화";
  finishAiRequest();
}

function applyConversationControls(conversation) {
  aiProvider.value = conversation.provider;
  aiProvider.disabled = true;
  refreshAiControls();
  if ([...aiModel.options].some((option) => option.value === conversation.defaultModel)) {
    aiModel.value = conversation.defaultModel;
  }
  if ([...aiReasoning.options].some((option) => option.value === conversation.defaultReasoningEffort)) {
    aiReasoning.value = conversation.defaultReasoningEffort;
  }
}

function refreshAiControls() {
  const provider = aiProviderOptions.find((option) => option.id === aiProvider.value);
  if (!provider) return;
  replaceSelectOptions(aiModel, provider.models, aiModel.value);
  replaceSelectOptions(aiReasoning, provider.reasoningEfforts, aiReasoning.value);
}

function replaceSelectOptions(select, options, preferredValue) {
  select.replaceChildren(
    ...options.map((option) => {
      const node = document.createElement("option");
      node.value = option.id;
      node.textContent = option.label;
      return node;
    }),
  );
  if (options.some((option) => option.id === preferredValue)) select.value = preferredValue;
}

function connectToAiJob(jobId, assistantNode) {
  activeEventSource?.close();
  const source = new EventSource(`/api/ai/jobs/${encodeURIComponent(jobId)}/events`);
  activeEventSource = source;
  const body = assistantNode.querySelector("p");
  const meta = assistantNode.querySelector("span");

  source.addEventListener("snapshot", (event) => {
    const data = JSON.parse(event.data);
    body.textContent = data.message.content;
    meta.textContent = formatStoredMeta(data.message);
  });
  source.addEventListener("delta", (event) => {
    const data = JSON.parse(event.data);
    body.textContent += data.delta;
    assistantNode.scrollIntoView({ block: "nearest" });
  });
  source.addEventListener("status", (event) => {
    const data = JSON.parse(event.data);
    aiStatus.textContent = data.status === "running" ? "응답 받는 중…" : data.status;
  });
  source.addEventListener("completed", (event) => {
    const data = JSON.parse(event.data);
    body.textContent = data.message.content;
    meta.textContent = formatStoredMeta(data.message, data.streamMode);
    assistantNode.classList.remove("streaming");
    aiStatus.textContent = data.streamMode === "buffered" ? "응답 완료 · 호환 모드" : "응답 완료";
    source.close();
    finishAiRequest();
  });
  source.addEventListener("failed", (event) => {
    const data = JSON.parse(event.data);
    assistantNode.classList.remove("streaming");
    assistantNode.classList.add("error");
    if (!body.textContent) body.textContent = data.error;
    meta.textContent = data.error;
    aiStatus.textContent = data.job.status === "cancelled" ? "요청 취소됨" : "요청 실패";
    source.close();
    finishAiRequest();
  });
  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) return;
    source.close();
    aiStatus.textContent = "연결이 끊겨 기록을 다시 불러옵니다.";
    setTimeout(() => void loadConversation(currentConversationId), 500);
  };
}

function setAiBusy(busy) {
  aiSubmit.disabled = busy;
  aiNewConversation.disabled = busy;
  aiConversation.disabled = busy;
  aiCancel.hidden = !busy;
  aiCancel.disabled = false;
}

function finishAiRequest() {
  activeEventSource?.close();
  activeEventSource = null;
  activeJobId = "";
  setAiBusy(false);
  aiMessage.focus();
}

function renderAiMessages(messages) {
  if (!messages.length) {
    aiTranscript.replaceChildren(emptyAiTranscript());
    return;
  }
  aiTranscript.replaceChildren(...messages.map((message) => {
    const role = message.status === "failed" || message.status === "cancelled" ? "error" : message.role;
    const fallback = message.status === "cancelled" ? "취소된 요청" : message.status === "failed" ? "완료되지 않은 요청" : "";
    const node = buildAiMessage(role, message.content || fallback, formatStoredMeta(message));
    node.dataset.messageId = message.id;
    if (["pending", "streaming"].includes(message.status)) node.classList.add("streaming");
    return node;
  }));
  aiTranscript.lastElementChild?.scrollIntoView({ block: "nearest" });
}

function appendAiMessage(role, text, meta = "", stateClass = "") {
  aiTranscript.querySelector(".empty")?.remove();
  const node = buildAiMessage(role, text, meta);
  if (stateClass) node.classList.add(stateClass);
  aiTranscript.append(node);
  node.scrollIntoView({ block: "nearest" });
  return node;
}

function buildAiMessage(role, text, meta = "") {
  const message = document.createElement("article");
  message.className = `ai-message ${role}`;
  const label = document.createElement("strong");
  label.textContent = role === "user" ? "나" : role === "assistant" ? "AI" : "오류";
  const body = document.createElement("p");
  body.textContent = text;
  const detail = document.createElement("span");
  detail.textContent = meta;
  message.append(label, body, detail);
  return message;
}

function emptyAiTranscript() {
  const empty = document.createElement("p");
  empty.className = "empty";
  empty.textContent = "대화는 이 서버에 저장되며 읽기 전용 AI 요청으로 이어집니다.";
  return empty;
}

function formatStoredMeta(message, streamMode = "") {
  const parts = [
    message.provider,
    message.model === "default" ? "기본 모델" : message.model,
    message.reasoningEffort === "default" ? "기본 추론" : message.reasoningEffort,
  ];
  if (message.durationMs !== null) parts.push(`${(message.durationMs / 1000).toFixed(1)}초`);
  if (message.inputTokens !== null) {
    parts.push(`입력 ${message.inputTokens} · 출력 ${message.outputTokens ?? 0} 토큰`);
  }
  if (streamMode === "buffered") parts.push("호환 모드");
  return parts.join(" · ");
}

function renderTasks(container, tasks, emptyMessage) {
  if (!tasks.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = emptyMessage;
    container.replaceChildren(empty);
    return;
  }
  container.replaceChildren(...tasks.map(renderTask));
}

function renderTask(task) {
  const node = taskTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector(".task-title").textContent = task.title;
  node.querySelector(".task-meta").textContent = formatTaskMeta(task);
  const dateInput = node.querySelector(".defer-date");
  dateInput.value = task.scheduledOn || "";
  node.querySelector(".defer").addEventListener("click", async () => {
    if (!dateInput.value) return dateInput.focus();
    await updateTask(task.id, { scheduledOn: dateInput.value });
  });
  node.querySelector(".complete").addEventListener("click", async () => {
    await updateTask(task.id, { completed: true });
  });
  return node;
}

async function updateTask(id, patch) {
  await request(`/api/tasks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  await refreshTasks();
}

function formatTaskMeta(task) {
  const parts = [];
  if (task.scheduledOn) parts.push(`계획 ${task.scheduledOn}`);
  if (task.dueOn) parts.push(`마감 ${task.dueOn}`);
  return parts.join(" · ") || "날짜 없음";
}

async function request(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `요청 실패 (${response.status})`);
  return data;
}

refreshAll().catch((error) => {
  todayList.textContent = error.message;
  openList.textContent = error.message;
  aiStatus.textContent = error.message;
});
