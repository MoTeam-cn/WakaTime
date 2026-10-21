import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface ProjectInfo {
  project: string | null;
  branch: string | null;
  rootCount: number | null;
  rootDir: string | null;
  hasProjectFile: boolean;
}

const EMPTY: ProjectInfo = { project: null, branch: null, rootCount: null, rootDir: null, hasProjectFile: false };

function readHead(gitDir: string): string | null {
  try {
    const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    if (head.startsWith("ref: ")) {
      const ref = head.slice(5).trim();
      return ref.startsWith("refs/heads/") ? ref.slice(11) : ref;
    }
    return head.slice(0, 7);
  } catch {
    try {
      const packed = fs.readFileSync(path.join(gitDir, "packed-refs"), "utf8");
      const line = packed.split("\n").find((l) => l.includes("refs/heads/"));
      if (!line) return null;
      const idx = line.indexOf("refs/heads/");
      return line.slice(idx + 11).trim();
    } catch {
      return null;
    }
  }
}

function isSubmodule(gitDir: string): boolean {
  try {
    return fs.statSync(gitDir).isFile();
  } catch {
    return false;
  }
}

/** hide_project_names：生成随机项目名并写入 .wakatime-project，之后复用 */
function ensureAnonymousProjectName(dir: string): string {
  const marker = path.join(dir, ".wakatime-project");
  try {
    const existing = fs.readFileSync(marker, "utf8").split("\n")[0].trim();
    if (existing.length > 0) return existing;
  } catch {
    /* 不存在则创建 */
  }
  const name = "anon-" + crypto.randomBytes(6).toString("hex");
  try {
    fs.writeFileSync(marker, name + "\n", "utf8");
  } catch {
    /* 无写权限则仅本次生效 */
  }
  return name;
}

export interface DetectOptions {
  hideProjectNames: boolean;
  stopAtWorkspaceRoot: string | null;
}

/** 向上查找 .git 或 .wakatime-project，识别项目名、分支与根目录；不依赖 git 二进制 */
export function detectProject(filePath: string, options: DetectOptions): ProjectInfo {
  let dir = path.dirname(filePath);
  let depth = 0;

  for (let i = 0; i < 40; i++) {
    const marker = path.join(dir, ".wakatime-project");
    let markerName: string | null = null;
    try {
      markerName = fs.readFileSync(marker, "utf8").split("\n")[0].trim() || null;
    } catch {
      markerName = null;
    }

    const gitDir = path.join(dir, ".git");
    const hasGit = fs.existsSync(gitDir) && !isSubmodule(gitDir);

    if (markerName || hasGit) {
      const project = markerName ?? (options.hideProjectNames ? ensureAnonymousProjectName(dir) : path.basename(dir));
      return {
        project,
        branch: hasGit ? readHead(gitDir) : null,
        rootCount: depth + 1,
        rootDir: dir,
        hasProjectFile: markerName !== null,
      };
    }

    if (options.stopAtWorkspaceRoot && path.resolve(dir) === path.resolve(options.stopAtWorkspaceRoot)) break;

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
    depth++;
  }

  return EMPTY;
}

/** 只检测 .wakatime-project 是否存在（不向上找 .git） */
export function hasProjectFileNear(filePath: string): boolean {
  let dir = path.dirname(filePath);
  for (let i = 0; i < 20; i++) {
    if (fs.existsSync(path.join(dir, ".wakatime-project"))) return true;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}

