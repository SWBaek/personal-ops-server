import { expect, test } from "@playwright/test";

test("desktop presents the assistant between navigation and operational context", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: "운영 브리핑" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "무엇을 함께 정리할까요?" })).toBeVisible();
  await expect(page.locator("#assistant-view .preview-label")).toHaveText("PRIVATE WORKSPACE");

  const sidebar = await page.locator(".sidebar").boundingBox();
  const workspace = await page.locator(".workspace").boundingBox();
  const context = await page.locator(".context-panel").boundingBox();
  expect(sidebar).not.toBeNull();
  expect(workspace).not.toBeNull();
  expect(context).not.toBeNull();
  expect(workspace?.x ?? 0).toBeGreaterThan(sidebar?.x ?? 0);
  expect(context?.x ?? 0).toBeGreaterThan(workspace?.x ?? 0);

  await page.screenshot({ path: testInfo.outputPath("desktop-assistant-shell.png"), fullPage: true });
});

test("desktop project overview explains the product constitution", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator('.side-nav [data-view="프로젝트 개요"]').click();

  await expect(page.locator("body")).toHaveClass(/overview-active/);
  await expect(page.locator("#project-overview")).toBeVisible();
  await expect(page.locator("#assistant-view")).toBeHidden();
  await expect(page.locator("#assistant-composer")).toBeHidden();
  await expect(page.getByRole("heading", { name: "개인 운영을 맡는 AI 전문 비서 시스템" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "전문 비서의 개념" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI가 지원해야 하는 것" })).toBeVisible();
  await expect(page.locator('.side-nav [data-view="프로젝트 개요"]')).toHaveAttribute("aria-current", "page");

  await page.screenshot({ path: testInfo.outputPath("desktop-project-overview.png"), fullPage: true });
  await page.locator("#overview-processing").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("desktop-processing-workflow.png"), fullPage: true });
});

test("Galaxy Tab landscape keeps context visible without horizontal overflow", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.locator(".context-panel")).toBeVisible();
  await expect(page.locator("#ai-form")).toBeVisible();
  const dimensions = await page.evaluate<{ width: number; viewport: number }>(
    "({ width: document.documentElement.scrollWidth, viewport: window.innerWidth })",
  );
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);

  await page.screenshot({ path: testInfo.outputPath("galaxy-tab-landscape.png"), fullPage: true });
});

test("Galaxy Tab portrait opens operational context as a drawer", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1280 });
  await page.goto("/", { waitUntil: "networkidle" });

  const before = await page.locator(".context-panel").boundingBox();
  expect(before?.x ?? 0).toBeGreaterThanOrEqual(800);
  await page.getByRole("button", { name: "운영 상황 열기" }).click();
  await expect(page.locator("body")).toHaveClass(/context-open/);
  await expect(page.getByRole("heading", { name: "운영 상황" })).toBeVisible();
  await page.getByRole("button", { name: "운영 상황 닫기" }).click();
  await expect(page.locator("body")).not.toHaveClass(/context-open/);
});

test("smartphone uses a single column with bottom navigation", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.locator(".mobile-nav")).toBeVisible();
  await expect(page.locator("#ai-message")).toBeVisible();
  await expect(page.locator(".preview-turn")).toContainText("프로젝트 projection");
  const dimensions = await page.evaluate<{ width: number; viewport: number }>(
    "({ width: document.documentElement.scrollWidth, viewport: window.innerWidth })",
  );
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);

  await page.screenshot({ path: testInfo.outputPath("smartphone-assistant-shell.png"), fullPage: true });
});

test("smartphone can read the project overview without leaving the fixed shell", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator('.mobile-nav [data-view="프로젝트 개요"]').click();

  await expect(page.locator("#project-overview")).toBeVisible();
  await expect(page.locator("#assistant-composer")).toBeHidden();
  await expect(page.locator(".mobile-nav")).toBeVisible();
  const metrics = await page.evaluate<{
    documentHeight: number;
    viewportHeight: number;
    overviewScrollHeight: number;
    overviewHeight: number;
    horizontalOverflow: boolean;
  }>(`({
    documentHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
    overviewScrollHeight: document.querySelector('#project-overview').scrollHeight,
    overviewHeight: document.querySelector('#project-overview').clientHeight,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
  })`);
  expect(metrics.documentHeight).toBeLessThanOrEqual(metrics.viewportHeight);
  expect(metrics.overviewScrollHeight).toBeGreaterThan(metrics.overviewHeight);
  expect(metrics.horizontalOverflow).toBe(false);

  await page.screenshot({ path: testInfo.outputPath("smartphone-project-overview.png"), fullPage: true });
  await page.locator("#overview-processing").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("smartphone-processing-workflow.png"), fullPage: true });
});

