"use client";

import dynamic from "next/dynamic";

const Leave = dynamic(() => import("@/teacher/pages/Leave"), {
  ssr: false,
});

export default function Page() {
  return <Leave />;
}
