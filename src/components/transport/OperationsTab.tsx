import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Copy, CheckCircle2, XCircle, MapPin, Gauge, Bus, Loader2, FileDown } from "lucide-react";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────
// Bulk CSV: student transport assignments
//   columns expected: student_id_or_admission, route_code, stop_name, pickup_type, monthly_fee
// ─────────────────────────────────────────────────────────────────────────
function BulkAssignImport({ workspaceId }: { workspaceId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ ok: number; fail: number; errors: string[] } | null>(null);

  const parseCsv = (text: string): Record<string, string>[] => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    return lines.slice(1).map((line) => {
      const cells = line.split(",").map((c) => c.trim());
      return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
    });
  };

  const handleUpload = async (file: File) => {
    setBusy(true); setReport(null);
    try {
      const rows = parseCsv(await file.text());
      const errors: string[] = [];
      let ok = 0;

      const [{ data: students }, { data: routes }, { data: stops }, { data: vehicles }] = await Promise.all([
        supabase.from("students").select("id,student_id,name").eq("workspace_id", workspaceId),
        supabase.from("transport_routes").select("id,route_code,route_name,vehicle_id").eq("workspace_id", workspaceId),
        supabase.from("transport_route_stops").select("id,route_id,stop_name").eq("workspace_id", workspaceId),
        supabase.from("transport_vehicles").select("id,route_id").eq("workspace_id", workspaceId),
      ]);

      for (const [idx, r] of rows.entries()) {
        const sIdent = r.student_id_or_admission || r.student_id || r.admission;
        const student = (students ?? []).find((s: any) => s.student_id === sIdent || s.id === sIdent);
        if (!student) { errors.push(`Row ${idx + 2}: student "${sIdent}" not found`); continue; }
        const route = (routes ?? []).find((rt: any) => rt.route_code === r.route_code || rt.route_name === r.route_code);
        if (!route) { errors.push(`Row ${idx + 2}: route "${r.route_code}" not found`); continue; }
        const stop = (stops ?? []).find((st: any) => st.route_id === route.id && st.stop_name.toLowerCase() === (r.stop_name ?? "").toLowerCase());
        const vehicle = (vehicles ?? []).find((v: any) => v.route_id === route.id) ?? { id: route.vehicle_id };
        const payload = {
          workspace_id: workspaceId,
          student_id: student.id,
          route_id: route.id,
          stop_id: stop?.id ?? null,
          vehicle_id: vehicle?.id ?? null,
          pickup_type: r.pickup_type || "both",
          monthly_transport_fee: r.monthly_fee ? Number(r.monthly_fee) : null,
          active: true,
        };
        const { error } = await supabase
          .from("transport_assignments")
          .upsert(payload, { onConflict: "workspace_id,student_id" });
        if (error) errors.push(`Row ${idx + 2}: ${error.message}`); else ok++;
      }
      setReport({ ok, fail: errors.length, errors: errors.slice(0, 20) });
      toast.success(`Imported ${ok} assignments${errors.length ? `, ${errors.length} failed` : ""}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Import failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const sampleCsv = `student_id_or_admission,route_code,stop_name,pickup_type,monthly_fee
ADM001,R-01,Main Gate,both,1500
ADM002,R-02,City Mall,pickup,1200`;

  return (
    <Card className="glass p-5 border-border/40 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><Upload className="w-4 h-4 text-violet-glow" />Bulk assign students to transport</h3>
          <p className="text-xs text-muted-foreground mt-1">CSV columns: <code className="font-mono text-[11px]">student_id_or_admission, route_code, stop_name, pickup_type, monthly_fee</code></p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            const blob = new Blob([sampleCsv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = "transport_assignments_sample.csv"; a.click();
            URL.revokeObjectURL(url);
          }}><FileDown className="w-3.5 h-3.5 mr-1.5" />Sample CSV</Button>
          <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
            Upload CSV
          </Button>
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
        </div>
      </div>
      {report && (
        <div className="border border-border/40 rounded-lg p-3 space-y-2">
          <div className="flex gap-3 text-sm">
            <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />{report.ok} imported</span>
            {report.fail > 0 && <span className="text-rose-400 flex items-center gap-1"><XCircle className="w-4 h-4" />{report.fail} failed</span>}
          </div>
          {report.errors.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-0.5 max-h-40 overflow-auto font-mono">
              {report.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Route cloning
// ─────────────────────────────────────────────────────────────────────────
function RouteClone({ workspaceId }: { workspaceId: string }) {
  const [routes, setRoutes] = useState<any[]>([]);
  const [sourceId, setSourceId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("transport_routes").select("id,route_name,route_code").eq("workspace_id", workspaceId).then(({ data }) => setRoutes(data ?? []));
  }, [workspaceId]);

  const clone = async () => {
    if (!sourceId || !newName) { toast.error("Pick a source route and enter a new name"); return; }
    setBusy(true);
    try {
      const { data: src } = await supabase.from("transport_routes").select("*").eq("id", sourceId).single();
      if (!src) throw new Error("Source route missing");
      const { id, created_at, updated_at, route_name, route_code, ...rest } = src as any;
      const { data: newRoute, error } = await supabase
        .from("transport_routes")
        .insert({ ...rest, route_name: newName, route_code: route_code ? `${route_code}-COPY` : null })
        .select().single();
      if (error) throw error;
      const { data: stops } = await supabase.from("transport_route_stops").select("*").eq("route_id", sourceId);
      if (stops?.length) {
        const cloned = stops.map(({ id, created_at, updated_at, route_id, ...s }: any) => ({ ...s, route_id: newRoute.id }));
        const { error: se } = await supabase.from("transport_route_stops").insert(cloned);
        if (se) throw se;
      }
      toast.success(`Cloned route as "${newName}" with ${stops?.length ?? 0} stops`);
      setNewName(""); setSourceId("");
      const { data } = await supabase.from("transport_routes").select("id,route_name,route_code").eq("workspace_id", workspaceId);
      setRoutes(data ?? []);
    } catch (e: any) { toast.error(e?.message ?? "Clone failed"); }
    finally { setBusy(false); }
  };

  return (
    <Card className="glass p-5 border-border/40 space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2"><Copy className="w-4 h-4 text-violet-glow" />Clone a route</h3>
      <div className="grid sm:grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">Source route</Label>
          <Select value={sourceId} onValueChange={setSourceId}>
            <SelectTrigger><SelectValue placeholder="Select route…" /></SelectTrigger>
            <SelectContent>
              {routes.map((r) => <SelectItem key={r.id} value={r.id}>{r.route_name}{r.route_code ? ` (${r.route_code})` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">New route name</Label>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. R-01 Evening" />
        </div>
        <div className="flex items-end">
          <Button disabled={busy} onClick={clone} className="w-full">
            {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}Clone
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">Copies route metadata + all stops. Assign a vehicle and staff afterwards.</p>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Boarding attendance log
// ─────────────────────────────────────────────────────────────────────────
function BoardingLog({ workspaceId }: { workspaceId: string }) {
  const [routes, setRoutes] = useState<any[]>([]);
  const [routeId, setRouteId] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("transport_routes").select("id,route_name").eq("workspace_id", workspaceId).eq("active", true).then(({ data }) => setRoutes(data ?? []));
  }, [workspaceId]);

  useEffect(() => {
    if (!routeId) { setRows([]); return; }
    (async () => {
      setLoading(true);
      const { data: assigns } = await supabase
        .from("transport_assignments")
        .select("id,student_id,vehicle_id,stop_id")
        .eq("workspace_id", workspaceId).eq("route_id", routeId).eq("active", true);
      const ids = (assigns ?? []).map((a: any) => a.student_id);
      const [{ data: students }, { data: att }, { data: stops }] = await Promise.all([
        ids.length ? supabase.from("students").select("id,name,class,section").in("id", ids) : Promise.resolve({ data: [] }),
        supabase.from("transport_attendance").select("*").eq("workspace_id", workspaceId).eq("date", date),
        supabase.from("transport_route_stops").select("id,stop_name").eq("route_id", routeId),
      ]);
      const stopMap = new Map((stops ?? []).map((s: any) => [s.id, s.stop_name]));
      const attMap = new Map((att ?? []).map((a: any) => [a.assignment_id, a]));
      setRows((assigns ?? []).map((a: any) => {
        const stu = (students ?? []).find((s: any) => s.id === a.student_id);
        return {
          assignment_id: a.id, student_id: a.student_id, vehicle_id: a.vehicle_id,
          name: stu?.name ?? "—", klass: `${stu?.class ?? ""}${stu?.section ? "-" + stu.section : ""}`,
          stop: stopMap.get(a.stop_id) ?? "—",
          status: attMap.get(a.id)?.status ?? "unmarked",
          existingId: attMap.get(a.id)?.id ?? null,
        };
      }));
      setLoading(false);
    })();
  }, [routeId, date, workspaceId]);

  const mark = async (row: any, status: "boarded" | "absent" | "alighted") => {
    const now = new Date().toISOString();
    const payload: any = {
      workspace_id: workspaceId, assignment_id: row.assignment_id, student_id: row.student_id,
      vehicle_id: row.vehicle_id, date, status,
      ...(status === "boarded" ? { boarded_at: now } : {}),
      ...(status === "alighted" ? { alighted_at: now } : {}),
    };
    const { error } = row.existingId
      ? await supabase.from("transport_attendance").update(payload).eq("id", row.existingId)
      : await supabase.from("transport_attendance").insert(payload);
    if (error) { toast.error(error.message); return; }
    setRows((rs) => rs.map((r) => r.assignment_id === row.assignment_id ? { ...r, status } : r));
  };

  return (
    <Card className="glass p-5 border-border/40 space-y-3">
      <div className="flex items-end gap-2 flex-wrap">
        <div className="min-w-[200px]">
          <Label className="text-xs">Route</Label>
          <Select value={routeId} onValueChange={setRouteId}>
            <SelectTrigger><SelectValue placeholder="Select route…" /></SelectTrigger>
            <SelectContent>{routes.map((r) => <SelectItem key={r.id} value={r.id}>{r.route_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="ml-auto text-xs text-muted-foreground">{rows.length} students on route</div>
      </div>
      {loading ? <Skeleton className="h-40" /> : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Select a route to mark boarding.</p>
      ) : (
        <div className="border border-border/40 rounded-lg overflow-hidden">
          <Table>
            <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Class</TableHead><TableHead>Stop</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.assignment_id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.klass || "—"}</TableCell>
                  <TableCell className="text-xs">{r.stop}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      r.status === "boarded" ? "text-emerald-400 border-emerald-400/40" :
                      r.status === "absent" ? "text-rose-400 border-rose-400/40" :
                      r.status === "alighted" ? "text-sky-400 border-sky-400/40" : ""
                    }>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => mark(r, "boarded")}>Board</Button>
                      <Button size="sm" variant="ghost" onClick={() => mark(r, "alighted")}>Alight</Button>
                      <Button size="sm" variant="ghost" onClick={() => mark(r, "absent")}>Absent</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// GPS tracking (latest known positions per vehicle)
// ─────────────────────────────────────────────────────────────────────────
function GpsTracking({ workspaceId }: { workspaceId: string }) {
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [latest, setLatest] = useState<Record<string, any>>({});

  const load = async () => {
    setLoading(true);
    const { data: vs } = await supabase.from("transport_vehicles").select("id,vehicle_number,gps_enabled,assigned_driver_id").eq("workspace_id", workspaceId);
    setVehicles(vs ?? []);
    const { data: logs } = await supabase
      .from("vehicle_tracking_logs").select("*").eq("workspace_id", workspaceId)
      .order("recorded_at", { ascending: false }).limit(500);
    const map: Record<string, any> = {};
    (logs ?? []).forEach((l: any) => { if (!map[l.vehicle_id]) map[l.vehicle_id] = l; });
    setLatest(map);
    setLoading(false);
  };

  useEffect(() => { load(); }, [workspaceId]);

  const fresh = (ts: string) => (Date.now() - new Date(ts).getTime()) < 5 * 60 * 1000;

  return (
    <Card className="glass p-5 border-border/40 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2"><MapPin className="w-4 h-4 text-violet-glow" />Live fleet positions</h3>
        <Button size="sm" variant="outline" onClick={load}>Refresh</Button>
      </div>
      {loading ? <Skeleton className="h-40" /> : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {vehicles.map((v) => {
            const log = latest[v.id];
            return (
              <div key={v.id} className="border border-border/40 rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm flex items-center gap-1.5"><Bus className="w-3.5 h-3.5 text-violet-glow" />{v.vehicle_number}</span>
                  <Badge variant="outline" className={
                    !v.gps_enabled ? "" :
                    !log ? "text-muted-foreground" :
                    fresh(log.recorded_at) ? "text-emerald-400 border-emerald-400/40" : "text-amber-400 border-amber-400/40"
                  }>
                    {!v.gps_enabled ? "no-gps" : !log ? "offline" : fresh(log.recorded_at) ? "live" : "stale"}
                  </Badge>
                </div>
                {log ? (
                  <>
                    <div className="text-xs text-muted-foreground font-mono">{log.latitude.toFixed(5)}, {log.longitude.toFixed(5)}</div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1 text-muted-foreground"><Gauge className="w-3 h-3" />{log.speed_kmph ?? "—"} km/h</span>
                      <span className="text-muted-foreground font-mono">{new Date(log.recorded_at).toLocaleTimeString()}</span>
                    </div>
                    <a className="text-[11px] text-violet-glow font-mono" target="_blank" rel="noreferrer"
                       href={`https://www.google.com/maps?q=${log.latitude},${log.longitude}`}>Open in Maps ↗</a>
                  </>
                ) : <p className="text-xs text-muted-foreground">No telemetry yet.</p>}
              </div>
            );
          })}
          {vehicles.length === 0 && <p className="text-sm text-muted-foreground col-span-full text-center py-6">No vehicles configured.</p>}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">GPS points stream into <code className="font-mono">vehicle_tracking_logs</code>. Wire your GPS device webhook to insert rows there.</p>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
export default function OperationsTab({ workspaceId }: { workspaceId: string }) {
  return (
    <Tabs defaultValue="import" className="space-y-3">
      <TabsList>
        <TabsTrigger value="import">Bulk Import</TabsTrigger>
        <TabsTrigger value="clone">Route Cloning</TabsTrigger>
        <TabsTrigger value="boarding">Boarding Log</TabsTrigger>
        <TabsTrigger value="gps">GPS Tracking</TabsTrigger>
      </TabsList>
      <TabsContent value="import"><BulkAssignImport workspaceId={workspaceId} /></TabsContent>
      <TabsContent value="clone"><RouteClone workspaceId={workspaceId} /></TabsContent>
      <TabsContent value="boarding"><BoardingLog workspaceId={workspaceId} /></TabsContent>
      <TabsContent value="gps"><GpsTracking workspaceId={workspaceId} /></TabsContent>
    </Tabs>
  );
}
