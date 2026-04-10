import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function RefundsSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-label="Loading refunds">
      <span className="sr-only">Loading refunds…</span>
      <div>
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-56 mt-2" />
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-5 rounded" />
              </div>
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + sort */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Skeleton className="h-10 flex-1 rounded-md" />
        <Skeleton className="h-10 w-40 rounded-md" />
      </div>

      {/* Table */}
      <div className="rounded-lg border p-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-32 hidden sm:block" />
            <Skeleton className="h-4 w-28 hidden md:block" />
            <Skeleton className="h-4 w-20 hidden lg:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
