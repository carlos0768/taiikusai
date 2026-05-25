"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { prefetchRoutes } from "@/lib/client/prefetch";
import { buildBranchPath } from "@/lib/projectBranches";
import PanelShowEditor from "@/components/panelShows/PanelShowEditor";

export default function PanelShowDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const showId = params.showId as string;
  const branchId = searchParams.get("branch") ?? "";
  const router = useRouter();
  const backHref = buildBranchPath(
    `/project/${projectId}/panel-shows`,
    branchId
  );

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
        <h1 className="font-semibold">パネルショー</h1>
      </header>

      <div className="flex-1 overflow-hidden">
        <PanelShowEditor
          showId={showId}
          projectId={projectId}
          branchId={branchId}
        />
      </div>
    </div>
  );
}
