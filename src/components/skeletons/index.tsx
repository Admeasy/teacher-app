import { Skeleton } from "@/components/ui/skeleton";

/**
 * Global skeleton system. All skeletons use the design-token `bg-muted`
 * shimmer via `Skeleton`. Mobile-first, no fixed widths in vh.
 */

export function CardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-xl border border-border/40 p-4 space-y-3 ${className}`}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-2 w-full" />
    </div>
  );
}

export function ChartSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-xl border border-border/40 p-4 space-y-3 ${className}`}>
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-border/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-border/40">
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="divide-y divide-border/30">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-3 flex-1 max-w-[40%]" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-20 hidden sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-border/30 p-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-2 w-1/2" />
          </div>
          <Skeleton className="h-6 w-14 rounded-md" />
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-64 max-w-full" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartSkeleton className="lg:col-span-2" />
        <div className="space-y-3"><CardSkeleton /><CardSkeleton /></div>
      </div>
      <TableSkeleton />
    </div>
  );
}

export function AttendanceSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
      </div>
      <ListSkeleton rows={10} />
    </div>
  );
}

export function AnalyticsSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <Skeleton className="h-6 w-48" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartSkeleton /><ChartSkeleton />
      </div>
      <TableSkeleton rows={8} />
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl">
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      <CardSkeleton /><CardSkeleton /><CardSkeleton />
    </div>
  );
}

export function AIWorkspaceSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-3">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
      </div>
      <ListSkeleton rows={4} />
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-3">
      <Skeleton className="h-6 w-40" />
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}

/** Generic full-route fallback used by Suspense boundaries. */
export function RouteSkeleton() {
  return <DashboardSkeleton />;
}