test("Projects shows an honest empty state on desktop and smartphone", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator('.side-nav [data-view="프로젝트"]').click();
  await expect(page.locator("#projects-view")).toBeVisible();
  await expect(page.locator("#projects-status")).toContainText("아직 확인된 프로젝트가 없습니다");
  await expect(page.locator("#project-detail-empty")).toContainText("아직 선택한 프로젝트가 없습니다");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.mobile-nav [data-view="프로젝트"]').click();
  await expect(page.locator("#projects-view")).toBeVisible();
  const metrics = await page.evaluate<{ horizontalOverflow: boolean }>(
    "({ horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth })",
  );
  expect(metrics.horizontalOverflow).toBe(false);
});

test("long smartphone conversations scroll inside the conversation region", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.evaluate(`{
    const transcript = document.querySelector('#dynamic-transcript');
    for (let index = 0; index < 24; index += 1) {
      const message = document.createElement('article');
      message.className = 'turn message-turn user-turn';
      const body = document.createElement('div');
      body.className = 'message-body';
      const text = document.createElement('p');
      text.textContent = '긴 대화 레이아웃 확인 메시지 ' + index;
      body.append(text);
      message.append(body);
      transcript.append(message);
    }
  }`);

  const metrics = await page.evaluate<{
    documentHeight: number;
    viewportHeight: number;
    conversationHeight: number;
    conversationScrollHeight: number;
  }>(`({
    documentHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
    conversationHeight: document.querySelector('.conversation').clientHeight,
    conversationScrollHeight: document.querySelector('.conversation').scrollHeight,
  })`);
  expect(metrics.documentHeight).toBeLessThanOrEqual(metrics.viewportHeight);
  expect(metrics.conversationScrollHeight).toBeGreaterThan(metrics.conversationHeight);
  await expect(page.locator("#ai-form")).toBeVisible();
  await expect(page.locator(".mobile-nav")).toBeVisible();
});

test("quick prompts move a suggested request into the composer", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "오늘 판단할 것" }).click();
  await expect(page.locator("#ai-message")).toHaveValue("오늘 제가 판단해야 할 것만 알려주세요");
});

test("structured AI response completes and the conversation survives a reload", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#ai-message").fill("Playwright 대화 유지 확인");
  await page.locator("#ai-submit").click();

  const response = page.locator(".message-turn.assistant-turn").last();
  await expect(response).toHaveClass(/streaming/);
  await expect(response.locator("p")).toHaveText("구조화 응답 완료");
  await expect(response).not.toHaveClass(/streaming/);
  await expect(page.locator("#ai-status")).toContainText("응답 완료");

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("#dynamic-transcript")).toContainText("Playwright 대화 유지 확인");
  await expect(page.locator("#dynamic-transcript")).toContainText("구조화 응답 완료");
});

