"use client";

import dynamic from "next/dynamic";

const Settings = dynamic(() => import("@/teacher/pages/Settings"), {
  ssr: false,
});

export default function Page() {
  return <Settings />;
}
