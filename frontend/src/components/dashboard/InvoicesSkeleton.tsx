import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function InvoicesSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56 mt-2" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

      {/* Search + filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Skeleton className="h-10 flex-1 rounded-md" />
        <Skeleton className="h-10 w-[160px] rounded-md" />
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <div className="p-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20 ml-auto" />
              <Skeleton className="h-4 w-16 hidden md:block" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-4 w-24 hidden lg:block" />
              <Skeleton className="h-8 w-8 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
