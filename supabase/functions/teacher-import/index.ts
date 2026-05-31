import { createClient } from "npm:@supabase/supabase-js@2";
import {
  TEACHER_CORS,
  jsonResponse,
  parseJsonBody,
  requireTeacherAuth,
  safeErrorMessage,
  serviceClient,
} from "../_shared/teacherAuth.ts";

// Reconciliation-based multi-entity importer.
// body: { workspace_id, entity: "teachers" | "students" | "attendance" | "tests" | "fees", rows: [...], file_name? }
// Returns: { batch_id, inserted, updated, deactivated, skipped, failed, errors }

type Row = Record<string, any>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: TEACHER_CORS });
  const sb = serviceClient();
  try {
    const body = await parseJsonBody(req);
    const auth = await requireTeacherAuth(req, body, sb);
    if (!auth.ok) return auth.response;

    const workspace_id = auth.teacher.workspace_id;
    const rows: Row[] = Array.isArray(body?.rows) ? (body.rows as Row[]) : [];
    const entity: string = String(body?.entity ?? "teachers");
    const file_name: string | null = (body?.file_name as string) ?? null;

    if (!rows.length) {
      return jsonResponse({ error: "No rows provided" }, 400);
    }
    if (entity !== "teachers") {
      return jsonResponse({ error: "Teachers may only import teacher data" }, 403);
    }

    // Create batch row
    const { data: batchRow } = await sb.from("import_batches").insert({
      workspace_id,
      entity_type: entity,
      file_name,
      total_rows: rows.length,
      status: "completed",
    }).select("id").single();
    const batch_id: string | null = (batchRow as any)?.id ?? null;

    let inserted = 0, updated = 0, deactivated = 0, skipped = 0, failed = 0;
    const errors: { row: number; error: string }[] = [];

    async function resolveClassId(className?: string, section?: string): Promise<string | null> {
      if (!className) return null;
      const { data } = await sb.from("classes").select("id")
        .eq("workspace_id", workspace_id)
        .eq("class_name", String(className).trim())
        .eq("section", section ? String(section).trim() : "")
        .maybeSingle();
      if (data?.id) return data.id;
      const { data: created, error } = await sb.from("classes")
        .insert({ workspace_id, class_name: String(className).trim(), section: section ? String(section).trim() : null })
        .select("id").single();
      if (error) return null;
      return created.id;
    }

    // ───── TEACHERS ─────
    if (entity === "teachers") {
      const stamped: any[] = [];
      rows.forEach((r, i) => {
        const tidRaw = String(r.teacher_id ?? r["Teacher ID"] ?? r["teacher id"] ?? r.TeacherId ?? r.TeacherID ?? "").trim();
        const tid = tidRaw.toUpperCase();
        const name = String(r.teacher_name ?? r.name ?? r.Name ?? "").trim();
        if (!tid) {
          skipped++;
          errors.push({ row: i + 1, error: `Missing canonical field "teacher_id" (raw keys: ${Object.keys(r).slice(0, 8).join(", ")})` });
          return;
        }
        if (!name) {
          errors.push({ row: i + 1, error: `Row ${i + 1} (${tid}): missing "name" — imported but blank` });
        }
        stamped.push({
          workspace_id,
          teacher_id: tid,
          name,
          email: String(r.email ?? r.Email ?? "").trim().toLowerCase() || null,
          subject: String(r.subject ?? r.Subject ?? "").trim() || null,
          phone: String(r.phone ?? r.Phone ?? "").trim() || null,
          assigned_classes: String(r.assigned_classes ?? r["Assigned Classes"] ?? r["assigned classes"] ?? "").trim() || null,
          is_active: true,
          last_imported_at: new Date().toISOString(),
          import_batch_id: batch_id,
        });
      });

      const incomingKeys = Array.from(new Set(stamped.map((r) => r.teacher_id)));
      const { data: existing } = await sb.from("teachers").select("teacher_id")
        .eq("workspace_id", workspace_id).in("teacher_id", incomingKeys);
      const existingSet = new Set<string>((existing ?? []).map((r: any) => String(r.teacher_id)));

      const CHUNK = 500;
      for (let i = 0; i < stamped.length; i += CHUNK) {
        const slice = stamped.slice(i, i + CHUNK);
        const { error } = await sb.from("teachers").upsert(slice, { onConflict: "workspace_id,teacher_id" });
        if (error) {
          failed += slice.length;
          errors.push({ row: i + 1, error: error.message });
        }
      }
      inserted = incomingKeys.filter((k) => !existingSet.has(k)).length;
      updated = incomingKeys.length - inserted - failed;
      console.log(`[teacher-import] ws=${workspace_id} detected=${rows.length} stamped=${stamped.length} inserted=${inserted} updated=${updated} skipped=${skipped} failed=${failed}`);

      // Deactivate teachers missing from this batch
      const { data: stale } = await sb.from("teachers")
        .select("id, teacher_id")
        .eq("workspace_id", workspace_id)
        .eq("is_active", true);
      const incomingSet = new Set(incomingKeys);
      const staleIds = (stale ?? [])
        .filter((r: any) => r.teacher_id && !incomingSet.has(String(r.teacher_id)))
        .map((r: any) => r.id);
      if (staleIds.length) {
        const { error } = await sb.from("teachers").update({ is_active: false }).in("id", staleIds);
        if (!error) deactivated = staleIds.length;
      }
    }
    // ───── STUDENTS ─────
    else if (entity === "students") {
      const enriched: any[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const sid = String(r.student_id ?? "").trim();
        if (!sid) { skipped++; continue; }
        const classId = await resolveClassId(r.class, r.section);
        enriched.push({
          workspace_id,
          student_id: sid,
          name: String(r.name ?? "").trim(),
          class: String(r.class ?? "").trim() || null,
          section: String(r.section ?? "").trim() || null,
          roll_number: String(r.roll_number ?? "").trim() || null,
          class_id: classId,
          student_email: String(r.student_email ?? "").trim().toLowerCase() || null,
          parent_name: String(r.parent_name ?? "").trim() || null,
          parent_email: String(r.parent_email ?? "").trim().toLowerCase() || null,
          parent_phone: String(r.parent_phone ?? "").trim() || null,
          is_active: true,
          last_imported_at: new Date().toISOString(),
          import_batch_id: batch_id,
        });
      }

      const incomingKeys = Array.from(new Set(enriched.map((r) => r.student_id)));
      const { data: existing } = await sb.from("students").select("student_id")
        .eq("workspace_id", workspace_id).in("student_id", incomingKeys);
      const existingSet = new Set<string>((existing ?? []).map((r: any) => String(r.student_id)));

      const CHUNK = 500;
      for (let i = 0; i < enriched.length; i += CHUNK) {
        const slice = enriched.slice(i, i + CHUNK);
        const { error } = await sb.from("students").upsert(slice, { onConflict: "workspace_id,student_id" });
        if (error) { failed += slice.length; errors.push({ row: i + 1, error: error.message }); }
      }
      inserted = incomingKeys.filter((k) => !existingSet.has(k)).length;
      updated = incomingKeys.length - inserted - failed;

      // Deactivate students in covered classes that are no longer in the sheet
      const affectedClasses = Array.from(new Set(enriched.map((r) => r.class).filter(Boolean)));
      if (affectedClasses.length) {
        const { data: stale } = await sb.from("students")
          .select("id, student_id")
          .eq("workspace_id", workspace_id)
          .eq("is_active", true)
          .in("class", affectedClasses);
        const incomingSet = new Set(incomingKeys);
        const staleIds = (stale ?? [])
          .filter((r: any) => r.student_id && !incomingSet.has(String(r.student_id)))
          .map((r: any) => r.id);
        if (staleIds.length) {
          const { error } = await sb.from("students").update({ is_active: false }).in("id", staleIds);
          if (!error) deactivated = staleIds.length;
        }
      }
    }
    // ───── ATTENDANCE / TESTS / FEES (row-by-row, no reconciliation needed) ─────
    else if (entity === "attendance") {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        try {
          const { data: stu } = await sb.from("students").select("id, class_id")
            .eq("workspace_id", workspace_id)
            .eq("student_id", String(r.student_id ?? "").trim()).maybeSingle();
          if (!stu) throw new Error(`Unknown student_id ${r.student_id}`);
          const { error } = await sb.from("attendance_records").upsert({
            workspace_id, student_id: stu.id, class_id: stu.class_id,
            date: r.date ?? new Date().toISOString().slice(0, 10),
            status: String(r.status ?? "present").toLowerCase(),
          }, { onConflict: "student_id,date" });
          if (error) throw error;
          inserted++;
        } catch (e: any) { failed++; errors.push({ row: i + 1, error: e.message ?? String(e) }); }
      }
    }
    else if (entity === "tests") {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        try {
          const classId = await resolveClassId(r.class, r.section);
          const { error } = await sb.from("tests").insert({
            workspace_id, class_id: classId,
            title: String(r.title ?? "").trim(),
            subject: String(r.subject ?? "").trim() || null,
            total_marks: Number(r.total_marks ?? 100),
          });
          if (error) throw error;
          inserted++;
        } catch (e: any) { failed++; errors.push({ row: i + 1, error: e.message ?? String(e) }); }
      }
    }
    else if (entity === "fees") {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        try {
          const { data: stu } = await sb.from("students").select("id")
            .eq("workspace_id", workspace_id)
            .eq("student_id", String(r.student_id ?? "").trim()).maybeSingle();
          if (!stu) throw new Error(`Unknown student_id ${r.student_id}`);
          const total = Number(r.total_amount ?? 0);
          const paid = Number(r.paid_amount ?? 0);
          const { error } = await sb.from("fee_records").insert({
            workspace_id, student_id: stu.id,
            total_amount: total, paid_amount: paid, due_amount: Math.max(total - paid, 0),
            due_date: r.due_date || null,
            payment_status: paid >= total ? "paid" : paid > 0 ? "partial" : "pending",
          });
          if (error) throw error;
          inserted++;
        } catch (e: any) { failed++; errors.push({ row: i + 1, error: e.message ?? String(e) }); }
      }
    }
    else {
      return jsonResponse({ error: `Unsupported entity ${entity}` }, 400);
    }

    // Roll up totals onto batch row
    if (batch_id) {
      await sb.from("import_batches").update({
        created_rows: inserted,
        updated_rows: updated,
        deactivated_rows: deactivated,
        skipped_rows: skipped,
        failed_rows: failed,
        status: failed ? "partial" : "completed",
        errors: errors.length ? errors.slice(0, 50) : null,
      }).eq("id", batch_id);
    }

    // Post-import verification: real DB count per workspace for this entity.
    let db_total: number | null = null;
    try {
      const tableMap: Record<string, string> = { teachers: "teachers", students: "students" };
      const t = tableMap[entity];
      if (t) {
        const { count } = await sb.from(t).select("id", { count: "exact", head: true }).eq("workspace_id", workspace_id);
        db_total = count ?? 0;
      }
    } catch (_e) { /* best-effort */ }

    return jsonResponse({
      batch_id, inserted, updated, deactivated, skipped, failed, db_total,
      errors: errors.slice(0, 50),
    });
  } catch (e) {
    return jsonResponse({ error: safeErrorMessage(e) }, 500);
  }
});
