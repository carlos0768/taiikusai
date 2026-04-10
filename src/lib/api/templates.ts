import { createClient } from "@/lib/supabase/client";
import type { Template } from "@/types";

export async function getTemplates(): Promise<Template[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("templates")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function searchTemplates(query: string): Promise<Template[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("templates")
    .select("*")
    .ilike("name", `%${query}%`)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createTemplate(
  name: string,
  gridData: string,
  gridWidth: number,
  gridHeight: number,
  thumbnail?: string,
  tags: string[] = []
): Promise<Template> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("templates")
    .insert({
      owner_id: "00000000-0000-0000-0000-000000000000",
      name,
      grid_data: gridData,
      grid_width: gridWidth,
      grid_height: gridHeight,
      thumbnail: thumbnail ?? null,
      tags,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTemplate(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("templates").delete().eq("id", id);
  if (error) throw error;
}
