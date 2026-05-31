import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Bus, ArrowDownToLine, ArrowUpFromLine, Search, Clock } from "lucide-react";

type Vehicle = { id: string; vehicle_number: string; route_id: string | null };
type Route = { id: string; route_name: string };
type Stop = { id: string; route_id: string; stop_name: string; stop_order: number };
type Student = { id: string; name: string | null; class: string | null; section: string | null };
type Teacher = { id: string; name: string; teacher_id: string | null };
type Staff = { id: string; name: string; role: string | null };

type Person =
  | { type: "student"; id: string; name: string; sub: string }
  | { type: "teacher"; id: string; name: string; sub: string }
  | { type: "staff"; id: string; name: string; sub: string };

type LogRow = {
  id: string;
  person_type: string;
  person_name: string | null;
  event_type: string;
  logged_at: string;
  vehicle_id: string | null;
  stop_id: string | null;
};

/**
 * BoardingLog
 * ───────────
 *  • Used by drivers / staff to record board / alight events.
 *  • Reads back today's events for the selected vehicle.
 *  • Other transport views (Students, Teachers) can render <BoardingLogReadonly />
 *    by passing personType + personId.
 */
export default function BoardingLog({ workspaceId }: { workspaceId: string }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [vehicleId, setVehicleId] = useState<string>("");
  const [stopId, setStopId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("student");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [v, r, st, s, t, n] = await Promise.all([
        supabase.from("transport_vehicles").select("id,vehicle_number,route_id").eq("workspace_id", workspaceId).order("vehicle_number"),
        supabase.from("transport_routes").select("id,route_name").eq("workspace_id", workspaceId).order("route_name"),
        supabase.from("transport_route_stops").select("id,route_id,stop_name,stop_order").eq("workspace_id", workspaceId).order("stop_order"),
        supabase.from("students").select("id,name,class,section").eq("workspace_id", workspaceId).eq("is_active", true).limit(2000),
        supabase.from("teachers").select("id,name,teacher_id").eq("workspace_id", workspaceId).limit(500),
        supabase.from("non_teaching_staff").select("id,name,role").eq("workspace_id", workspaceId).limit(500),
      ]);
      setVehicles((v.data ?? []) as Vehicle[]);
      setRoutes((r.data ?? []) as Route[]);
      setStops((st.data ?? []) as Stop[]);
      setStudents((s.data ?? []) as Student[]);
      setTeachers((t.data ?? []) as Teacher[]);
      setStaff((n.data ?? []) as Staff[]);
      if (v.data?.[0]?.id) setVehicleId(v.data[0].id);
      setLoading(false);
    })();
  }, [workspaceId]);

  const currentVehicle = vehicles.find((v) => v.id === vehicleId);
  const vehicleStops = stops.filter((s) => currentVehicle?.route_id && s.route_id === currentVehicle.route_id);

  useEffect(() => {
    if (!vehicleId) return setLogs([]);
    let cancel = false;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("transport_attendance")
        .select("id,person_type,person_name,event_type,logged_at,vehicle_id,stop_id")
        .eq("workspace_id", workspaceId)
        .eq("vehicle_id", vehicleId)
        .eq("date", today)
        .order("logged_at", { ascending: false })
        .limit(200);
      if (!cancel) setLogs((data ?? []) as LogRow[]);
    })();
    return () => { cancel = true; };
  }, [workspaceId, vehicleId, loading]);

  const people: Person[] = useMemo(() => {
    if (tab === "student")
      return students.map((s) => ({
        type: "student",
        id: s.id,
        name: s.name ?? "Unnamed",
        sub: [s.class, s.section].filter(Boolean).join("-") || "—",
      }));
    if (tab === "teacher")
      return teachers.map((t) => ({ type: "teacher", id: t.id, name: t.name, sub: t.teacher_id ?? "Teacher" }));
    return staff.map((n) => ({ type: "staff", id: n.id, name: n.name, sub: n.role ?? "Staff" }));
  }, [tab, students, teachers, staff]);

  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people.slice(0, 60);
    return people.filter((p) => p.name.toLowerCase().includes(q) || p.sub.toLowerCase().includes(q)).slice(0, 60);
  }, [people, search]);

  async function log(person: Person, eventType: "board" | "alight") {
    if (!vehicleId) {
      toast.error("Select a vehicle first");
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const payload: any = {
      workspace_id: workspaceId,
      vehicle_id: vehicleId,
      stop_id: stopId || null,
      route_id: currentVehicle?.route_id ?? null,
      person_type: person.type,
      person_name: person.name,
      event_type: eventType,
      date: today,
      [eventType === "board" ? "boarded_at" : "alighted_at"]: new Date().toISOString(),
      status: eventType === "board" ? "present" : "alighted",
    };
    if (person.type === "student") payload.student_id = person.id;
    else if (person.type === "teacher") payload.teacher_id = person.id;
    else payload.staff_id = person.id;

    // For student we still need an assignment_id reference (nullable now after migration)
    const { data: inserted, error } = await supabase
      .from("transport_attendance")
      .insert(payload)
      .select("id,person_type,person_name,event_type,logged_at,vehicle_id,stop_id")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${eventType === "board" ? "Boarded" : "Alighted"}: ${person.name}`);
    if (inserted) setLogs((prev) => [inserted as LogRow, ...prev]);
  }

  if (loading) return <Skeleton className="h-72" />;

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card className="glass p-4 border-border/40 lg:col-span-2 space-y-3">
        <div className="flex items-center gap-2">
          <Bus className="w-4 h-4 text-violet-glow" />
          <h3 className="text-sm font-semibold">Boarding Log</h3>
          <Badge variant="outline" className="ml-auto">{logs.length} today</Badge>
        </div>

        <div className="grid sm:grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Vehicle</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => {
                  const r = routes.find((x) => x.id === v.route_id);
                  return <SelectItem key={v.id} value={v.id}>{v.vehicle_number}{r ? ` · ${r.route_name}` : ""}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Current Stop (optional)</Label>
            <Select value={stopId} onValueChange={setStopId}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {vehicleStops.map((s) => <SelectItem key={s.id} value={s.id}>{s.stop_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="glass border border-border/40">
            <TabsTrigger value="student">Students</TabsTrigger>
            <TabsTrigger value="teacher">Teachers</TabsTrigger>
            <TabsTrigger value="staff">Staff</TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="mt-3 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Search by name or class…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <div className="max-h-80 overflow-auto divide-y divide-border/40 border border-border/40 rounded">
              {filteredPeople.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">No matches</div>
              ) : (
                filteredPeople.map((p) => (
                  <motion.div
                    key={`${p.type}-${p.id}`}
                    initial={{ opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-surface-2/50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono uppercase">{p.sub}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => log(p, "board")}>
                      <ArrowUpFromLine className="w-3 h-3 mr-1" /> Board
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => log(p, "alight")}>
                      <ArrowDownToLine className="w-3 h-3 mr-1" /> Alight
                    </Button>
                  </motion.div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </Card>

      <Card className="glass p-4 border-border/40">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-violet-glow" />
          <h3 className="text-sm font-semibold">Today's Events</h3>
        </div>
        {logs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No boarding events yet.</p>
        ) : (
          <div className="space-y-1.5 max-h-[28rem] overflow-auto">
            {logs.map((l) => (
              <div key={l.id} className="text-xs border-b border-border/30 pb-1.5">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={l.event_type === "board"
                      ? "border-emerald-500/40 text-emerald-500"
                      : "border-amber-500/40 text-amber-500"}
                  >
                    {l.event_type}
                  </Badge>
                  <span className="font-medium">{l.person_name ?? "—"}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto font-mono">
                    {new Date(l.logged_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground font-mono uppercase">{l.person_type}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/** Compact read-only view for student / teacher profile pages. */
export function BoardingLogReadonly({
  workspaceId,
  personType,
  personId,
  limit = 10,
}: {
  workspaceId: string;
  personType: "student" | "teacher" | "staff";
  personId: string;
  limit?: number;
}) {
  const [rows, setRows] = useState<LogRow[]>([]);
  useEffect(() => {
    let cancel = false;
    (async () => {
      const col = personType === "student" ? "student_id" : personType === "teacher" ? "teacher_id" : "staff_id";
      const q: any = supabase
        .from("transport_attendance")
        .select("id,person_type,person_name,event_type,logged_at,vehicle_id,stop_id")
        .eq("workspace_id", workspaceId);
      const { data } = await q.eq(col, personId).order("logged_at", { ascending: false }).limit(limit);
      if (!cancel) setRows((data ?? []) as LogRow[]);
    })();
    return () => { cancel = true; };
  }, [workspaceId, personType, personId, limit]);

  if (!rows.length) return <p className="text-xs text-muted-foreground">No boarding events recorded.</p>;
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-2 text-xs border-b border-border/30 pb-1">
          <Badge variant="outline" className={r.event_type === "board" ? "border-emerald-500/40 text-emerald-500" : "border-amber-500/40 text-amber-500"}>{r.event_type}</Badge>
          <span className="text-muted-foreground ml-auto font-mono">{new Date(r.logged_at).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
