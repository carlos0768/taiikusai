"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { prefetchRoutes } from "@/lib/client/prefetch";
import { buildBranchPath } from "@/lib/projectBranches";
import TemplateGrid from "@/components/templates/TemplateGrid";

export default function TemplatesPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const branchId = searchParams.get("branch");
  const router = useRouter();
  const backHref = branchId
    ? buildBranchPath(`/project/${projectId}`, branchId)
    : `/project/${projectId}`;

  useEffect(() => {
    prefetchRoutes(router, [backHref]);
  }, [backHref, router]);

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-card-border">
        <button
          onClick={() => router.push(backHref)}
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
