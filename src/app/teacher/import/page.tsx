"use client";

import dynamic from "next/dynamic";

const Import = dynamic(() => import("@/teacher/pages/Import"), {
  ssr: false,
});

export default function Page() {
  return <Import />;
}
