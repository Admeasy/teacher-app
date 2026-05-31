"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

const Login = dynamic(() => import("@/teacher/pages/Login"), { ssr: false });

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Login />
    </Suspense>
  );
}
