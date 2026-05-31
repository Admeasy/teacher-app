import {
  TEACHER_CORS,
  jsonResponse,
  parseJsonBody,
  requireTeacherAuth,
  safeErrorMessage,
  serviceClient,
} from "../_shared/teacherAuth.ts";

type Status = "present" | "absent" | "late" | "leave";
const ALLOWED: Status[] = ["present", "absent", "late", "leave"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: TEACHER_CORS });
  const sb = serviceClient();
  try {
    const body = await parseJsonBody(req);
    const auth = await requireTeacherAuth(req, body, sb);
    if (!auth.ok) return auth.response;

    const teacher = auth.teacher;
    const workspace_id = teacher.workspace_id;
    const class_id = String(body.class_id ?? "");
    const date = String(body.date ?? "");
    const reporting_teacher_id = body.reporting_teacher_id as string | undefined;
    const reporting_teacher_name = body.reporting_teacher_name as string | undefined;
    const attendance = body.attendance;

    if (!class_id || !date || !Array.isArray(attendance)) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonResponse({ error: "Invalid date" }, 400);
    }

    // Validate teacher is associated with this class via any of:
    //   classes.class_teacher_id, class_assignments (text class/section), or teacher_assignments.
    const [{ data: cls }, { data: ta }, { data: ca }] = await Promise.all([
      sb.from("classes").select("id, class_name, section, class_teacher_id")
        .eq("workspace_id", workspace_id).eq("id", class_id).maybeSingle(),
      sb.from("teacher_assignments").select("id")
        .eq("workspace_id", workspace_id).eq("teacher_id", teacher.id).eq("class_id", class_id).limit(1),
      sb.from("class_assignments").select("class, section")
        .eq("workspace_id", workspace_id).eq("teacher_id", teacher.id),
    ]);
    const norm = (s: any) => String(s ?? "").trim().replace(/^class\s+/i, "").toLowerCase();
    const matchByAssignment = (ca ?? []).some((row: any) =>
      norm(row.class) === norm(cls?.class_name) &&
      (!row.section || String(row.section).trim().toLowerCase() === String(cls?.section ?? "").trim().toLowerCase())
    );
    const isClassTeacher = cls?.class_teacher_id === teacher.id;
    if (!ta?.length && !isClassTeacher && !matchByAssignment) {
      return jsonResponse({ error: "Teacher not assigned to this class" }, 403);
    }

    const studentIds = attendance.map((a: any) => a.student_id).filter(Boolean);
    if (!studentIds.length) {
      return jsonResponse({ success: true, saved: 0 });
    }
    const className = String(cls?.class_name ?? "").trim();
    const sectionVal = cls?.section ?? null;
    const classCandidates = Array.from(new Set([
      className, className.replace(/^class\s+/i, ""), `Class ${className.replace(/^class\s+/i, "")}`,
    ].filter(Boolean)));
    const { data: validStudents } = await sb.from("students")
      .select("id, class_id, class, section")
      .eq("workspace_id", workspace_id).in("id", studentIds);
    const validIdSet = new Set((validStudents ?? []).filter((s: any) => {
      if (s.class_id === class_id) return true;
      if (!s.class_id && classCandidates.includes(s.class) && (!sectionVal || s.section === sectionVal)) return true;
      return false;
    }).map((s: any) => s.id));

    // Resolve reporting teacher name snapshot
    let reportingName = reporting_teacher_name ?? null;
    let reportingId = reporting_teacher_id ?? teacher.id;
    if (reportingId && !reportingName) {
      const { data: rt } = await sb.from("teachers")
        .select("name").eq("workspace_id", workspace_id).eq("id", reportingId).maybeSingle();
      reportingName = rt?.name ?? teacher.name;
    }

    // Build bulk upsert rows
    const rows = attendance
      .filter((a: any) => validIdSet.has(a.student_id) && ALLOWED.includes(a.status))
      .map((a: any) => ({
        workspace_id,
        class_id,
        student_id: a.student_id,
        teacher_id: teacher.id,
        reporting_teacher_id: reportingId,
        reporting_teacher_name_snapshot: reportingName,
        marked_by: teacher.id,
        date,
        status: a.status as Status,
      }));

    if (!rows.length) {
      return jsonResponse({ success: true, saved: 0 });
    }

    // Bulk upsert on (student_id, date)
    const { error } = await sb.from("attendance_records").upsert(rows, {
      onConflict: "student_id,date",
    });
    if (error) {
      return jsonResponse({ error: "Unable to save attendance" }, 500);
    }

    return jsonResponse({ success: true, saved: rows.length, date, class_id });
  } catch (e) {
    return jsonResponse({ error: safeErrorMessage(e) }, 500);
  }
});
