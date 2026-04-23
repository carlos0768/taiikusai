import type { Connection, ZentaiGamen } from "@/types";
import { decodeGrid } from "@/lib/grid/codec";
import { createEmptyGrid, type GridData } from "@/lib/grid/types";
import {
  applyKeepTransition,
  decodeKeepMask,
  filterKeepMaskBySameColor,
  hasKeepCells,
} from "@/lib/keep";

export interface PlaybackFrames {
  frames: GridData[];
  frameNames: string[];
}

export function buildPlaybackFrames(
  route: string[],
  zentaiGamenList: ZentaiGamen[],
  connections: Connection[],
  width: number,
  height: number
): PlaybackFrames {
  const zentaiGamenMap = new Map(zentaiGamenList.map((item) => [item.id, item]));
  const connectionMap = new Map(
    connections.map((connection) => [
      `${connection.source_id}:${connection.target_id}`,
      connection,
    ])
  );
  const frames: GridData[] = [];
  const frameNames: string[] = [];

  route.forEach((nodeId, index) => {
    const item = zentaiGamenMap.get(nodeId);
    if (!item) return;

    const grid = decodeGrid(item.grid_data, width, height);
    frames.push(grid);
    frameNames.push(item.name);

    const nextNodeId = route[index + 1];
    if (!nextNodeId) return;

    const connection = connectionMap.get(`${nodeId}:${nextNodeId}`);
    if (!connection) return;

    const nextItem = zentaiGamenMap.get(nextNodeId);
    const rawMask = decodeKeepMask(connection.keep_mask_grid_data, width, height);
    const mask =
      rawMask && nextItem
        ? filterKeepMaskBySameColor(
            grid,
            decodeGrid(nextItem.grid_data, width, height),
            rawMask
          )
        : null;

    const hasKeep = hasKeepCells(mask);
    frames.push(
      hasKeep && mask ? applyKeepTransition(grid, mask) : createEmptyGrid(width, height)
    );
    frameNames.push(hasKeep ? `${item.name} → keep` : `${item.name} → 白間隔`);
  });

  return { frames, frameNames };
}
