import { COLOR_MAP, type ColorIndex } from "@/lib/grid/types";

/**
 * Scan pipeline のピクセル量子化ユーティリティ。
 *
 * 生成された高解像度のピクセルバッファ (RGBA or RGB) を、パネルのセル解像度
 * (W×H) に area-average でダウンサンプルし、各セルをパネル 5 色パレット
 * (白・黄・赤・黒・青) の最近傍インデックスに変換する。
 *
 * 距離計算は CIE L*a*b* 色空間で行う。sRGB の単純なユークリッド距離よりも
 * 知覚的に近い色を選びやすい。
 */

// パネルに塗れる 5 色のインデックス (UNDEFINED_COLOR=5 は除く)
const PAINTABLE_INDICES = [0, 1, 2, 3, 4] as const satisfies readonly ColorIndex[];

interface Lab {
  L: number;
  a: number;
  b: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** sRGB (0-255) → CIE L*a*b* (D65 white point) */
function rgbToLab(r: number, g: number, b: number): Lab {
  const rL = srgbToLinear(r);
  const gL = srgbToLinear(g);
  const bL = srgbToLinear(b);

  // Linear sRGB → XYZ (D65)
  const X = rL * 0.4124564 + gL * 0.3575761 + bL * 0.1804375;
  const Y = rL * 0.2126729 + gL * 0.7151522 + bL * 0.072175;
  const Z = rL * 0.0193339 + gL * 0.119192 + bL * 0.9503041;

  // D65 reference white
  const xn = X / 0.95047;
  const yn = Y / 1.0;
  const zn = Z / 1.08883;

  const f = (t: number): number =>
    t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;

  const fx = f(xn);
  const fy = f(yn);
  const fz = f(zn);

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

// パレット 5 色の LAB を先に計算しておく
const PALETTE_LAB: readonly Lab[] = PAINTABLE_INDICES.map((idx) => {
  const [r, g, b] = hexToRgb(COLOR_MAP[idx]);
  return rgbToLab(r, g, b);
});

function nearestPaletteIndex(lab: Lab): ColorIndex {
  let bestDistSq = Infinity;
  let bestIdx: ColorIndex = PAINTABLE_INDICES[0];
  for (let i = 0; i < PALETTE_LAB.length; i++) {
    const p = PALETTE_LAB[i];
    const dL = lab.L - p.L;
    const da = lab.a - p.a;
    const db = lab.b - p.b;
    const distSq = dL * dL + da * da + db * db;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestIdx = PAINTABLE_INDICES[i];
    }
  }
  return bestIdx;
}

/**
 * 高解像度ピクセルバッファ → W×H ColorIndex grid 変換。
 *
 * @param pixels    ソース画像の行優先ピクセル配列 (RGBA なら 4ch、RGB なら 3ch)
 * @param srcWidth  ソース画像の幅 (ピクセル)
 * @param srcHeight ソース画像の高さ (ピクセル)
 * @param dstWidth  出力 grid の幅 (セル数)
 * @param dstHeight 出力 grid の高さ (セル数)
 * @param channels  ピクセルあたりのバイト数 (3 or 4、デフォルト 4)
 * @returns Uint8Array (length = dstWidth * dstHeight、各要素は 0..4 の ColorIndex)
 */
export function quantizeToIndexGrid(
  pixels: Uint8Array | Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
  channels: 3 | 4 = 4
): Uint8Array {
  const out = new Uint8Array(dstWidth * dstHeight);

  for (let dy = 0; dy < dstHeight; dy++) {
    const y0 = Math.floor((dy * srcHeight) / dstHeight);
    const y1Raw = Math.floor(((dy + 1) * srcHeight) / dstHeight);
    const y1 = Math.max(y0 + 1, y1Raw); // 最低 1 行はサンプル

    for (let dx = 0; dx < dstWidth; dx++) {
      const x0 = Math.floor((dx * srcWidth) / dstWidth);
      const x1Raw = Math.floor(((dx + 1) * srcWidth) / dstWidth);
      const x1 = Math.max(x0 + 1, x1Raw);

      // area-average: 対応するソース矩形内の全ピクセルを平均
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let count = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * srcWidth + xx) * channels;
          rSum += pixels[i];
          gSum += pixels[i + 1];
          bSum += pixels[i + 2];
          count++;
        }
      }

      if (count === 0) {
        // ソース範囲外。発生しないはずだが安全側で黒に
        out[dy * dstWidth + dx] = 3;
        continue;
      }

      const r = rSum / count;
      const g = gSum / count;
      const b = bSum / count;
      out[dy * dstWidth + dx] = nearestPaletteIndex(rgbToLab(r, g, b));
    }
  }

  return out;
}

/** Uint8Array → base64 (ブラウザ / Node 両対応) */
export function uint8ArrayToBase64(u8: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < u8.length; i++) {
    binary += String.fromCharCode(u8[i]);
  }
  return btoa(binary);
}