test("an existing Codex conversation can switch to Grok from the provider menu", async ({ page, request }) => {
  await request.post("/api/ai/history/clear", {
    data: { confirmation: "DELETE_AI_HISTORY" },
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#ai-message").fill("Codex 문맥을 먼저 만듭니다");
  await page.locator("#ai-submit").click();
  await expect(page.locator("#ai-status")).toContainText("응답 완료");

  await page.locator("#model-summary").click();
  await expect(page.locator(".model-menu")).toHaveAttribute("open", "");
  await expect(page.locator("#ai-provider")).toBeEnabled();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#ai-provider").selectOption("grok");

  await expect(page.locator("#ai-provider")).toHaveValue("grok");
  await expect(page.locator("#ai-status")).toContainText("Grok(으)로 전환했습니다");
  await expect(page.locator("#dynamic-transcript")).toBeEmpty();

  const conversations = await (await request.get("/api/ai/conversations")).json();
  expect(conversations.conversations).toHaveLength(1);
  expect(conversations.conversations[0].provider).toBe("grok");
  expect(conversations.archivedConversations).toHaveLength(1);
  expect(conversations.archivedConversations[0].provider).toBe("codex");

  await page.locator("#ai-message").fill("Grok 전환 후 질문입니다");
  await page.locator("#ai-submit").click();
  await expect(page.locator(".message-turn.assistant-turn").last()).toContainText("구조화 응답 완료");
  await expect(page.locator(".message-turn.assistant-turn").last()).toContainText("grok");
});

test("conversation proposes and confirms one durable assistant memo", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#ai-message").fill("알파 배포는 금요일에 민수에게 확인해야 해");
  await page.locator("#ai-form").evaluate((form) => form.requestSubmit());
  await expect(page.locator(".message-turn.assistant-turn").last()).toContainText("정리 제안");
  await expect(page.locator(".message-turn.assistant-turn").last()).toContainText("이대로 저장할까요?");

  await page.locator('.side-nav [data-view="받은함"]').click();
  await expect(page.getByRole("heading", { name: "비서가 정리한 메모" })).toBeVisible();
  await expect(page.locator(".inbox-item")).toContainText("알파 배포 일정을 금요일에 확인한다.");

  await page.locator('.side-nav [data-view="비서"]').click();
  await page.locator("#ai-message").fill("저장해");
  await page.locator("#ai-form").evaluate((form) => form.requestSubmit());
  await expect(page.locator(".message-turn.assistant-turn").last()).toContainText("저장했습니다");

  await page.locator('.side-nav [data-view="받은함"]').click();
  await page.locator('[data-inbox-status="confirmed"]').click();
  await expect(page.locator(".inbox-item")).toContainText("저장됨 · 버전 1");
  await page.screenshot({ path: testInfo.outputPath("desktop-assistant-inbox.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.mobile-nav [data-view="받은함"]').click();
  await expect(page.locator("#inbox-view")).toBeVisible();
  const metrics = await page.evaluate<{ documentHeight: number; viewportHeight: number; horizontalOverflow: boolean }>(`({
    documentHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
  })`);
  expect(metrics.documentHeight).toBeLessThanOrEqual(metrics.viewportHeight);
  expect(metrics.horizontalOverflow).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("smartphone-assistant-inbox.png"), fullPage: true });
});

test("a new conversation answers from confirmed memo evidence and links its source", async ({ page, request }) => {
  await request.post("/api/system/reset-data", {
    data: { confirmation: "RESET_ALL_DATA" },
  });
  await page.goto("/", { waitUntil: "networkidle" });

  await page.locator("#ai-message").fill("알파 배포 일정은 금요일에 민수에게 확인해야 해");
  await page.locator("#ai-submit").click();
  await expect(page.locator(".message-turn.assistant-turn").last()).toContainText("정리 제안");

  await page.locator("#ai-message").fill("저장해");
  await page.locator("#ai-submit").click();
  await expect(page.locator(".message-turn.assistant-turn").last()).toContainText("저장했습니다");

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#new-context").click();
  await expect(page.locator("#dynamic-transcript")).toBeEmpty();

  await page.locator("#ai-message").fill("저장된 알파 배포 일정을 알려줘");
  await page.locator("#ai-submit").click();
  const groundedAnswer = page.locator(".message-turn.assistant-turn").filter({
    has: page.locator(".message-project-brief"),
  }).last();
  await expect(groundedAnswer.locator(".message-project-brief")).toBeVisible();
  await expect(groundedAnswer.locator(".message-project-brief")).toContainText("알파");
  await expect(groundedAnswer.locator(".message-coverage")).toHaveText("complete");
  await expect(groundedAnswer.locator(".message-project-brief")).toContainText("배포 일정을 확인하는 중이다.");
  await expect(groundedAnswer.locator(".grounding-label")).toHaveText("저장 근거");
  await expect(groundedAnswer.locator(".grounding-source")).toContainText("알파 배포 일정을 금요일에 확인한다.");

  const sourceRows = await (await request.get("/api/debug/data/ai_message_sources")).json();
  expect(sourceRows.rows).toHaveLength(1);

  await page.locator("#ai-message").fill("저장된 오메가 일정을 알려줘");
  await page.locator("#ai-submit").click();
  const insufficientAnswer = page.locator(".message-turn.assistant-turn").last();
  await expect(insufficientAnswer).toContainText("찾지 못했습니다");
  await expect(insufficientAnswer.locator(".grounding-label")).toHaveText("저장 근거 부족");
  await expect(insufficientAnswer.locator(".grounding-source")).toHaveCount(0);

  await groundedAnswer.locator(".grounding-source").click();
  await expect(page.locator("#inbox-view")).toBeVisible();
  await expect(page.locator(".inbox-item.source-highlight")).toContainText("알파 배포 일정을 금요일에 확인한다.");
  await expect(page.locator(".version-pin-note")).toContainText(":v1");
});

test("Projects renders list, fixed sections, coverage, and pinned sources across devices", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator('.side-nav [data-view="프로젝트"]').click();

  await expect(page.locator(".projects-list-item")).toHaveCount(1);
  await expect(page.locator("#project-detail-name")).toHaveText("알파");
  await expect(page.locator("#project-coverage")).toContainText("Complete");
  await expect(page.locator("#project-brief-sections > .project-brief-section")).toHaveCount(9);
  await expect(page.locator("#project-brief-sections")).toContainText("열린 Action과 날짜");
  await expect(page.locator("#project-brief-sections")).toContainText("배포 일정을 확인한다.");
  await expect(page.locator("#project-source-list .project-source-chip")).toContainText("v1");
  const desktopPanes = await page.evaluate<{ list: { x: number }; detail: { x: number } }>(`({
    list: document.querySelector('.projects-directory').getBoundingClientRect(),
    detail: document.querySelector('.project-detail').getBoundingClientRect(),
  })`);
  expect(desktopPanes.detail.x).toBeGreaterThan(desktopPanes.list.x);
  await page.screenshot({ path: testInfo.outputPath("desktop-projects.png"), fullPage: true });

  await page.locator("#project-brief-request").click();
  await expect(page.locator("#assistant-view")).toBeVisible();
  await expect(page.locator("#ai-message")).toHaveValue(/알파 프로젝트의 현재 상태/);

  await page.setViewportSize({ width: 800, height: 1280 });
  await page.locator('.side-nav [data-view="프로젝트"]').click();
  await expect(page.locator("#project-detail-content")).toBeVisible();
  await page.locator("#project-back").click();
  await expect(page.locator(".projects-directory")).toBeVisible();
  await page.locator(".projects-list-item").click();
  await expect(page.locator("#project-detail-content")).toBeVisible();
  await expect(page.locator("#project-back")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("galaxy-tab-projects.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.mobile-nav [data-view="프로젝트"]').click();
  await page.locator("#project-back").click();
  await expect(page.locator(".projects-list-item")).toBeVisible();
  await page.locator(".projects-list-item").click();
  await expect(page.locator("#project-detail-content")).toBeVisible();
  const mobileMetrics = await page.evaluate<{ horizontalOverflow: boolean; documentHeight: number; viewportHeight: number }>(`({
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    documentHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
  })`);
  expect(mobileMetrics.horizontalOverflow).toBe(false);
  expect(mobileMetrics.documentHeight).toBeLessThanOrEqual(mobileMetrics.viewportHeight);
  await page.screenshot({ path: testInfo.outputPath("smartphone-projects.png"), fullPage: true });

  await page.locator("#project-source-list .project-source-chip").first().click();
  await expect(page.locator("#inbox-view")).toBeVisible();
  await expect(page.locator(".version-pin-note")).toContainText("memo:");
});

test("read-only debug view exposes allowlisted SQLite state on desktop and phone", async ({ page, request }, testInfo) => {
  await request.post("/api/captures", { data: { body: "debug-visible-capture" } });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator('.side-nav [data-view="디버그"]').click();

  await expect(page.getByRole("heading", { name: "애플리케이션 데이터" })).toBeVisible();
  await page.locator("#debug-dataset").selectOption("captures");
  await expect(page.locator("#debug-table-body")).toContainText("debug-visible-capture");
  await expect(page.locator("#debug-view")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("desktop-debug-view.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#mobile-settings-button").click();
  await page.locator("#mobile-debug-button").click();
  await expect(page.locator("#debug-view")).toBeVisible();
  const metrics = await page.evaluate<{ documentHeight: number; viewportHeight: number; horizontalOverflow: boolean }>(`({
    documentHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
  })`);
  expect(metrics.documentHeight).toBeLessThanOrEqual(metrics.viewportHeight);
  expect(metrics.horizontalOverflow).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("smartphone-debug-view.png"), fullPage: true });
});

test("AI messages work when crypto.randomUUID is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, "randomUUID", { configurable: true, value: undefined });
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#ai-message").fill("UUID 호환성 확인");
  await page.locator("#ai-submit").click();

  await expect(page.locator(".message-turn.user-turn").last()).toContainText("UUID 호환성 확인");
  await expect(page.locator(".message-turn.assistant-turn").last().locator("p")).toHaveText("구조화 응답 완료");
  await expect(page.locator("#ai-status")).toContainText("응답 완료");
});

test("owner can version the chief-assistant profile from responsive settings", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#mobile-settings-button").click();

  await expect(page.locator("#ai-runtime-status")).toHaveText("관리형 · test");
  await page.locator("#assistant-profile-name").fill("지안");
  await page.locator("#assistant-owner-address").fill("대표님");
  await page.locator("#assistant-role-description").fill("개인 운영을 총괄하고 중요한 판단을 선별한다.");
  await page.locator("#assistant-communication-style").fill("짧고 직접적으로 답한다.");
  await page.locator("#assistant-working-principles").fill("계획의 허점을 발견하면 지적한다.");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#assistant-profile-submit").click();

  await expect(page.locator("#assistant-profile-status")).toHaveText("새 비서 구성을 적용했습니다.");
  await expect(page.locator("#assistant-profile-version")).toHaveText("버전 2");
  await page.screenshot({ path: testInfo.outputPath("smartphone-assistant-profile.png"), fullPage: true });
  await page.locator("#settings-close").click();
  await expect(page.locator("#view-kicker")).toHaveText("지안");

  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#mobile-settings-button").click();
  await expect(page.locator("#assistant-profile-name")).toHaveValue("지안");
  const metrics = await page.evaluate<{ horizontalOverflow: boolean }>(
    "({ horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth })",
  );
  expect(metrics.horizontalOverflow).toBe(false);
});

