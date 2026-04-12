export type ColorIndex = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * 未定義（まだ色が決まっていないセル）を表す内部専用の色インデックス。
 * 実パネルには存在しない "非色"。エディタでは灰色で描画し、消しゴム・
 * 新規グリッド初期化・移動ツールの移動元クリアなどに使う。
 * カラーパレット UI には表示されない。
 *
 * リテラル型 5 として宣言することで、`Exclude<ColorIndex, typeof UNDEFINED_COLOR>`
 * で「塗れる色」の型を取り出せる（`PaintColorIndex` 等）。
 */
export const UNDEFINED_COLOR = 5 as const;

export const COLOR_MAP: Record<ColorIndex, string> = {
  0: "#FFFFFF", // white (fold) — 実パネルの白（折り目）
  1: "#FFD700", // yellow
  2: "#FF0000", // red
  3: "#000000", // black
  4: "#0000FF", // blue
  5: "#9CA3AF", // undefined (gray) — 未定義セル。実パネル色ではない
} as const;

export const COLOR_NAMES: Record<ColorIndex, string> = {
  0: "白",
  1: "黄",
  2: "赤",
  3: "黒",
  4: "青",
  5: "未定義",
} as const;

/**
 * カラーパレット UI に表示される「塗れる色」の数。
 * 0〜4（白、黄、赤、黒、青）の 5 色のみをパレットに出す。
 * UNDEFINED_COLOR (5) はパレットには出さない（消しゴムツール経由でしか入らない）。
 */
export const NUM_COLORS = 5;

export interface GridData {
  width: number;
  height: number;
  cells: Uint8Array;
}

export function createEmptyGrid(width: number, height: number): GridData {
  const cells = new Uint8Array(width * height);
  // 新規グリッドは全セルを「未定義（灰色）」で初期化する。
  // 既存の保存済みグリッドは grid_data が全 0 バイトのまま保存されており、
  // 0 = 白（実パネル色）のままレンダリングされるので互換性は保たれる。
  cells.fill(UNDEFINED_COLOR);
  return {
    width,
    height,
    cells,
  };
}

export function getCell(grid: GridData, x: number, y: number): ColorIndex {
  return grid.cells[y * grid.width + x] as ColorIndex;
}

export function setCell(
  grid: GridData,
  x: number,
  y: number,
  color: ColorIndex
): void {
  grid.cells[y * grid.width + x] = color;
}

export function cloneGrid(grid: GridData): GridData {
  return {
    width: grid.width,
    height: grid.height,
    cells: new Uint8Array(grid.cells),
  };
}
