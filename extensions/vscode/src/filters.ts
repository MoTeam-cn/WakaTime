import type { WakaConfig, BoolOrList } from "./config-schema.ts";

/** 官方用 POSIX 正则；这里编译成正则，非法模式退化为字面量子串匹配 */
export class PatternSet {
  private patterns: { source: string; re: RegExp | null }[] = [];

  constructor(patterns: string[]) {
    for (const p of patterns) {
      if (!p || p.trim().length === 0) continue;
      let re: RegExp | null = null;
      try {
        re = new RegExp(p);
      } catch {
        re = null;
      }
      this.patterns.push({ source: p, re });
    }
  }

  get size(): number {
    return this.patterns.length;
  }

  matches(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, "/");
    for (const p of this.patterns) {
      if (p.re) {
        if (p.re.test(normalized)) return true;
        if (p.re.test(filePath)) return true;
      } else if (normalized.includes(p.source)) {
        return true;
      }
    }
    return false;
  }
}

/**
 * 文件是否应被记录。
 * 规则与官方一致：exclude 命中则跳过；include 命中则优先保留；
 * includeOnlyWithProjectFile 时要求存在 .wakatime-project。
 */
export function shouldTrack(filePath: string, hasProjectFile: boolean, config: WakaConfig): boolean {
  if (config.includeOnlyWithProjectFile && !hasProjectFile) return false;

  const include = new PatternSet(config.include);
  if (include.size > 0 && include.matches(filePath)) return true;

  const exclude = new PatternSet(config.exclude);
  if (exclude.size > 0 && exclude.matches(filePath)) return false;

  return true;
}

function listMatches(value: BoolOrList, name: string): boolean {
  if (value === true) return true;
  if (value === false) return false;
  return value.some((p) => {
    try {
      return new RegExp(p).test(name);
    } catch {
      return name.includes(p);
    }
  });
}

/** 隐私：是否隐藏文件名（用哈希占位） */
export function shouldHideFile(filePath: string, config: WakaConfig): boolean {
  if (config.hideFileNames === true) return true;
  if (config.hideFileNames === false) return false;
  const base = filePath.split(/[\\/]/).pop() ?? filePath;
  return listMatches(config.hideFileNames, base);
}

export function shouldHideProject(project: string | null, config: WakaConfig): boolean {
  if (!project) return false;
  return listMatches(config.hideProjectNames, project);
}

export function shouldHideBranch(branch: string | null, config: WakaConfig): boolean {
  if (!branch) return false;
  return listMatches(config.hideBranchNames, branch);
}

export function shouldHideDependencies(config: WakaConfig): boolean {
  return config.hideDependencies === true;
}

