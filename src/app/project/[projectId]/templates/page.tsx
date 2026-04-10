"use client";

import { useParams, useRouter } from "next/navigation";
import TemplateGrid from "@/components/templates/TemplateGrid";

export default function TemplatesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const router = useRouter();

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-card-border">
        <button
          onClick={() => router.push(`/project/${projectId}`)}
          className="text-muted hover:text-foreground transition-colors text-lg px-2"
        >
          ←
        </button>
        <h1 className="font-semibold">テンプレート</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <TemplateGrid />
      </div>
    </div>
  );
}
