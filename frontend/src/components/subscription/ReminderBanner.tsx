import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { differenceInDays } from "date-fns";
import { useSubscriptionStore } from "@/stores/subscription-store";

export default function ReminderBanner() {
  const subscribers = useSubscriptionStore((s) => s.subscribers);

  const dueSubs = useMemo(() => {
    const now = new Date();
    return subscribers.filter(
      (s) => s.status === "active" && differenceInDays(s.nextPaymentAt, now) <= 3
    );
  }, [subscribers]);

  if (dueSubs.length === 0) return null;

  return (
    <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 flex items-center gap-3">
      <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
      <div>
        <p className="text-body-sm font-medium text-foreground">
          {dueSubs.length} subscription{dueSubs.length > 1 ? "s" : ""} due soon
        </p>
        <p className="text-caption text-muted-foreground">
          Payment will be processed within the next 3 days.
        </p>
      </div>
    </div>
  );
}
