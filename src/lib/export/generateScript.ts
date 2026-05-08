import type { ColorIndex } from "@/lib/grid/types";

interface SceneData {
  sceneNumber: number;
  action: "color" | "keep";
  colorIndex: ColorIndex;
  memo: string;
}

const COLOR_DISPLAY: Record<number, string> = {
  0: "〇", // white (fold)
  1: "黄",
  2: "赤",
  3: "●", // black
  4: "青",
  5: "閉", // undefined (designer hasn't decided yet)
};

function getColorDisplay(scene: SceneData): string {
  if (scene.action === "keep") {
    return "keep";
  }
  return COLOR_DISPLAY[scene.colorIndex] ?? "ー";
}

const CSS = `
<style>
  body { margin: 0; padding: 10px; font-family: Arial, sans-serif; }
  .script-table { border-collapse: collapse; width: 100%; }
  .script-table th, .script-table td {
    border: 1px solid #000;
    padding: 6px 8px;
    text-align: center;
    vertical-align: middle;
    font-size: 11pt;
  }
  .script-table th { background: #f0f0f0; font-weight: bold; }
  .header-row td { border: none; font-size: 14pt; font-weight: bold; padding: 8px 4px; }
  .info-row td { border: none; border-bottom: 1px solid #000; font-size: 10pt; padding: 4px; }
  .separator { border-bottom: 2px solid #000; }
  .col-num { width: 40px; }
  .col-color { width: 50px; font-size: 12pt; }
  .col-memo { width: 120px; font-size: 9pt; text-align: left; }
  .color-white { }
  .color-yellow { background: #fff8cc; }
  .color-red { background: #ffcccc; }
  .color-black { background: #e0e0e0; }
  .color-blue { background: #cce0ff; }
  .color-undefined { background: #e5e7eb; color: #9ca3af; }
  .keep { color: #888; font-style: italic; }
  .group-header th { font-size: 10pt; border-bottom: 2px solid #000; }
  @media print { body { padding: 5mm; } }
</style>
`;

const COLOR_CLASS: Record<number, string> = {
  0: "color-white",
  1: "color-yellow",
  2: "color-red",
  3: "color-black",
  4: "color-blue",
  5: "color-undefined",
};

export function getPanelScriptRowLabel(rowIndex: number): string {
  if (rowIndex < 26) {
    return String.fromCharCode(65 + rowIndex);
  }
  return String(rowIndex + 1);
}

export function generateScriptInnerHtml(
  cellX: number,
  cellY: number,
  scenes: SceneData[],
  projectName: string
): string {
  const position = `${getPanelScriptRowLabel(cellY)}列${cellX + 1}番`;
  const COLS_PER_GROUP = 3; // 番号, 色, 動き
  const GROUPS_PER_ROW = 4;
  const ROWS_PER_PAGE = Math.ceil(scenes.length / GROUPS_PER_ROW);

  // Build scene rows grouped into columns
  let tableRows = "";

  for (let row = 0; row < ROWS_PER_PAGE; row++) {
    tableRows += "<tr style='height:36px'>";

    for (let group = 0; group < GROUPS_PER_ROW; group++) {
      const sceneIdx = group * ROWS_PER_PAGE + row;
      if (sceneIdx < scenes.length) {
        const scene = scenes[sceneIdx];
        const colorText = getColorDisplay(scene);
        const isKeep = colorText === "keep";
        const colorClass = isKeep ? "keep" : COLOR_CLASS[scene.colorIndex] ?? "";

        tableRows += `<td class="col-num"><b>${scene.sceneNumber}</b></td>`;
        tableRows += `<td class="col-color ${colorClass}">${colorText}</td>`;
        tableRows += `<td class="col-memo">${scene.memo || ""}</td>`;
      } else {
        tableRows += `<td class="col-num"></td><td class="col-color"></td><td class="col-memo"></td>`;
      }
    }

    tableRows += "</tr>";
  }

  // Build group headers
  let groupHeaders = "";
  for (let g = 0; g < GROUPS_PER_ROW; g++) {
    groupHeaders += `<th class="col-num">番号</th><th class="col-color">色</th><th class="col-memo">動き</th>`;
  }

  return `${CSS}
<table class="script-table">
  <tr class="header-row">
    <td colspan="${COLS_PER_GROUP * GROUPS_PER_ROW}">${projectName}　パネル台本</td>
  </tr>
  <tr class="info-row">
    <td colspan="${COLS_PER_GROUP * GROUPS_PER_ROW - 2}" style="text-align:left">
      　　年　　組　　番　氏名
    </td>
    <td colspan="2" style="text-align:right;font-weight:bold;font-size:14pt;border:2px solid #000">
      ${position}
    </td>
  </tr>
  <tr class="separator"><td colspan="${COLS_PER_GROUP * GROUPS_PER_ROW}"></td></tr>
  <tr class="group-header">${groupHeaders}</tr>
  ${tableRows}
</table>`;
}