test("settings can permanently clear all assistant conversation history", async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#mobile-settings-button").click();
  await expect(page.locator("#settings-dialog")).toBeVisible();
  await page.getByRole("button", { name: /대화 기록 삭제/ }).click();
  await expect(page.locator("#confirmation-submit")).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("mobile-data-reset-confirmation.png"), fullPage: true });
  await page.locator("#confirmation-submit").click();
  await expect(page.locator("#settings-dialog")).toBeHidden();
  await expect(page.locator("#dynamic-transcript")).toBeEmpty();

  const conversations = await request.get("/api/ai/conversations");
  expect(conversations.ok()).toBe(true);
  expect(await conversations.json()).toEqual({ conversations: [], archivedConversations: [] });
});

test("development settings can reset all application data", async ({ page, request }) => {
  expect((await request.post("/api/captures", { data: { body: "temporary capture" } })).ok()).toBe(true);
  expect((await request.post("/api/tasks", { data: { title: "temporary task" } })).ok()).toBe(true);

  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#settings-button").click();
  await page.getByRole("button", { name: /모든 데이터 초기화/ }).click();
  await expect(page.locator("#confirmation-submit")).toBeEnabled();
  await page.locator("#confirmation-submit").click();
  await expect(page.locator("#settings-dialog")).toBeHidden();

  const captures = await (await request.get("/api/captures")).json();
  const tasks = await (await request.get("/api/tasks")).json();
  const conversations = await (await request.get("/api/ai/conversations")).json();
  expect(captures.captures).toEqual([]);
  expect(tasks.tasks).toEqual([]);
  expect(conversations).toEqual({ conversations: [], archivedConversations: [] });
});
