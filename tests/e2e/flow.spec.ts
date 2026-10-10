import { expect, test } from "@playwright/test";

const email = `e2e-${Date.now()}@example.com`;
const password = "test123456";

test("注册 → 生成 → 数据持久化 → 迭代 → 回滚 → 发布 → Remix", async ({ page, browser }) => {
  // 注册
  await page.goto("/login?mode=signup");
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("至少 6 位").fill(password);
  await page.getByRole("button", { name: "创建账号" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // 从模板创建并自动生成
  await page.getByRole("button", { name: /番茄钟/ }).click();
  await expect(page).toHaveURL(/\/project\//);
  await expect(page.getByText("需求文档 ·")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("技术方案").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "版本 v1" })).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: "test-results/editor-v1.png" });

  // 预览可交互，且数据刷新后仍在
  const frame = page.frameLocator('iframe[title="应用预览"]');
  await frame.getByPlaceholder("添加一条...").fill("端到端测试条目");
  await frame.getByRole("button", { name: "添加" }).click();
  await expect(frame.getByText("端到端测试条目")).toBeVisible();
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.frameLocator('iframe[title="应用预览"]').getByText("端到端测试条目")).toBeVisible();

  // 对话迭代（补丁）
  await page.getByPlaceholder(/继续描述/).fill("把页脚改成版权信息");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "版本 v2" })).toBeVisible({ timeout: 60_000 });
  await expect(page.frameLocator('iframe[title="应用预览"]').getByText("已更新：把页脚改成版权信息")).toBeVisible();

  // 查看历史版本并恢复
  await page.getByRole("button", { name: "版本 v1" }).click();
  await expect(page.getByText("正在查看历史版本 v1")).toBeVisible();
  await page.getByRole("button", { name: "恢复此版本" }).click();
  await expect(page.getByText("恢复到 v1（v3）")).toBeVisible();
  await expect(page.frameLocator('iframe[title="应用预览"]').getByText("离线演示模型生成")).toBeVisible();

  // 发布
  await page.getByRole("button", { name: "发布", exact: true }).click();
  await page.getByRole("button", { name: "公开发布" }).click();
  const link = page.locator('a[href*="/p/"]');
  await expect(link).toBeVisible();
  const shareUrl = await link.getAttribute("href");
  expect(shareUrl).toBeTruthy();

  // 匿名访问公开链接
  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto(shareUrl!);
  await expect(anonPage.frameLocator('iframe[title="应用预览"]').getByText("离线演示模型生成")).toBeVisible();
  await anonPage.getByRole("button", { name: "Remix" }).click();
  await expect(anonPage).toHaveURL(/\/login/);
  await anon.close();

  // 登录用户 Remix
  await page.goto(shareUrl!);
  await page.getByRole("button", { name: "Remix" }).click();
  await expect(page).toHaveURL(/\/project\//, { timeout: 15_000 });
  await expect(page.getByText(/已从公开应用/)).toBeVisible();

  // 工作台能看到两个项目
  await page.goto("/dashboard");
  await expect(page.getByText("我的项目（2）")).toBeVisible();
  await page.screenshot({ path: "test-results/dashboard.png" });
});
