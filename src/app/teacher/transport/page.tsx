"use client";

import dynamic from "next/dynamic";

const Transport = dynamic(() => import("@/teacher/pages/Transport"), {
  ssr: false,
});

export default function Page() {
  return <Transport />;
}
