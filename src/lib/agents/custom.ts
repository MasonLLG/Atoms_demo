import type { CustomAgentConfig } from "./core/factories";

/** custom_agents 表的一行 */
export interface CustomAgentRow {
  id: string;
  slug: string;
  name: string;
  title: string;
  color: string;
  avatar: string | null;
  description: string | null;
  instructions: string;
  flows: ("create" | "edit")[];
  after: "leader" | "pm" | "architect";
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export function rowToConfig(row: CustomAgentRow): CustomAgentConfig {
  return {
    id: row.slug,
    name: row.name,
    title: row.title,
    color: row.color,
    avatar: row.avatar || undefined,
    description: row.description || undefined,
    instructions: row.instructions,
    flows: row.flows,
    after: row.after,
  };
}

export const AFTER_LABEL: Record<CustomAgentRow["after"], string> = {
  leader: "Mike（团队负责人）之后",
  pm: "Emma（产品经理）之后",
  architect: "Bob（架构师）之后",
};

/** 新建智能体时可以一键套用的模板 */
export const AGENT_PRESETS: Omit<CustomAgentRow, "id" | "enabled" | "created_at" | "updated_at">[] = [
  {
    slug: "a11y",
    name: "Iris",
    title: "无障碍顾问",
    color: "#06b6d4",
    avatar: "I",
    description: "让应用对所有人都好用",
    instructions: "从可访问性角度审查方案：颜色对比度、键盘可操作性、焦点样式、语义化标签与 aria 属性、表单标签与错误提示。给出可直接落地的建议。",
    flows: ["create", "edit"],
    after: "architect",
  },
  {
    slug: "copywriter",
    name: "Luna",
    title: "文案专家",
    color: "#f97316",
    avatar: "L",
    description: "打磨界面文案与语气",
    instructions: "为应用设计界面文案：标题、按钮、空状态、提示语和示例数据。语气亲切、简洁、有画面感，避免生硬的技术词汇。直接给出具体文案。",
    flows: ["create"],
    after: "pm",
  },
  {
    slug: "designer",
    name: "Nova",
    title: "UI 设计师",
    color: "#a855f7",
    avatar: "N",
    description: "统一视觉风格与细节",
    instructions: "给出视觉设计规范：配色（主色、辅助色、背景、文字）、字号层级、间距、圆角、阴影、动效与微交互。追求现代、精致、有记忆点的风格。",
    flows: ["create", "edit"],
    after: "architect",
  },
  {
    slug: "security",
    name: "Rex",
    title: "安全审查",
    color: "#ef4444",
    avatar: "R",
    description: "防止 XSS 等前端安全问题",
    instructions: "审查前端安全：用户输入渲染时必须转义（避免 innerHTML 直接拼接用户内容），localStorage 数据读取需要容错，不引入不可信的第三方脚本。给出具体的修改建议。",
    flows: ["create", "edit"],
    after: "architect",
  },
];

const BUILTIN_ORDER = ["leader", "pm", "architect"] as const;

/**
 * 计算出场顺序（纯函数，服务端组装团队与前端展示共用）：
 * 自定义成员插入到 after 指定的内置成员之后，同一锚点按声明顺序排列，工程师永远最后。
 */
export function orderLineup<T extends { id: string; after: string }>(custom: T[]): (string | T)[] {
  const lineup: (string | T)[] = [...BUILTIN_ORDER];
  for (const c of custom) {
    let idx = lineup.findIndex((x) => x === c.after);
    while (idx + 1 < lineup.length && typeof lineup[idx + 1] !== "string") idx++;
    lineup.splice(idx + 1, 0, c);
  }
  return [...lineup, "engineer"];
}
