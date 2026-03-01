import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function SettingsSkeleton() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-48 mt-2" />
      </div>

      {/* Profile header */}
      <Card>
        <CardContent className="flex items-center gap-4 pt-6">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-3 w-48" />
          </div>
        </CardContent>
      </Card>

      {/* Form fields */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          ))}
          <Skeleton className="h-9 w-28 rounded-md" />
        </CardContent>
      </Card>

      {/* Notification toggles */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
          <Separator />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-5 w-9 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
