"use client";

import TeacherLayout from "@/teacher/layouts/TeacherLayout";
import RequireTeacher from "@/teacher/routes/RequireTeacher";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RequireTeacher>
      <TeacherLayout>{children}</TeacherLayout>
    </RequireTeacher>
  );
}
