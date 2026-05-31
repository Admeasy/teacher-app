"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Bus, Phone, MapPin, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTeacherSession } from "@/teacher/hooks/useTeacherSession";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";

export default function TeacherTransport() {
  const { teacher } = useTeacherSession();
  const [loading, setLoading] = useState(true);
  const [routes, setRoutes] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!teacher?.workspace_id) return;
    (async () => {
      setLoading(true);
      const [r, v, s] = await Promise.all([
        supabase.from("transport_routes").select("*").eq("workspace_id", teacher.workspace_id).eq("active", true),
        supabase.from("transport_vehicles").select("*").eq("workspace_id", teacher.workspace_id),
        supabase.from("non_teaching_staff").select("*").eq("workspace_id", teacher.workspace_id).eq("active", true),
      ]);
      setRoutes((r.data ?? []) as any);
      setVehicles((v.data ?? []) as any);
      setStaff((s.data ?? []) as any);
      setLoading(false);
    })();
  }, [teacher?.workspace_id]);

  const filteredRoutes = useMemo(() =>
    routes.filter(r => !filter || r.route_name?.toLowerCase().includes(filter.toLowerCase())),
    [routes, filter]);

  if (loading) return <div className="p-6"><Skeleton className="h-64" /></div>;

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-[1200px] mx-auto">
      <motion.header initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl gradient-violet grid place-items-center glow-violet"><Bus className="w-5 h-5 text-white" /></div>
        <div>
          <h1 className="text-xl font-semibold">Transport Directory</h1>
          <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest">Routes · Drivers · Contacts</p>
        </div>
        <div className="ml-auto relative w-56">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input className="pl-8 h-9" placeholder="Search route…" value={filter} onChange={e => setFilter(e.target.value)} />
        </div>
      </motion.header>

      <div className="grid md:grid-cols-2 gap-3">
        {filteredRoutes.map(r => {
          const v = vehicles.find(x => x.id === r.vehicle_id);
          const drv = staff.find(s => s.id === v?.assigned_driver_id);
          const con = staff.find(s => s.id === v?.assigned_conductor_id);
          const mgr = staff.find(s => s.id === r.transport_manager_id);
          return (
            <Card key={r.id} className="glass p-4 border-border/40">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{r.route_name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><MapPin className="w-3 h-3" />{r.start_location ?? "—"} → {r.end_location ?? "—"}</div>
                </div>
                <Badge variant="outline">{v?.vehicle_number ?? "no vehicle"}</Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                {[{ label: "Driver", s: drv }, { label: "Conductor", s: con }, { label: "Manager", s: mgr }].map(({ label, s }) => (
                  <div key={label} className="border border-border/30 rounded-lg p-2">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">{label}</div>
                    <div className="text-xs font-medium mt-0.5 truncate">{s?.name ?? "—"}</div>
                    {s?.phone && <a href={`tel:${s.phone}`} className="text-[11px] text-violet-glow font-mono flex items-center gap-1 mt-0.5"><Phone className="w-2.5 h-2.5" />{s.phone}</a>}
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
        {filteredRoutes.length === 0 && (
          <Card className="glass p-10 border-border/40 text-center md:col-span-2">
            <p className="text-sm text-muted-foreground">No routes configured.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
