import { expect, test } from "@playwright/test";

test("Galaxy Tab landscape shows AI chat in the right panel", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: "지금 필요한 것만" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI에게 물어보기" })).toBeVisible();
  await expect(page.locator("#ai-provider option")).toHaveCount(2);

  const primaryBox = await page.locator(".primary-column").boundingBox();
  const panelBox = await page.locator(".ai-panel").boundingBox();
  expect(primaryBox).not.toBeNull();
  expect(panelBox).not.toBeNull();
  expect(panelBox?.x ?? 0).toBeGreaterThan((primaryBox?.x ?? 0) + (primaryBox?.width ?? 0));

  await page.screenshot({
    path: testInfo.outputPath("galaxy-tab-landscape.png"),
    fullPage: true,
  });
});

test("narrow screens stack the AI panel below the primary content", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1280 });
  await page.goto("/", { waitUntil: "networkidle" });

  const primaryBox = await page.locator(".primary-column").boundingBox();
  const panelBox = await page.locator(".ai-panel").boundingBox();
  expect(primaryBox).not.toBeNull();
  expect(panelBox).not.toBeNull();
  expect(panelBox?.y ?? 0).toBeGreaterThan((primaryBox?.y ?? 0) + (primaryBox?.height ?? 0));
});

test("browser interactions can capture and complete an isolated task", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await page.locator("#capture-body").fill("Playwright isolated capture");
  await page.locator("#capture-form").getByRole("button", { name: "잡아두기" }).click();
  await expect(page.locator("#capture-status")).toHaveText("저장됨");

  await page.locator("#task-title").fill("Playwright isolated task");
  await page.locator("#task-form").getByRole("button", { name: "추가" }).click();
  await expect(page.locator("#open-list")).toContainText("Playwright isolated task");

  const createdTask = page.locator("#open-list .task-item").filter({
    hasText: "Playwright isolated task",
  });
  await createdTask.getByRole("button", { name: "완료" }).click();
  await expect(page.locator("#open-list")).not.toContainText("Playwright isolated task");
});

test("AI response streams and the conversation survives a reload", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#ai-new-conversation").click();
  await page.locator("#ai-message").fill("Playwright 대화 유지 확인");
  await page.locator("#ai-submit").click();

  const response = page.locator(".ai-message.assistant").last();
  await expect(response).toHaveClass(/streaming/);
  await expect(response.locator("p")).toContainText("스트리밍");
  await expect(response.locator("p")).toHaveText("스트리밍 응답 완료");
  await expect(response).not.toHaveClass(/streaming/);
  await expect(page.locator("#ai-status")).toContainText("응답 완료");

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("#ai-transcript")).toContainText("Playwright 대화 유지 확인");
  await expect(page.locator("#ai-transcript")).toContainText("스트리밍 응답 완료");
});

test("AI messages work when crypto.randomUUID is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, "randomUUID", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#ai-new-conversation").click();
  await page.locator("#ai-message").fill("UUID 호환성 확인");
  await page.locator("#ai-submit").click();

  await expect(page.locator(".ai-message.user").last()).toContainText("UUID 호환성 확인");
  await expect(page.locator(".ai-message.assistant").last().locator("p")).toHaveText("스트리밍 응답 완료");
  await expect(page.locator("#ai-status")).toContainText("응답 완료");
});
