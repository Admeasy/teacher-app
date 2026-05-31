"use client";

import dynamic from "next/dynamic";

const Salary = dynamic(() => import("@/teacher/pages/Salary"), {
  ssr: false,
});

export default function Page() {
  return <Salary />;
}
