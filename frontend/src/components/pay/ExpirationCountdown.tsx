import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  expiresAt: Date;
  onExpired?: () => void;
}

function getTimeLeft(expiresAt: Date) {
  const diff = expiresAt.getTime() - Date.now();
  if (diff <= 0) return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };

  return {
    expired: false,
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
    total: diff,
  };
}

export function ExpirationCountdown({ expiresAt, onExpired }: Props) {
  const [time, setTime] = useState(() => getTimeLeft(expiresAt));

  useEffect(() => {
    const interval = setInterval(() => {
      const t = getTimeLeft(expiresAt);
      setTime(t);
      if (t.expired) {
        clearInterval(interval);
        onExpired?.();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpired]);

  if (time.expired) {
    return (
      <div className="flex items-center gap-2 text-destructive" role="timer" aria-live="polite">
        <Clock className="h-4 w-4" />
        <span className="text-body-sm font-medium">Expired</span>
      </div>
    );
  }

  const isUrgent = time.total < 600000; // < 10 min
  const isWarning = time.total < 3600000; // < 1 hour

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div
      role="timer"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 text-body-sm",
        isUrgent
          ? "text-destructive"
          : isWarning
          ? "text-warning"
          : "text-muted-foreground"
      )}
    >
      <Clock className="h-4 w-4" />
      <span className="font-mono-nums font-medium">
        {time.days > 0 && `${time.days}d `}
        {pad(time.hours)}h {pad(time.minutes)}m {pad(time.seconds)}s
      </span>
    </div>
  );
}
