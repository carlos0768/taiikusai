"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { fetchJson } from "@/lib/client/api";
import { getClientErrorMessage } from "@/lib/client/errors";
import { prefetchRoutes } from "@/lib/client/prefetch";
import { buildBranchPath } from "@/lib/projectBranches";
import type { AuthProfile, MergeRequestListItem } from "@/types";

interface RequestsResponse {
  requests: MergeRequestListItem[];
}

interface MeResponse {
  profile: AuthProfile;
}

export default function GitRequestsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const branchId = searchParams.get("branch");
  const backHref = branchId
    ? buildBranchPath(`/project/${projectId}`, branchId)
    : `/project/${projectId}`;

  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [requests, setRequests] = useState<MergeRequestListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [me, requestsResponse] = await Promise.all([
        fetchJson<MeResponse>("/api/auth/me"),
        fetchJson<RequestsResponse>(`/api/projects/${projectId}/requests`),
      ]);

      setProfile(me.profile);
      setRequests(requestsResponse.requests);

      if (me.profile.is_admin) {
        await fetchJson(`/api/notifications/unread?projectId=${projectId}`, {
          method: "PATCH",
        });
      }
    } catch (err) {
      setError(getClientErrorMessage(err, "リクエストを読み込めませんでした"));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    prefetchRoutes(router, [backHref]);
  }, [backHref, router]);

  const handleReview = useCallback(
    async (requestId: string, approve: boolean) => {
      try {
        await fetchJson(`/api/projects/${projectId}/requests/${requestId}/review`, {
          method: "POST",
          body: JSON.stringify({ approve }),
        });
        await load();
      } catch (err) {
        setError(getClientErrorMessage(err, "レビューに失敗しました"));
      }
    },
    [load, projectId]
  );

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-card-border">
        <button
          onClick={() => router.push(backHref)}
          className="text-muted hover:text-foreground transition-colors text-lg px-2"
        >
          ←
        </button>
        <div>
          <h1 className="font-semibold">Git / リクエスト</h1>
          <p className="text-xs text-muted">擬似Git の main 反映申請</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-4xl space-y-4">
          {error && (
            <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}

          {loading && <p className="text-muted text-center py-10">読み込み中...</p>}

          {!loading && requests.length === 0 && (
            <div className="rounded-xl border border-card-border bg-card px-6 py-10 text-center">
              <p className="text-muted">現在リクエストはありません。</p>
            </div>
          )}

          {requests.map((request) => (
            <div
              key={request.id}
              className="rounded-xl border border-card-border bg-card p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-xs text-sky-300">
                      {request.source_branch_name}
                    </span>
                    <span className="text-xs text-muted">→</span>
                    <span className="rounded-full bg-accent/20 px-2.5 py-1 text-xs text-accent">
                      {request.target_branch_name}
                    </span>
                  </div>
                  <p className="mt-3 font-medium">{request.summary || "概要なし"}</p>
                  <p className="mt-2 text-sm text-muted">
                    申請者: {request.requested_by_display_name}
                  </p>
                  <p className="text-sm text-muted">
                    作成日時: {new Date(request.created_at).toLocaleString("ja-JP")}
                  </p>
                  {request.reviewed_by_display_name && (
                    <p className="text-sm text-muted">
                      レビュー: {request.reviewed_by_display_name}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs ${
                      request.status === "open"
                        ? "bg-sky-500/15 text-sky-300"
                        : request.status === "approved"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-danger/15 text-danger"
                    }`}
                  >
                    {request.status}
                  </span>

                  {profile?.is_admin && request.status === "open" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleReview(request.id, false)}
                        className="rounded-lg border border-card-border px-3 py-2 text-sm text-foreground hover:border-danger/50 transition-colors"
                      >
                        却下
                      </button>
                      <button
                        onClick={() => void handleReview(request.id, true)}
                        className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-black hover:opacity-90 transition-opacity"
                      >
                        承認して反映
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
