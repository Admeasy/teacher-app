"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

const SelectSchool = dynamic(() => import("@/teacher/pages/SelectSchool"), { ssr: false });

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SelectSchool />
    </Suspense>
  );
}
