const captureForm = document.querySelector("#capture-form");
const captureBody = document.querySelector("#capture-body");
const captureStatus = document.querySelector("#capture-status");
const taskForm = document.querySelector("#task-form");
const todayList = document.querySelector("#today-list");
const openList = document.querySelector("#open-list");
const providerList = document.querySelector("#provider-list");
const taskTemplate = document.querySelector("#task-template");
const aiForm = document.querySelector("#ai-form");
const aiProvider = document.querySelector("#ai-provider");
const aiModel = document.querySelector("#ai-model");
const aiReasoning = document.querySelector("#ai-reasoning");
const aiMessage = document.querySelector("#ai-message");
const aiSubmit = document.querySelector("#ai-submit");
const aiStatus = document.querySelector("#ai-status");
const aiTranscript = document.querySelector("#ai-transcript");

let aiProviderOptions = [];

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

aiForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = aiMessage.value.trim();
  if (!message) return;

  aiSubmit.disabled = true;
  aiStatus.textContent = "응답 기다리는 중…";
  appendAiMessage("user", message);
  aiMessage.value = "";
  try {
    const result = await request("/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({
        provider: aiProvider.value,
        model: aiModel.value,
        reasoningEffort: aiReasoning.value,
        message,
      }),
    });
    appendAiMessage("assistant", result.text, formatAiMeta(result));
    aiStatus.textContent = "응답 완료";
  } catch (error) {
    appendAiMessage("error", error.message);
    aiStatus.textContent = "요청 실패";
  } finally {
    aiSubmit.disabled = false;
    aiMessage.focus();
  }
});

async function refreshAll() {
  await Promise.all([refreshTasks(), refreshProviders(), refreshAiOptions()]);
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
  if (options.some((option) => option.id === preferredValue)) {
    select.value = preferredValue;
  }
}

function appendAiMessage(role, text, meta = "") {
  const placeholder = aiTranscript.querySelector(".empty");
  placeholder?.remove();
  const message = document.createElement("article");
  message.className = `ai-message ${role}`;
  const label = document.createElement("strong");
  label.textContent = role === "user" ? "나" : role === "assistant" ? "AI" : "오류";
  const body = document.createElement("p");
  body.textContent = text;
  message.append(label, body);
  if (meta) {
    const detail = document.createElement("span");
    detail.textContent = meta;
    message.append(detail);
  }
  aiTranscript.append(message);
  message.scrollIntoView({ block: "nearest" });
}

function formatAiMeta(result) {
  const parts = [
    result.provider,
    result.model === "default" ? "기본 모델" : result.model,
    result.reasoningEffort === "default" ? "기본 추론" : result.reasoningEffort,
    `${(result.durationMs / 1000).toFixed(1)}초`,
  ];
  if (result.usage) {
    parts.push(`입력 ${result.usage.inputTokens} · 출력 ${result.usage.outputTokens} 토큰`);
  }
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
    if (!dateInput.value) {
      dateInput.focus();
      return;
    }
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
  if (!response.ok) {
    throw new Error(data.error || `요청 실패 (${response.status})`);
  }
  return data;
}

refreshAll().catch((error) => {
  todayList.textContent = error.message;
  openList.textContent = error.message;
});
