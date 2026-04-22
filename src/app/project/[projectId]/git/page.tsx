import { redirect } from "next/navigation";

export default async function GitPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ branch?: string }>;
}) {
  const { projectId } = await params;
  const { branch } = await searchParams;
  redirect(
    `/project/${projectId}/git/requests${branch && branch !== "main" ? `?branch=${branch}` : ""}`
  );
}
