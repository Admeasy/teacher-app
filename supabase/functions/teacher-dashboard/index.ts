import { resolveTeacherClasses, fetchStudentsForClass } from "../_shared/teacherClasses.ts";
import {
  TEACHER_CORS,
  jsonResponse,
  parseJsonBody,
  requireTeacherAuth,
  safeErrorMessage,
  serviceClient,
} from "../_shared/teacherAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: TEACHER_CORS,
    });
  }

  const sb = serviceClient();

  try {
    const body = await parseJsonBody(req);

    const auth = await requireTeacherAuth(req, body, sb);

    if (!auth.ok) {
      return auth.response;
    }

    const teacher = auth.teacher;
    const workspaceId = teacher.workspace_id;

    const { classes, subjectByClassId } =
      await resolveTeacherClasses(
        sb,
        workspaceId,
        teacher
      );

    // =========================
    // CLASS SUMMARY
    // =========================

    const classSummary: any[] = [];
    const allStudentIds: string[] = [];

    for (const c of classes) {
      const students =
        await fetchStudentsForClass(
          sb,
          workspaceId,
          c,
          "id, attendance_pct"
        );

      students.forEach((s: any) => {
        if (s?.id) {
          allStudentIds.push(s.id);
        }
      });

      const averageAttendance =
        students.length > 0
          ? Math.round(
              students.reduce(
                (sum: number, s: any) =>
                  sum + (Number(s.attendance_pct) || 0),
                0
              ) / students.length
            )
          : 0;

      classSummary.push({
        id: c.id,
        class_name: c.class_name,
        section: c.section,
        student_count: students.length,
        attendance_pct: averageAttendance,
        subject: subjectByClassId[c.id] ?? null,
        role: c.role ?? null,
      });
    }

    const totalStudents = allStudentIds.length;

    // =========================
    // DATE RANGE
    // =========================

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    // =========================
    // ATTENDANCE
    // =========================

    let attToday: any[] = [];
    let attWeek: any[] = [];

    if (allStudentIds.length > 0) {
      const todayRes = await sb
        .from("attendance_records")
        .select("status")
        .eq("workspace_id", workspaceId)
        .in("student_id", allStudentIds)
        .gte("date", today.toISOString().slice(0, 10));

      if (todayRes.error) {
        console.error(
          "attendance today error",
          todayRes.error
        );
      }

      attToday = todayRes.data ?? [];

      const weekRes = await sb
        .from("attendance_records")
        .select("status, date")
        .eq("workspace_id", workspaceId)
        .in("student_id", allStudentIds)
        .gte("date", weekAgo.toISOString().slice(0, 10));

      if (weekRes.error) {
        console.error(
          "attendance week error",
          weekRes.error
        );
      }

      attWeek = weekRes.data ?? [];
    }

    const presentToday =
      attToday.filter(
        (a: any) => a.status === "present"
      ).length;

    const absentToday =
      attToday.filter(
        (a: any) => a.status === "absent"
      ).length;

    const weekPresent =
      attWeek.filter(
        (a: any) => a.status === "present"
      ).length;

    const weekTotal =
      attWeek.length || 1;

    const weeklyAttendancePct =
      Math.round(
        (weekPresent / weekTotal) * 100
      );

    // =========================
    // UPCOMING TESTS
    // =========================

    const {
      data: upcomingTests,
      error: testsError,
    } = await sb
      .from("tests")
      .select(
        "id, title, subject, class_id, created_at"
      )
      .eq("workspace_id", workspaceId)
      .eq("teacher_id", teacher.id)
      .order("created_at", {
        ascending: false,
      })
      .limit(5);

    if (testsError) {
      console.error(
        "upcoming tests error",
        testsError
      );
    }

    // =========================
    // AI USAGE
    // =========================

    const {
      count: aiUsageCount,
      error: aiCountError,
    } = await sb
      .from("teacher_ai_usage")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("workspace_id", workspaceId)
      .eq("teacher_id", teacher.id);

    if (aiCountError) {
      console.error(
        "ai usage count error",
        aiCountError
      );
    }

    const {
      data: recentAi,
      error: recentAiError,
    } = await sb
      .from("teacher_ai_usage")
      .select(
        "mode, prompt, created_at"
      )
      .eq("workspace_id", workspaceId)
      .eq("teacher_id", teacher.id)
      .order("created_at", {
        ascending: false,
      })
      .limit(5);

    if (recentAiError) {
      console.error(
        "recent ai error",
        recentAiError
      );
    }

    // =========================
    // RESPONSE
    // =========================

    return jsonResponse({
      total_students: totalStudents,

      classes_assigned: classes.length,

      attendance_today: {
        present: presentToday,
        absent: absentToday,
        total: attToday.length,
      },

      weekly_attendance_pct:
        weeklyAttendancePct,

      attendance_reports:
        attWeek.length,

      pending_evaluations: 0,

      ai_usage_count:
        aiUsageCount ?? 0,

      classes: classSummary,

      upcoming_tests:
        upcomingTests ?? [],

      recent_ai:
        recentAi ?? [],
    });

  } catch (e) {
    console.error(
      "teacher-dashboard error",
      e
    );

    return jsonResponse(
      {
        error: safeErrorMessage(e),
      },
      500
    );
  }
});