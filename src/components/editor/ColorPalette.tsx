"use client";

import { COLOR_MAP, type ColorIndex, NUM_COLORS } from "@/lib/grid/types";

interface ColorPaletteProps {
  activeColor: ColorIndex;
  onColorChange: (color: ColorIndex) => void;
}

export default function ColorPalette({
  activeColor,
  onColorChange,
}: ColorPaletteProps) {
  return (
    <div className="flex items-center justify-center gap-3 px-4 py-3 bg-card border-t border-card-border">
      {Array.from({ length: NUM_COLORS }, (_, i) => i as ColorIndex).map(
        (colorIdx) => (
          <button
            key={colorIdx}
            onClick={() => onColorChange(colorIdx)}
            className="relative w-10 h-10 rounded-full transition-transform"
            style={{
              backgroundColor: COLOR_MAP[colorIdx],
              transform: activeColor === colorIdx ? "scale(1.2)" : "scale(1)",
              border:
                colorIdx === 0
                  ? "2px solid #555"
                  : activeColor === colorIdx
                    ? "3px solid #FFD700"
                    : "2px solid transparent",
              boxShadow:
                activeColor === colorIdx
                  ? "0 0 12px rgba(255, 215, 0, 0.5)"
                  : "none",
            }}
            aria-label={`色 ${colorIdx}`}
          />
        )
      )}
    </div>
  );
}
