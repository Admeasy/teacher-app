"use client";

import { useEffect } from "react";

import { usePathname, useRouter } from "next/navigation";

import { useTeacherSession } from "../hooks/useTeacherSession";
import { validateTeacherSession } from "@/lib/teacherSession";
import { useTeacherStore } from "../store/teacherStore";

import {
  getActiveWorkspace,
  getActiveRole,
  setActiveRole,
} from "@/lib/activeWorkspace";

export default function RequireTeacher({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  const pathname = usePathname();

  const { isAuthed } =
    useTeacherSession();

  useEffect(() => {
    if (!getActiveRole()) {
      setActiveRole("teacher");
    }

    const session = useTeacherStore.getState().session;
    if (session && !validateTeacherSession(session)) {
      useTeacherStore.getState().setSession(null);
    }

    if (!getActiveWorkspace()) {
      router.replace(
        `/select-school?next=${encodeURIComponent(pathname)}`
      );

      return;
    }

    if (!isAuthed) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isAuthed, pathname, router]);

  if (!getActiveWorkspace()) {
    return null;
  }

  if (!isAuthed) {
    return null;
  }

  return children;
}
