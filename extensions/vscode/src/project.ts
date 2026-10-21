import fs from "node:fs";
import path from "node:path";

export interface ProjectInfo {
  project: string | null;
  branch: string | null;
  rootCount: number | null;
}

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

/** 向上查找 .git 目录，识别项目名与分支；不依赖 git 二进制 */
export function detectProject(filePath: string): ProjectInfo {
  let dir = path.dirname(filePath);
  let depth = 0;
  for (let i = 0; i < 40; i++) {
    const marker = path.join(dir, ".wakatime-project");
    try {
      const name = fs.readFileSync(marker, "utf8").split("\n")[0].trim();
      if (name.length > 0) {
        const gitDir = path.join(dir, ".git");
        return { project: name, branch: fs.existsSync(gitDir) ? readHead(gitDir) : null, rootCount: depth + 1 };
      }
    } catch {
      /* 继续 */
    }
    const gitDir = path.join(dir, ".git");
    if (fs.existsSync(gitDir)) {
      return { project: path.basename(dir), branch: readHead(gitDir), rootCount: depth + 1 };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
    depth++;
  }
  return { project: null, branch: null, rootCount: null };
}

