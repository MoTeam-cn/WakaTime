import { esc } from "./layout.ts";

export interface BarPoint {
  label: string;
  value: number;
}

/** 近 N 天柱状图（纯 SVG，无依赖） */
export function barChart(points: BarPoint[], opts: { height?: number; labelEvery?: number } = {}): string {
  const height = opts.height ?? 140;
  const width = 900;
  const padBottom = 18;
  const chartH = height - padBottom;
  const max = Math.max(1, ...points.map((p) => p.value));
  const n = Math.max(1, points.length);
  const slot = width / n;
  const barW = Math.max(2, Math.min(24, slot * 0.62));
  const labelEvery = opts.labelEvery ?? Math.ceil(n / 10);

  const bars: string[] = [];
  points.forEach((p, i) => {
    const h = p.value <= 0 ? 0 : Math.max(1, (p.value / max) * (chartH - 6));
    const x = i * slot + (slot - barW) / 2;
    const y = chartH - h;
    bars.push("<rect x=\"" + x.toFixed(1) + "\" y=\"" + y.toFixed(1) + "\" width=\"" + barW.toFixed(1) + "\" height=\"" + h.toFixed(1) + "\" fill=\"currentColor\" />");
    if (i % labelEvery === 0) {
      bars.push("<text x=\"" + (x + barW / 2).toFixed(1) + "\" y=\"" + (height - 4) + "\" font-size=\"10\" fill=\"currentColor\" opacity=\"0.55\" text-anchor=\"middle\">" + esc(p.label.slice(5)) + "</text>");
    }
  });

  return [
    "<svg viewBox=\"0 0 " + width + " " + height + "\" width=\"100%\" height=\"" + height + "\" role=\"img\" style=\"color:var(--fg)\">",
    "<line x1=\"0\" y1=\"" + (chartH + 0.5) + "\" x2=\"" + width + "\" y2=\"" + (chartH + 0.5) + "\" stroke=\"currentColor\" stroke-opacity=\"0.25\" />",
    bars.join(""),
    "</svg>",
  ].join("");
}

/** 水平排行条 */
export function rankList(rows: { name: string; text: string; percent: number }[], emptyText = "暂无数据"): string {
  if (rows.length === 0) return "<p class=\"muted\">" + esc(emptyText) + "</p>";
  const items = rows.map((r) => {
    const pct = Math.max(0, Math.min(100, r.percent));
    return [
      "<tr>",
      "<td>" + esc(r.name) + "</td>",
      "<td class=\"right num\">" + esc(r.text) + "</td>",
      "<td class=\"right num muted\" style=\"width:56px\">" + pct.toFixed(1) + "%</td>",
      "<td style=\"width:35%\"><div class=\"bar\"><span style=\"width:" + pct.toFixed(1) + "%\"></span></div></td>",
      "</tr>",
    ].join("");
  });
  return [
    "<table>",
    "<thead><tr><th>名称</th><th class=\"right\">时长</th><th class=\"right\">占比</th><th></th></tr></thead>",
    "<tbody>" + items.join("") + "</tbody>",
    "</table>",
  ].join("");
}

