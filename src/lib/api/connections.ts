import { createClient } from "@/lib/supabase/client";
import type { Connection } from "@/types";

export async function getConnectionsByProject(
  projectId: string
): Promise<Connection[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createConnection(
  projectId: string,
  sourceId: string,
  targetId: string,
  sortOrder: number = 0
): Promise<Connection> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("connections")
    .insert({
      project_id: projectId,
      source_id: sourceId,
      target_id: targetId,
      sort_order: sortOrder,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteConnection(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("connections")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function deleteConnectionByNodes(
  sourceId: string,
  targetId: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("connections")
    .delete()
    .eq("source_id", sourceId)
    .eq("target_id", targetId);
  if (error) throw error;
}

/**
 * Find all playback routes from a starting node using DFS.
 * Returns array of routes, each route is an ordered array of zentai_gamen IDs.
 */
export function findPlaybackRoutes(
  connections: Connection[],
  startId: string
): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const conn of connections) {
    const targets = adjacency.get(conn.source_id) ?? [];
    targets.push(conn.target_id);
    adjacency.set(conn.source_id, targets);
  }

  const routes: string[][] = [];

  function dfs(current: string, path: string[], visited: Set<string>) {
    const targets = adjacency.get(current);
    if (!targets || targets.length === 0) {
      routes.push([...path]);
      return;
    }

    for (const target of targets) {
      if (visited.has(target)) continue; // prevent cycles
      visited.add(target);
      path.push(target);
      dfs(target, path, visited);
      path.pop();
      visited.delete(target);
    }

    // If all targets were visited (cycle), save current path
    if (targets.every((t) => visited.has(t))) {
      routes.push([...path]);
    }
  }

  dfs(startId, [startId], new Set([startId]));
  return routes;
}
