"use client";

import dynamic from "next/dynamic";

const Dashboard = dynamic(() => import("@/teacher/pages/Dashboard"), {
  ssr: false,
});

export default function Page() {
  return <Dashboard />;
}
