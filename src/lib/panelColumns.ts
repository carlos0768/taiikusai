import type { Connection, ZentaiGamen } from "@/types";

export interface PanelColumn {
  label: string;
  startNodeId: string;
  startNodeName: string;
  route: string[];
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function getPanelColumnLabel(index: number) {
  let value = index;
  let label = "";

  do {
    label = ALPHABET[value % ALPHABET.length] + label;
    value = Math.floor(value / ALPHABET.length) - 1;
  } while (value >= 0);

  return label;
}

export function findPanelRoute(
  connections: Connection[],
  startId: string
): string[] {
  const adjacency = new Map<string, string[]>();

  connections.forEach((connection) => {
    const targets = adjacency.get(connection.source_id) ?? [];
    targets.push(connection.target_id);
    adjacency.set(connection.source_id, targets);
  });

  const route = [startId];
  const visited = new Set(route);
  let current = startId;

  while (true) {
    const next = adjacency.get(current)?.find((targetId) => !visited.has(targetId));
    if (!next) return route;

    route.push(next);
    visited.add(next);
    current = next;
  }
}

export function getPanelColumns(
  zentaiGamen: ZentaiGamen[],
  connections: Connection[]
): PanelColumn[] {
  const targetIds = new Set(connections.map((connection) => connection.target_id));
  const startNodes = zentaiGamen
    .filter((item) => !targetIds.has(item.id))
    .sort((a, b) => {
      const yDiff = a.position_y - b.position_y;
      if (Math.abs(yDiff) > 24) return yDiff;

      const xDiff = a.position_x - b.position_x;
      if (Math.abs(xDiff) > 24) return xDiff;

      return a.created_at.localeCompare(b.created_at);
    });

  return startNodes.map((node, index) => ({
    label: getPanelColumnLabel(index),
    startNodeId: node.id,
    startNodeName: node.name,
    route: findPanelRoute(connections, node.id),
  }));
}
