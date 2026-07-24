import { expect, test } from "@playwright/test";

test("desktop keeps conversation between navigation and WorkOS context", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "당신의 실제 WorkOS에서 함께 일합니다." })).toBeVisible();
  await expect(page.locator("#git-badge")).toContainText("Clean");
  await expect(page.locator(".rail")).toBeVisible();
  await expect(page.locator(".context-panel")).toBeVisible();
  await expect(page.locator("#model-select")).toHaveValue("gpt-5.6-sol");
  await expect(page.locator("#model-select option")).toHaveCount(7);
  await expect(page.locator("#model-select option[value=default]")).toHaveCount(0);
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

test("progress card and cancellation work on desktop, Galaxy Tab, and phone", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  for (const viewport of [
    { width: 1440, height: 720 },
    { width: 800, height: 900 },
    { width: 390, height: 700 },
  ]) {
    await page.setViewportSize(viewport);
    await page.locator("#message-input").fill(`느린 상태 확인 ${viewport.width}`);
    await page.locator("#send-button").click();
    const card = page.locator(".message.assistant").last().locator(".progress-card");
    await expect(card).toBeVisible();
    await expect(card).toContainText(/시작 중|실행 중/u);
    await expect(card).toContainText("현재 단계");
    await expect(card).toContainText("CLI 프로세스");
    await expect(card).toContainText("실시간 연결");
    await expect(page.locator("#cancel-button")).toBeVisible();
    const width = await card.evaluate((element) => element.getBoundingClientRect().right);
    expect(width).toBeLessThanOrEqual(viewport.width);
    await page.locator("#cancel-button").click();
    await expect(page.locator("#send-button")).toBeEnabled();
  }
});

test("reload re-subscribes to a pending job and preserves completion", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#message-input").fill("느린 새로고침 상태 확인");
  await page.locator("#send-button").click();
  await expect(page.locator(".progress-card")).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".progress-card")).toBeVisible();
  await expect(page.locator("#cancel-button")).toBeVisible();
  await expect(page.locator(".message.assistant").last()).toContainText("합성 WorkOS를 직접 읽고 답변했습니다.");
  await expect(page.locator(".message.assistant").last().locator(".run-details")).toBeVisible();
});

test("provider silence is informational until the existing timeout", async ({ page }) => {
  await page.clock.install();
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#message-input").fill("느린 무신호 상태 확인");
  await page.locator("#send-button").click();
  const card = page.locator(".message.assistant").last().locator(".progress-card");
  await expect(card).toContainText("실행 중");
  await page.clock.fastForward("00:16");
  await expect(card).toContainText("조용히 처리 중");
  await page.clock.fastForward("00:45");
  await expect(card).toContainText("응답 지연");
  await expect(page.locator("#cancel-button")).toBeVisible();
});

test("assistant Markdown is readable, sanitized, and contained on every viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#message-input").fill("Markdown <strong>응답</strong>을 보여줘");
  await page.locator("#send-button").click();

  const owner = page.locator(".message.user").last();
  await expect(owner).toContainText("<strong>응답</strong>");
  await expect(owner.locator("strong")).toHaveCount(0);
  const assistant = page.locator(".message.assistant").last();
  const markdown = assistant.locator(".markdown-body");
  await expect(markdown.getByRole("heading", { name: "프로젝트 요약" })).toBeVisible();
  await expect(markdown.locator("li")).toHaveCount(2);
  await expect(markdown.locator("table")).toContainText("테스트");
  await expect(markdown.locator("blockquote")).toContainText("근거를 확인했습니다");
  await expect(markdown.locator("pre code")).toContainText("const safe = true");
  await expect(markdown.getByRole("link", { name: "안전한 링크" })).toHaveAttribute("rel", "noopener noreferrer");
  await expect(markdown.locator("script, img, [onerror], [onclick]")).toHaveCount(0);
  await expect(markdown.getByText("위험한 링크")).not.toHaveAttribute("href", /javascript/u);
  expect(await page.evaluate("window.__markdownXss")).toBeUndefined();
  const typography = await page.evaluate<{
    ui: string;
    heading: string;
    table: string;
    code: string;
    path: string;
  }>(
    "(() => ({ ui: getComputedStyle(document.documentElement).fontFamily, heading: getComputedStyle(document.querySelector('.markdown-body h2')).fontFamily, table: getComputedStyle(document.querySelector('.markdown-body table')).fontFamily, code: getComputedStyle(document.querySelector('.markdown-body code')).fontFamily, path: getComputedStyle(document.querySelector('.workspace-card .mono-text')).fontFamily }))()",
  );
  expect(typography.ui).toContain("Pretendard Variable");
  expect(typography.heading).toContain("Pretendard Variable");
  expect(typography.table).toContain("Pretendard Variable");
  expect(typography.code).toContain("JetBrains Mono Variable");
  expect(typography.path).toContain("JetBrains Mono Variable");

  for (const viewport of [
    { width: 1440, height: 720 },
    { width: 800, height: 900 },
    { width: 390, height: 700 },
  ]) {
    await page.setViewportSize(viewport);
    const metrics = await page.evaluate<{
      pageWidth: number;
      viewportWidth: number;
      codeScrollable: boolean;
      tableContained: boolean;
    }>(
      "(() => { const code = document.querySelector('.markdown-body pre'); const table = document.querySelector('.markdown-body table'); return { pageWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth, codeScrollable: code.scrollWidth >= code.clientWidth, tableContained: table.getBoundingClientRect().right <= window.innerWidth }; })()",
    );
    expect(metrics.pageWidth).toBeLessThanOrEqual(metrics.viewportWidth);
    expect(metrics.codeScrollable).toBe(true);
    expect(metrics.tableContained).toBe(true);
  }

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".message.assistant").last().locator("h2")).toHaveText("프로젝트 요약");
});

test("CDN font failure keeps the application usable through local fallbacks", async ({ page }) => {
  await page.route("https://cdn.jsdelivr.net/**", (route) => route.abort());
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("#message-input")).toBeVisible();
  await expect(page.locator("#send-button")).toBeEnabled();
  const metrics = await page.evaluate<{ pageWidth: number; viewportWidth: number }>(
    "({ pageWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth })",
  );
  expect(metrics.pageWidth).toBeLessThanOrEqual(metrics.viewportWidth);
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
  await expect(page.locator("#model-select")).toHaveValue("grok-4.5");
  await expect(page.locator("#model-select option")).toHaveCount(1);
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
