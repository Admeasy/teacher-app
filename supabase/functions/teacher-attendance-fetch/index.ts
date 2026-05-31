import { resolveTeacherClasses, fetchStudentsForClass, checkHoliday } from "../_shared/teacherClasses.ts";
import {
  TEACHER_CORS,
  jsonResponse,
  parseJsonBody,
  requireTeacherAuth,
  safeErrorMessage,
  serviceClient,
} from "../_shared/teacherAuth.ts";

function todayISO() { return new Date().toISOString().slice(0, 10); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: TEACHER_CORS });
  const sb = serviceClient();
  try {
    const body = await parseJsonBody(req);
    const auth = await requireTeacherAuth(req, body, sb);
    if (!auth.ok) return auth.response;

    const teacher = auth.teacher;
    const workspace_id = teacher.workspace_id;
    const class_id = body.class_id as string | undefined;
    const date = body.date as string | undefined;
    const targetDate = (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : todayISO();

    const { classes: assignedClasses, classIds: assignedClassIds } = await resolveTeacherClasses(sb, workspace_id, teacher);

    let selectedClassId: string | null = class_id || assignedClassIds[0] || null;
    if (selectedClassId && !assignedClassIds.includes(selectedClassId)) {
      return jsonResponse({ error: "Class not assigned to this teacher" }, 403);
    }

    let students: any[] = [];
    let existing: any[] = [];
    if (selectedClassId) {
      const cls = assignedClasses.find(c => c.id === selectedClassId)!;
      students = await fetchStudentsForClass(sb, workspace_id, cls);
      if (students.length) {
        const ids = students.map((s: any) => s.id);
        const { data: att } = await sb.from("attendance_records")
          .select("id, student_id, status, reporting_teacher_id, reporting_teacher_name_snapshot, teacher_id, updated_at")
          .eq("workspace_id", workspace_id).eq("date", targetDate).in("student_id", ids);
        existing = att ?? [];
      }
    }

    const { data: allTeachers } = await sb.from("teachers")
      .select("id, name, teacher_id, subject")
      .eq("workspace_id", workspace_id).order("name", { ascending: true });

    const holiday = await checkHoliday(sb, workspace_id, targetDate);

    return jsonResponse({
      success: true,
      date: targetDate,
      teacher: { id: teacher.id, name: teacher.name, teacher_id: teacher.teacher_id, subject: teacher.subject },
      assigned_classes: assignedClasses,
      selected_class_id: selectedClassId,
      students,
      existing_attendance: existing,
      teachers: allTeachers ?? [],
      holiday,
    });
  } catch (e) {
    return jsonResponse({ error: safeErrorMessage(e) }, 500);
  }
});
