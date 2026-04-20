import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useNotificationLogStore, type NotifEventKey } from "@/stores/notification-log-store";
import { History, RefreshCw, XCircle, AlertTriangle, UserPlus, PauseCircle } from "lucide-react";

const eventConfig: Record<NotifEventKey, { icon: React.ElementType; color: string }> = {
  renewal: { icon: RefreshCw, color: "text-success" },
  cancellation: { icon: XCircle, color: "text-destructive" },
  failedPayment: { icon: AlertTriangle, color: "text-warning" },
  newSubscriber: { icon: UserPlus, color: "text-info" },
  pauseResume: { icon: PauseCircle, color: "text-warning" },
};

export default function NotificationHistory() {
  const { logs, clearLogs } = useNotificationLogStore();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-heading-sm flex items-center gap-2">
            <History className="h-5 w-5" /> Notification History
          </CardTitle>
          <CardDescription>Recent notification events delivered to your configured channels.</CardDescription>
        </div>
        {logs.length > 0 && (
          <Button variant="outline" size="sm" onClick={clearLogs}>
            Clear History
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No notifications triggered yet. Actions like renewals or cancellations will appear here.
          </p>
        ) : (
          <ScrollArea className="max-h-72">
            <div className="flex flex-col gap-1">
              {logs.map((entry, i) => {
                const cfg = eventConfig[entry.eventType];
                const Icon = cfg.icon;
                return (
                  <div key={entry.id}>
                    {i > 0 && <Separator className="my-1" />}
                    <div className="flex items-center gap-3 py-1.5">
                      <Icon className={`h-4 w-4 shrink-0 ${cfg.color}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{entry.label}</p>
                        <p className="text-caption text-muted-foreground">
                          {formatDistanceToNow(entry.timestamp, { addSuffix: true })}
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {entry.channel}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
