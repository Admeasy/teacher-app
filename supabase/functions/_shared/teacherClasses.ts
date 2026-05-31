// Resolve every class a teacher is associated with by merging three sources:
//   1) classes.class_teacher_id           (primary class teacher)
//   2) class_assignments (role + class/section text)
//   3) teacher_assignments (class_id link)
// Returns a normalized list of class rows + a helper to fetch students for them.

export interface ClassRow {
  id: string;
  class_name: string | null;
  section: string | null;
  role?: string | null;
  subject?: string | null;
}

export async function resolveTeacherClasses(
  sb: any,
  workspace_id: string,
  teacher: { id: string; name?: string | null },
): Promise<{ classes: ClassRow[]; classIds: string[]; subjectByClassId: Record<string, string | null> }> {
  const subjectByClassId: Record<string, string | null> = {};
  const map = new Map<string, ClassRow>();

  // 1) classes.class_teacher_id
  const { data: ct } = await sb.from("classes")
    .select("id, class_name, section")
    .eq("workspace_id", workspace_id)
    .eq("class_teacher_id", teacher.id);
  (ct ?? []).forEach((c: any) => map.set(c.id, { ...c, role: "class_teacher" }));

  // 2) class_assignments → resolve (class, section) to classes.id
  const { data: ca } = await sb.from("class_assignments")
    .select("class, section, role")
    .eq("workspace_id", workspace_id)
    .eq("teacher_id", teacher.id);
  if (ca && ca.length) {
    // Match each (class, section) to a real classes row (try multiple normalizations)
    for (const row of ca) {
      const rawClass = String(row.class ?? "").trim();
      const sec = row.section ? String(row.section).trim() : null;
      const candidates = Array.from(new Set([
        rawClass,
        rawClass.replace(/^class\s+/i, ""),
        `Class ${rawClass.replace(/^class\s+/i, "")}`,
      ].filter(Boolean)));
      let cls: any = null;
      const { data: hit } = await sb.from("classes")
        .select("id, class_name, section")
        .eq("workspace_id", workspace_id)
        .in("class_name", candidates)
        .limit(20);
      cls = (hit ?? []).find((c: any) =>
        (sec ? String(c.section ?? "").trim().toLowerCase() === sec.toLowerCase() : true)
      ) ?? hit?.[0] ?? null;
      if (cls) {
        if (!map.has(cls.id)) map.set(cls.id, { ...cls, role: row.role ?? "teacher" });
      }
    }
  }

  // 3) teacher_assignments
  const { data: ta } = await sb.from("teacher_assignments")
    .select("class_id, subject")
    .eq("workspace_id", workspace_id)
    .eq("teacher_id", teacher.id);
  const taIds = Array.from(new Set((ta ?? []).map((a: any) => a.class_id).filter(Boolean)));
  if (taIds.length) {
    const { data: taClasses } = await sb.from("classes")
      .select("id, class_name, section")
      .eq("workspace_id", workspace_id).in("id", taIds);
    (taClasses ?? []).forEach((c: any) => { if (!map.has(c.id)) map.set(c.id, { ...c, role: "teacher" }); });
    (ta ?? []).forEach((a: any) => { if (a.class_id) subjectByClassId[a.class_id] = a.subject ?? null; });
  }

  const classes = Array.from(map.values()).sort((a, b) =>
    String(a.class_name ?? "").localeCompare(String(b.class_name ?? "")) ||
    String(a.section ?? "").localeCompare(String(b.section ?? ""))
  );
  return { classes, classIds: classes.map(c => c.id), subjectByClassId };
}

// Fetch students for a given classes row, falling back to (class, section) text match
// for legacy students.class_id IS NULL rows.
export async function fetchStudentsForClass(
  sb: any,
  workspace_id: string,
  cls: ClassRow,
  select = "id, name, roll_number, student_id, class, section",
): Promise<any[]> {
  const out: any[] = [];
  const seen = new Set<string>();
  const push = (rows: any[]) => rows.forEach((r) => { if (!seen.has(r.id)) { seen.add(r.id); out.push(r); } });

  if (cls.id) {
    const { data } = await sb.from("students").select(select)
      .eq("workspace_id", workspace_id).eq("class_id", cls.id);
    push(data ?? []);
  }
  // Fallback by (class, section) text on students that have no class_id
  const className = cls.class_name ? String(cls.class_name).replace(/^class\s+/i, "").trim() : null;
  if (className) {
    const candidates = Array.from(new Set([
      cls.class_name!, className, `Class ${className}`,
    ]));
    let q = sb.from("students").select(select)
      .eq("workspace_id", workspace_id).in("class", candidates);
    if (cls.section) q = q.eq("section", cls.section);
    const { data } = await q;
    push(data ?? []);
  }
  return out.sort((a, b) => String(a.roll_number ?? "").localeCompare(String(b.roll_number ?? ""), undefined, { numeric: true }));
}

export interface HolidayCheck {
  is_holiday: boolean;
  label: string | null;
  kind: string | null;
}
export async function checkHoliday(sb: any, workspace_id: string, dateISO: string): Promise<HolidayCheck> {
  const d = new Date(dateISO + "T00:00:00");
  const weekday = d.getDay(); // 0=Sun
  const { data } = await sb.from("holidays").select("label, kind, date, recurring_weekday")
    .eq("workspace_id", workspace_id)
    .or(`date.eq.${dateISO},recurring_weekday.eq.${weekday}`);
  const hit = (data ?? [])[0];
  if (!hit) return { is_holiday: false, label: null, kind: null };
  return { is_holiday: true, label: hit.label ?? "Holiday", kind: hit.kind ?? "school_holiday" };
}
