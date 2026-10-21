/**
 * 核心类型定义。全部为纯数据结构，无运行时依赖。
 * 命名约定：对外 JSON 用 snake_case（WakaTime 契约），内部用 camelCase。
 */

export type EntityType = "file" | "app" | "url" | "domain";

/** WakaTime 活动分类，未识别时归 coding */
export type Category =
  | "coding"
  | "building"
  | "indexing"
  | "debugging"
  | "browsing"
  | "running tests"
  | "writing tests"
  | "manual testing"
  | "writing docs"
  | "code reviewing"
  | "communicating"
  | "notes"
  | "researching"
  | "learning"
  | "designing"
  | "ai coding";

/** 规范化之后的心跳（内部形状） */
export interface Heartbeat {
  entity: string;
  type: EntityType;
  category: Category;
  /** epoch 秒，带小数 */
  time: number;
  project: string | null;
  projectRootCount: number | null;
  branch: string | null;
  language: string | null;
  /** 逗号分隔的依赖串 */
  dependencies: string | null;
  lines: number | null;
  lineno: number | null;
  cursorpos: number | null;
  isWrite: boolean;
  machineNameId: string | null;
  userAgent: string | null;
  editor: string | null;
  os: string | null;
  aiLineChanges: number | null;
  humanLineChanges: number | null;
  aiSession: string | null;
  aiInputTokens: number | null;
  aiOutputTokens: number | null;
  aiPromptLength: number | null;
  aiSubscriptionPlan: string | null;
}

/** 一段连续活动 */
export interface Duration {
  startTime: number;
  endTime: number;
  /** 秒 */
  duration: number;
  project: string | null;
  branch: string | null;
  language: string | null;
  category: Category;
  entity: string;
  isWrite: boolean;
  numHeartbeats: number;
  machineNameId: string | null;
  /** 该段首个心跳的编辑器标识（vscode / cursor ...） */
  editor: string | null;
  /** 该段首个心跳的操作系统 */
  os: string | null;
  /** 用户时区下的 YYYY-MM-DD */
  day: string;
}

/** WakaTime 的时长格式化结构 */
export interface TimeTotal {
  total_seconds: number;
  hours: number;
  minutes: number;
  text: string;
  digital: string;
  decimal: string;
}

/** 汇总里的一个条目（语言/项目/编辑器等） */
export interface SummaryEntry {
  name: string;
  total_seconds: number;
  text: string;
  hours: number;
  minutes: number;
  digital: string;
  decimal: string;
  percent: number;
}

/** 一天的汇总 */
export interface DaySummary {
  date: string;
  grandTotal: TimeTotal;
  categories: SummaryEntry[];
  projects: SummaryEntry[];
  languages: SummaryEntry[];
  editors: SummaryEntry[];
  operatingSystems: SummaryEntry[];
  machines: SummaryEntry[];
  branches: SummaryEntry[];
  dependencies: SummaryEntry[];
  entities: SummaryEntry[];
}

