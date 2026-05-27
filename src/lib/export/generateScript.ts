import type { ColorIndex } from "@/lib/grid/types";

interface SceneData {
  sceneNumber: number;
  action: "color" | "keep";
  colorIndex: ColorIndex;
  memo: string;
}

interface ScriptContent {
  css: string;
  tableHtml: string;
}

const COLOR_DISPLAY: Record<number, string> = {
  0: "〇", // white (fold)
  1: "黄",
  2: "赤",
  3: "●", // black
  4: "青",
  5: "閉", // undefined (designer hasn't decided yet)
};

const COLUMN_WIDTHS = [39, 47, 101, 39, 47, 101, 39, 47, 101, 39, 47, 101];
const GROUPS_PER_ROW = 4;
const MIN_SCENE_ROWS = 25;
const SCRIPT_PAGE_WIDTH = COLUMN_WIDTHS.reduce((sum, width) => sum + width, 0);

function getColorDisplay(scene: SceneData): string {
  if (scene.action === "keep") {
    return "keep";
  }
  return COLOR_DISPLAY[scene.colorIndex] ?? "ー";
}

const CSS = `
<style>
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: Arial, sans-serif; }
  .script-page {
    box-sizing: border-box;
    width: ${SCRIPT_PAGE_WIDTH}px;
    background: #fff;
    color: #000;
    font-family: Arial, sans-serif;
  }
  .ritz.grid-container {
    width: ${SCRIPT_PAGE_WIDTH}px;
    height: auto;
    overflow: visible;
    background: #fff;
    position: relative;
    z-index: 0;
  }
  .ritz .waffle {
    border-collapse: collapse;
    border-spacing: 0;
    table-layout: fixed;
    width: ${SCRIPT_PAGE_WIDTH}px;
  }
  .ritz .waffle a { color: inherit; }
  .ritz .waffle th,
  .ritz .waffle td {
    box-sizing: border-box;
    background-color: #ffffff;
    direction: ltr;
    padding: 2px 3px 2px 3px;
  }
  .ritz .waffle .softmerge { overflow: visible; }
  .ritz .waffle .softmerge-inner {
    overflow: hidden;
    position: relative;
    text-overflow: clip;
    white-space: nowrap;
  }
  .ritz .waffle .s0 {
    background-color: #ffffff;
    text-align: center;
    font-weight: bold;
    color: #000000;
    font-family: Arial;
    font-size: 15pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s1 {
    border-bottom: 2px SOLID #000000;
    background-color: #ffffff;
    text-align: center;
    font-weight: bold;
    color: #000000;
    font-family: Arial;
    font-size: 15pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s2 {
    border-bottom: 2px SOLID #000000;
    background-color: #ffffff;
    text-align: center;
    color: #f3f3f3;
    font-family: Arial;
    font-size: 10pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s3 {
    border-right: none;
    background-color: #ffffff;
    text-align: left;
    font-weight: bold;
    color: #000000;
    font-family: Arial;
    font-size: 18pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s4 {
    border-left: none;
    border-right: none;
    background-color: #ffffff;
    text-align: center;
    font-weight: bold;
    color: #000000;
    font-family: Arial;
    font-size: 15pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s5 {
    border-left: none;
    background-color: #ffffff;
    text-align: center;
    font-weight: bold;
    color: #000000;
    font-family: Arial;
    font-size: 15pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s6 {
    border-right: 2px SOLID #000000;
    background-color: #ffffff;
    text-align: center;
    font-weight: bold;
    color: #ffffff;
    font-family: Arial;
    font-size: 15pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s7 {
    border-bottom: 2px SOLID #000000;
    border-right: 2px SOLID #000000;
    background-color: #ffffff;
    text-align: center;
    color: #000000;
    font-family: Arial;
    font-size: 17pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s8 {
    background-color: #ffffff;
    text-align: center;
    color: #000000;
    font-family: Arial;
    font-size: 10pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s9 {
    background-color: #ffffff;
    text-align: left;
    color: #000000;
    font-family: Arial;
    font-size: 10pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s10 {
    border-right: 2px SOLID #000000;
    background-color: #ffffff;
    text-align: center;
    color: #000000;
    font-family: Arial;
    font-size: 10pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s11 {
    border-right: none;
    border-bottom: 1px SOLID #000000;
    background-color: #ffffff;
    text-align: left;
    color: #000000;
    font-family: Arial;
    font-size: 10pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s12 {
    border-left: none;
    border-right: none;
    border-bottom: 1px SOLID #000000;
    background-color: #ffffff;
    text-align: left;
    color: #000000;
    font-family: Arial;
    font-size: 10pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s13 {
    border-left: none;
    border-bottom: 1px SOLID #000000;
    background-color: #ffffff;
    text-align: left;
    color: #000000;
    font-family: Arial;
    font-size: 10pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s14 {
    border-bottom: 1px SOLID #000000;
    background-color: #ffffff;
    text-align: left;
    color: #000000;
    font-family: Arial;
    font-size: 10pt;
    vertical-align: bottom;
    white-space: nowrap;
  }
  .ritz .waffle .s15 {
    border-bottom: 2px SOLID #000000;
    background-color: #ffffff;
    text-align: center;
    color: #000000;
    font-family: Arial;
    font-size: 10pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s16 {
    border-bottom: 2px SOLID #000000;
    border-right: 1px DASHED #000000;
    background-color: #ffffff;
    text-align: center;
    color: #000000;
    font-family: Arial;
    font-size: 10pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s17 {
    border-bottom: 2px SOLID #000000;
    border-right: 2px SOLID #000000;
    background-color: #ffffff;
    text-align: center;
    color: #000000;
    font-family: Arial;
    font-size: 10pt;
    vertical-align: middle;
    white-space: normal;
    overflow: hidden;
    word-wrap: break-word;
  }
  .ritz .waffle .s18 {
    border-bottom: 1px SOLID #000000;
    border-right: 1px DASHED #000000;
    background-color: #ffffff;
    text-align: center;
    font-weight: bold;
    color: #000000;
    font-family: Arial;
    font-size: 12pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s19 {
    border-bottom: 1px SOLID #000000;
    border-right: 1px DASHED #000000;
    background-color: #ffffff;
    text-align: center;
    color: #000000;
    font-family: Arial;
    font-size: 12pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s20 {
    border-bottom: 1px SOLID #000000;
    border-right: 2px SOLID #000000;
    background-color: #ffffff;
    text-align: center;
    font-weight: bold;
    color: #000000;
    font-family: Arial;
    font-size: 10pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s21 {
    border-bottom: 1px SOLID #000000;
    border-right: 2px SOLID #000000;
    background-color: #ffffff;
    text-align: center;
    color: #000000;
    font-family: Arial;
    font-size: 10pt;
    vertical-align: middle;
    white-space: normal;
    overflow: hidden;
    word-wrap: break-word;
  }
  .ritz .waffle .s22 {
    border-bottom: 1px SOLID #000000;
    border-right: 2px SOLID #000000;
    background-color: #ffffff;
    text-align: center;
    color: #000000;
    font-family: Arial;
    font-size: 9pt;
    vertical-align: middle;
    white-space: normal;
    overflow: hidden;
    word-wrap: break-word;
  }
  .ritz .waffle .s23 {
    border-bottom: 2px SOLID #000000;
    border-right: 1px DASHED #000000;
    background-color: #ffffff;
    text-align: center;
    font-weight: bold;
    color: #000000;
    font-family: Arial;
    font-size: 12pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s24 {
    border-bottom: 2px SOLID #000000;
    border-right: 1px DASHED #000000;
    background-color: #ffffff;
    text-align: center;
    color: #000000;
    font-family: Arial;
    font-size: 12pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s28 {
    border-bottom: 2px SOLID #000000;
    border-right: 2px SOLID #000000;
    background-color: #ffffff;
    text-align: center;
    font-weight: bold;
    color: #000000;
    font-family: Arial;
    font-size: 10pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s29 {
    border-right: none;
    background-color: #ffffff;
    text-align: left;
    color: #000000;
    font-family: Arial;
    font-size: 12pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s30 {
    border-left: none;
    border-right: none;
    background-color: #ffffff;
    text-align: center;
    font-weight: bold;
    color: #000000;
    font-family: Arial;
    font-size: 12pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s31 {
    border-left: none;
    border-right: none;
    background-color: #ffffff;
    text-align: center;
    font-weight: bold;
    color: #000000;
    font-family: Arial;
    font-size: 10pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s32 {
    border-left: none;
    background-color: #ffffff;
    text-align: center;
    font-weight: bold;
    color: #000000;
    font-family: Arial;
    font-size: 10pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s33 {
    border-left: none;
    background-color: #ffffff;
    text-align: center;
    font-weight: bold;
    color: #000000;
    font-family: Arial;
    font-size: 12pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s34 {
    background-color: #ffffff;
    text-align: center;
    font-weight: bold;
    color: #000000;
    font-family: Arial;
    font-size: 12pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s35 {
    background-color: #ffffff;
    text-align: center;
    font-weight: bold;
    color: #000000;
    font-family: Arial;
    font-size: 10pt;
    vertical-align: middle;
    white-space: nowrap;
  }
  .ritz .waffle .s36 {
    background-color: #ffffff;
    text-align: left;
    color: #000000;
    font-family: Arial;
    font-size: 11pt;
    vertical-align: middle;
    white-space: normal;
    overflow: hidden;
    word-wrap: break-word;
  }
</style>
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlWithBreaks(value: string): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br>");
}

export function getPanelScriptRowLabel(rowIndex: number): string {
  if (rowIndex < 26) {
    return String.fromCharCode(65 + rowIndex);
  }
  return String(rowIndex + 1);
}

function tableRow(rowNumber: number, height: number, cells: string): string {
  return `<tr style="height: ${height}px" data-row="${rowNumber}">${cells}</tr>`;
}

function td(className: string, content = "", attrs = ""): string {
  const attrText = attrs ? ` ${attrs}` : "";
  return `<td class="${className}"${attrText} dir="ltr">${content}</td>`;
}

function emptyCells(classNames: string[]): string {
  return classNames.map((className) => td(className)).join("");
}

function getSheetPosition(cellX: number, cellY: number): string {
  return `${cellX + 1}ー${getPanelScriptRowLabel(cellY)}`;
}

function renderHeaderRows(
  cellX: number,
  cellY: number,
  projectName: string
): string {
  const escapedProjectName = escapeHtml(projectName);
  const rowLabel = getPanelScriptRowLabel(cellY);
  const sheetPosition = escapeHtml(getSheetPosition(cellX, cellY));

  return [
    tableRow(
      1,
      31,
      `${emptyCells(Array(10).fill("s0"))}${td("s1")}${td("s2", escapeHtml(rowLabel))}`
    ),
    tableRow(
      2,
      37,
      `<td></td>${td("s0")}${td(
        "s3 softmerge",
        `<div class="softmerge-inner" style="width:286px;left:-1px">${escapedProjectName}　パネル</div>`
      )}${emptyCells(["s4", "s4", "s5", "s5", "s0", "s0"])}${td(
        "s6",
        escapeHtml(String(cellX + 1))
      )}${td("s7", sheetPosition, 'colspan="2" rowspan="3"')}`
    ),
    tableRow(
      3,
      7,
      `${emptyCells(["s8", "s8", "s8", "s9", "s9", "s9", "s9"])}<td></td><td></td>${td("s10")}`
    ),
    tableRow(
      4,
      20,
      `${emptyCells(["s8", "s8", "s8"])}${td(
        "s11 softmerge",
        '<div class="softmerge-inner" style="width:185px;left:-1px">　　　　年　　　　組　　　　番　　氏名</div>'
      )}${emptyCells(["s12", "s13", "s13"])}<td class="s14"></td><td class="s14"></td>${td("s10")}`
    ),
    tableRow(5, 13, emptyCells(Array(12).fill("s15"))),
    tableRow(
      6,
      27,
      Array.from({ length: GROUPS_PER_ROW }, () =>
        `${td("s16", "番号")}${td("s16", "色")}${td("s17", "動き")}`
      ).join("")
    ),
  ].join("");
}

function getMemoCellClass(memo: string, isLastSceneRow: boolean): string {
  if (isLastSceneRow) {
    return memo ? "s17" : "s28";
  }
  if (!memo) {
    return "s20";
  }
  return memo.length > 18 || /\r|\n/.test(memo) ? "s22" : "s21";
}

function renderSceneRows(scenes: SceneData[], rowsPerPage: number): string {
  let tableRows = "";

  for (let row = 0; row < rowsPerPage; row += 1) {
    const isLastSceneRow = row === rowsPerPage - 1;
    let cells = "";

    for (let group = 0; group < GROUPS_PER_ROW; group += 1) {
      const scene = scenes[group * rowsPerPage + row];
      const numClass = isLastSceneRow ? "s23" : "s18";
      const colorClass = isLastSceneRow ? "s24" : "s19";

      if (scene) {
        const colorText = escapeHtml(getColorDisplay(scene));
        const memo = scene.memo || "";
        const memoClass = getMemoCellClass(memo, isLastSceneRow);
        cells += td(numClass, escapeHtml(String(scene.sceneNumber)));
        cells += td(colorClass, colorText);
        cells += td(memoClass, escapeHtmlWithBreaks(memo));
      } else {
        cells += td(numClass);
        cells += td(colorClass);
        cells += td(isLastSceneRow ? "s28" : "s20");
      }
    }

    tableRows += tableRow(row + 7, 41, cells);
  }

  return tableRows;
}

function renderFooterRow(rowNumber: number): string {
  return tableRow(
    rowNumber,
    41,
    `${td(
      "s29 softmerge",
      '<div class="softmerge-inner" style="width:372px;left:-1px">「 * 」：テンポはやめ　「keep」：閉じずにそのまま出しておく　「ー」：開かない</div>'
    )}${emptyCells(["s30", "s31", "s30", "s30", "s32", "s33", "s34", "s35", "s36", "s36", "s36"])}`
  );
}

function generateScriptContent(
  cellX: number,
  cellY: number,
  scenes: SceneData[],
  projectName: string
): ScriptContent {
  const rowsPerPage = Math.max(
    MIN_SCENE_ROWS,
    Math.ceil(scenes.length / GROUPS_PER_ROW)
  );
  const bodyRows = `${renderHeaderRows(cellX, cellY, projectName)}${renderSceneRows(
    scenes,
    rowsPerPage
  )}${renderFooterRow(rowsPerPage + 7)}`;

  return {
    css: CSS,
    tableHtml: `<div class="ritz grid-container" dir="ltr"><table class="waffle no-grid" cellspacing="0" cellpadding="0"><tbody>${bodyRows}</tbody></table></div>`,
  };
}

export function generateScriptInnerHtml(
  cellX: number,
  cellY: number,
  scenes: SceneData[],
  projectName: string
): string {
  const content = generateScriptContent(cellX, cellY, scenes, projectName);
  return `${content.css}
<div class="script-page">
${content.tableHtml}
</div>`;
}

export function generateScriptHtml(
  cellX: number,
  cellY: number,
  scenes: SceneData[],
  projectName: string
): string {
  const content = generateScriptContent(cellX, cellY, scenes, projectName);
  const position = `${getPanelScriptRowLabel(cellY)}列${cellX + 1}番`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${escapeHtml(projectName)} - ${escapeHtml(position)}</title>
${content.css}
</head>
<body>
<div class="script-page">
${content.tableHtml}
</div>
</body>
</html>`;
}
