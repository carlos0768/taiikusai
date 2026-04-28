import { redirect } from "next/navigation";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ branch?: string }>;
}) {
  const { projectId } = await params;
  const { branch } = await searchParams;
  const nextSearchParams = new URLSearchParams();

  if (branch) {
    nextSearchParams.set("branch", branch);
  }
  nextSearchParams.set("ai", "1");

  redirect(`/project/${projectId}?${nextSearchParams.toString()}`);
}
