import { expect, type Page, test } from "@playwright/test";

async function signUp(page: Page, email: string) {
  await page.goto("/login?mode=signup");
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("至少 6 位").fill("test123456");
  await page.getByRole("button", { name: "创建账号" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("自定义智能体按账号隔离，并参与该账号的生成", async ({ page, browser }) => {
  const stamp = Date.now();
  // 未登录时从首页「登录后自定义」进入，注册后直接落到「我的智能体」
  await page.goto("/");
  await page.getByRole("link", { name: "登录后自定义" }).click();
  await expect(page.getByText("登录后即可创建只属于你的智能体")).toBeVisible();
  await page.getByPlaceholder("you@example.com").fill(`agents-a-${stamp}@example.com`);
  await page.getByPlaceholder("至少 6 位").fill("test123456");
  await page.getByRole("button", { name: "创建账号" }).click();
  await expect(page).toHaveURL(/\/agents/);

  // 从模板创建 Iris
  await page.getByRole("button", { name: "Iris · 无障碍顾问" }).first().click();
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("从可访问性角度审查方案").first()).toBeVisible();
  // 出场顺序里 Iris 排在 Bob 和 Alex 之间
  const lineup = page.locator("section").first();
  await expect(lineup).toContainText(/Bob[\s\S]*Iris[\s\S]*Alex/);

  // ID 不能与内置成员重名
  await page.getByRole("button", { name: "新建智能体" }).click();
  await page.getByPlaceholder("Iris", { exact: true }).fill("Max");
  await page.getByPlaceholder("无障碍顾问").fill("测试");
  await page.getByPlaceholder("a11y").fill("pm");
  await page.getByPlaceholder(/例如：从可访问性角度/).fill("测试职责");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("ID 不能与内置成员重名")).toBeVisible();
  await page.getByRole("button", { name: "取消" }).click();
  await page.screenshot({ path: "test-results/agents.png" });

  // 生成时 Iris 出场，并在刷新后仍然显示正确的形象
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /记账本/ }).click();
  await expect(page.getByRole("button", { name: "版本 v1" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Iris 的建议")).toBeVisible();
  await page.reload();
  await expect(page.getByText("无障碍顾问").first()).toBeVisible();
  await expect(page.getByText("Iris 的建议")).toBeVisible();

  // 停用后不再出场
  await page.goto("/agents");
  await page.getByRole("switch", { name: /停用 Iris/ }).click();
  await expect(page.getByRole("switch", { name: /启用 Iris/ })).toBeVisible();
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /贪吃蛇/ }).click();
  await expect(page.getByRole("button", { name: "版本 v1" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Iris 的建议")).toHaveCount(0);

  // 另一个账号看不到 A 的智能体
  const other = await browser.newContext();
  const pageB = await other.newPage();
  await signUp(pageB, `agents-b-${stamp}@example.com`);
  await pageB.goto("/agents");
  await expect(pageB.getByText("还没有自定义智能体")).toBeVisible();
  await other.close();
});
