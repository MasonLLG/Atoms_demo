"use client";

import { createClient } from "./supabase/client";

export const PENDING_PROMPT_KEY = "atoms:pending-prompt";

export const TEMPLATES = [
  { icon: "🍅", title: "番茄钟", prompt: "做一个番茄钟专注计时器，可以管理今日任务，并统计每天完成的番茄数" },
  { icon: "💰", title: "记账本", prompt: "做一个个人记账本，支持收入支出分类、按月统计，并用图表展示各分类占比" },
  { icon: "✅", title: "习惯打卡", prompt: "做一个习惯打卡应用，可以添加习惯、每日打卡，并展示连续打卡天数和日历热力图" },
  { icon: "🐍", title: "贪吃蛇", prompt: "做一个贪吃蛇小游戏，支持键盘和手机触屏操作，记录最高分" },
  { icon: "📋", title: "看板", prompt: "做一个 Kanban 任务看板，有待办、进行中、已完成三列，支持拖拽卡片" },
  { icon: "📝", title: "Markdown 笔记", prompt: "做一个 Markdown 笔记本，左侧笔记列表，右侧编辑与实时预览，支持搜索" },
];

/** 创建空项目并跳转到编辑器，编辑器会自动把 prompt 发给智能体团队 */
export async function createProjectFromPrompt(prompt: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    sessionStorage.setItem(PENDING_PROMPT_KEY, prompt);
    return "/login?next=/dashboard";
  }
  const { data, error } = await supabase
    .from("projects")
    .insert({ user_id: user.id, name: prompt.slice(0, 16) || "未命名应用" })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message || "创建项目失败");
  sessionStorage.setItem(`atoms:autosend:${data.id}`, prompt);
  return `/project/${data.id}`;
}
