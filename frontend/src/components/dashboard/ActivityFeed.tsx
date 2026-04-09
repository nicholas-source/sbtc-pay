import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDownLeft, FileText, RefreshCcw, Repeat } from "lucide-react";
import { formatDistanceToNow, subMinutes, subHours, subDays } from "date-fns";
import { formatSbtc } from "@/lib/constants";

interface ActivityEvent {
  id: string;
  type: "payment" | "invoice" | "refund" | "subscription";
  title: string;
  amount: number;
  address: string;
  timestamp: Date;
}

const iconMap = {
  payment: ArrowDownLeft,
  invoice: FileText,
  refund: RefreshCcw,
  subscription: Repeat,
};

const colorMap = {
  payment: "text-success",
  invoice: "text-primary",
  refund: "text-destructive",
  subscription: "text-info",
};

const bgMap = {
  payment: "bg-success/20",
  invoice: "bg-primary/20",
  refund: "bg-destructive/20",
  subscription: "bg-info/20",
};

const now = new Date();

const events: ActivityEvent[] = [
  { id: "1", type: "payment", title: "Payment Received", amount: 125000, address: "SP2J6Z...9EJ7", timestamp: subMinutes(now, 2) },
  { id: "2", type: "invoice", title: "Invoice Created", amount: 500000, address: "SP3KBR...4FD2", timestamp: subMinutes(now, 18) },
  { id: "3", type: "subscription", title: "Subscription Renewed", amount: 50000, address: "SP1QR5...8HK3", timestamp: subHours(now, 1) },
  { id: "4", type: "payment", title: "Payment Received", amount: 250000, address: "SP4VN8...2LM9", timestamp: subHours(now, 3) },
  { id: "5", type: "refund", title: "Refund Issued", amount: 75000, address: "SP2J6Z...9EJ7", timestamp: subHours(now, 5) },
  { id: "6", type: "payment", title: "Payment Received", amount: 180000, address: "SP8WX3...7YZ1", timestamp: subDays(now, 1) },
  { id: "7", type: "invoice", title: "Invoice Created", amount: 1000000, address: "SP6TM2...5NP4", timestamp: subDays(now, 1) },
  { id: "8", type: "subscription", title: "Subscription Renewed", amount: 50000, address: "SP9AB4...3CD6", timestamp: subDays(now, 2) },
  { id: "9", type: "payment", title: "Payment Received", amount: 320000, address: "SP7EF1...6GH8", timestamp: subDays(now, 3) },
  { id: "10", type: "refund", title: "Refund Issued", amount: 45000, address: "SP5IJ9...1KL0", timestamp: subDays(now, 4) },
];

export default function ActivityFeed() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-heading-sm">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative" aria-live="polite">
          {/* Timeline line */}
          <div className="absolute left-[15px] top-0 bottom-0 w-px bg-border" />

          <div className="space-y-1">
            {events.map((event, i) => {
              const Icon = iconMap[event.type];
              const stagger = i < 8 ? `stagger-${i + 1}` : "";
              return (
                <div
                  key={event.id}
                  className={`relative flex items-start gap-3 py-2 pl-1 animate-fade-slide-up ${stagger}`}
                >
                  {/* Dot */}
                  <div className={`relative z-10 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full ${bgMap[event.type]}`}>
                    <Icon className={`h-3.5 w-3.5 ${colorMap[event.type]}`} />
                  </div>

                  <div className="flex flex-1 items-center justify-between min-w-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{event.title}</p>
                      <p className="text-caption text-muted-foreground truncate">{event.address}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="font-mono-nums text-sm text-foreground">
                        {event.type === "refund" ? "-" : "+"}{formatSbtc(event.amount)}
                        <span className="text-muted-foreground ml-1 text-caption">sBTC</span>
                      </p>
                      <p className="text-caption text-muted-foreground">
                        {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
