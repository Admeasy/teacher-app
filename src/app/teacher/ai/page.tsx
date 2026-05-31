"use client";

import dynamic from "next/dynamic";

const AIWorkspace = dynamic(() => import("@/teacher/pages/AIWorkspace"), {
  ssr: false,
});

export default function Page() {
  return <AIWorkspace />;
}
