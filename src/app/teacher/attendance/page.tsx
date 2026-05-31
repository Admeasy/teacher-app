"use client";

import dynamic from "next/dynamic";

const Attendance = dynamic(() => import("@/teacher/pages/Attendance"), {
  ssr: false,
});

export default function Page() {
  return <Attendance />;
}
