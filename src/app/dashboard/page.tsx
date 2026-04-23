"use client";

import dynamic from "next/dynamic";

const DashboardPage = dynamic(
  () => import("@/components/dashboard/DashboardPage"),
  { ssr: false }
);

export default function Page() {
  return <DashboardPage />;
}
