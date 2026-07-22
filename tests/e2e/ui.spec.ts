import { expect, test } from "@playwright/test";

test("desktop presents the assistant between navigation and operational context", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: "운영 브리핑" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "좋은 아침입니다." })).toBeVisible();
  await expect(page.locator(".preview-label")).toHaveText("UI PREVIEW");

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
  await expect(page.locator(".focus-item")).toHaveCount(3);
  const dimensions = await page.evaluate<{ width: number; viewport: number }>(
    "({ width: document.documentElement.scrollWidth, viewport: window.innerWidth })",
  );
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);

  await page.screenshot({ path: testInfo.outputPath("smartphone-assistant-shell.png"), fullPage: true });
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

test("AI response streams and the conversation survives a reload", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#ai-message").fill("Playwright 대화 유지 확인");
  await page.locator("#ai-submit").click();

  const response = page.locator(".message-turn.assistant-turn").last();
  await expect(response).toHaveClass(/streaming/);
  await expect(response.locator("p")).toContainText("스트리밍");
  await expect(response.locator("p")).toHaveText("스트리밍 응답 완료");
  await expect(response).not.toHaveClass(/streaming/);
  await expect(page.locator("#ai-status")).toContainText("응답 완료");

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("#dynamic-transcript")).toContainText("Playwright 대화 유지 확인");
  await expect(page.locator("#dynamic-transcript")).toContainText("스트리밍 응답 완료");
});

test("AI messages work when crypto.randomUUID is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, "randomUUID", { configurable: true, value: undefined });
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#ai-message").fill("UUID 호환성 확인");
  await page.locator("#ai-submit").click();

  await expect(page.locator(".message-turn.user-turn").last()).toContainText("UUID 호환성 확인");
  await expect(page.locator(".message-turn.assistant-turn").last().locator("p")).toHaveText("스트리밍 응답 완료");
  await expect(page.locator("#ai-status")).toContainText("응답 완료");
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
