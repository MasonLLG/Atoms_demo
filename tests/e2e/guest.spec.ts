import { expect, test } from "@playwright/test";

test("游客无需注册即可生成，绑定邮箱后作品保留", async ({ page }) => {
  const email = `guest-${Date.now()}@example.com`;

  // 未登录直接在首页提问，不经过登录页
  await page.goto("/");
  await expect(page.getByText("无需注册，直接开始体验")).toBeVisible();
  await page.getByPlaceholder(/描述你想要的应用/).fill("做一个喝水记录小工具");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/project\//, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "版本 v1" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: /游客 · 绑定邮箱/ })).toBeVisible();

  // 工作台显示游客提示，绑定邮箱
  await page.goto("/dashboard");
  await expect(page.getByText("你正在以游客身份体验")).toBeVisible();
  await expect(page.getByText("我的项目（1）")).toBeVisible();
  await page.getByRole("button", { name: "绑定邮箱" }).click();
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("至少 6 位").fill("test123456");
  await page.getByRole("button", { name: "绑定", exact: true }).click();
  await expect(page.getByText("你正在以游客身份体验")).toHaveCount(0);
  await expect(page.getByText(email)).toBeVisible();

  // 退出后用绑定的邮箱登录，项目还在
  await page.getByRole("button", { name: "退出" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/login");
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("至少 6 位").fill("test123456");
  await page.getByRole("button", { name: "登录" }).last().click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("我的项目（1）")).toBeVisible();
});
