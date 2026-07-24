import { expect, test } from "@playwright/test";

test("desktop keeps conversation between navigation and WorkOS context", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "당신의 실제 WorkOS에서 함께 일합니다." })).toBeVisible();
  await expect(page.locator("#git-badge")).toContainText("Clean");
  await expect(page.locator(".rail")).toBeVisible();
  await expect(page.locator(".context-panel")).toBeVisible();
  const metrics = await page.evaluate<{ width: number; viewport: number }>(
    "({ width: document.documentElement.scrollWidth, viewport: window.innerWidth })",
  );
  expect(metrics.width).toBeLessThanOrEqual(metrics.viewport);
});

test("Galaxy Tab portrait uses an explicit workspace drawer", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1280 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#mobile-context").click();
  await expect(page.locator("#context-panel")).toHaveClass(/open/u);
  await expect(page.getByRole("heading", { name: "운영 상태" })).toBeVisible();
  await page.locator("#context-close").click();
  await expect(page.locator("#context-panel")).not.toHaveClass(/open/u);
});

test("smartphone preserves the full chat workflow without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator(".rail")).toBeHidden();
  await expect(page.locator("#message-input")).toBeVisible();
  const metrics = await page.evaluate<{
    width: number;
    viewport: number;
    height: number;
    viewportHeight: number;
  }>("({ width: document.documentElement.scrollWidth, viewport: window.innerWidth, height: document.documentElement.scrollHeight, viewportHeight: window.innerHeight })");
  expect(metrics.width).toBeLessThanOrEqual(metrics.viewport);
  expect(metrics.height).toBeLessThanOrEqual(metrics.viewportHeight);
});

test("one-call read-only answer bypasses a plan and survives reload", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#message-input").fill("오늘 일정은?");
  await page.locator("#send-button").click();
  const userBubble = page.locator(".message.user").last().locator(".message-bubble");
  await expect(userBubble).toContainText("오늘 일정은?");
  await expect(userBubble).not.toContainText("??");
  await expect(page.locator(".message.assistant").last()).toContainText("등록된 일정이 없습니다");
  await expect(page.locator(".message.assistant").last().locator(".plan-card")).toHaveCount(0);
  await expect(page.locator(".message.assistant").last()).toContainText("CLI 최종 답변을 그대로 전달");
  await expect(page.locator("#composer-status")).toHaveText("완료했습니다.");
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("#messages")).toContainText("오늘 일정은?");
  await expect(page.locator("#messages")).toContainText("등록된 일정이 없습니다");
});

test("low-risk edit creates a receipt, diff, and latest-receipt Undo", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#message-input").fill("README를 업데이트해");
  await page.locator("#send-button").click();
  await expect(page.locator(".message.assistant").last().locator(".receipt-chip")).toContainText(
    "로컬 Git commit 완료",
  );

  const receipt = page.locator(".receipt-card").first();
  await expect(receipt).toContainText("Update README.md");
  await receipt.getByRole("button", { name: "Diff 보기" }).click();
  await expect(page.locator("#diff-content")).toContainText("Assistant verified change");
  await page.locator("#diff-close").click();

  page.once("dialog", (dialog) => dialog.accept());
  await receipt.getByRole("button", { name: "최근 변경 Undo" }).click();
  await expect(page.locator(".receipt-card").first()).toContainText("Reverted receipt");
});

test("AGENTS change waits for visible approval before execution", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#message-input").fill("AGENTS 규칙을 업데이트해");
  await page.locator("#send-button").click();
  const plan = page.locator(".plan-card").last();
  await expect(plan).toContainText("승인 필요");
  await expect(plan).toContainText("AGENTS.md");
  await plan.getByRole("button", { name: "승인하고 실행" }).click();
  await expect(page.locator(".message.assistant").last().locator(".receipt-chip")).toContainText(
    "로컬 Git commit 완료",
  );
});

test("provider switch keeps one timeline and marks the provider segment", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("#send-button")).toBeEnabled();
  await page.locator("#provider-select").selectOption("grok");
  await expect(page.locator("#provider-select")).toHaveValue("grok");
  await page.locator("#message-input").fill("오늘 일정은?");
  await page.locator("#send-button").click();
  await expect(page.locator(".message.assistant").last().locator(".message-meta")).toContainText("grok");
});

test("conversation owns vertical scrolling on desktop, tablet, and phone", async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 720 },
    { width: 800, height: 900 },
    { width: 390, height: 700 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "networkidle" });
    const conversation = page.locator("#conversation");
    const metrics = await page.evaluate<{
      clientHeight: number;
      scrollHeight: number;
      overflowY: string;
      pageHeight: number;
      viewportHeight: number;
    }>(
      "(() => { const element = document.querySelector('#conversation'); return { clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, overflowY: getComputedStyle(element).overflowY, pageHeight: document.documentElement.scrollHeight, viewportHeight: window.innerHeight }; })()",
    );
    expect(metrics.overflowY).toBe("auto");
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
    expect(metrics.pageHeight).toBeLessThanOrEqual(metrics.viewportHeight);

    await conversation.evaluate((element) => {
      element.scrollTop = 0;
    });
    await conversation.hover();
    await page.mouse.wheel(0, 500);
    await expect.poll(() => conversation.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  }
});
