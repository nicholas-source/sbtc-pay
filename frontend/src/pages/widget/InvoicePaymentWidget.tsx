import { useParams } from "react-router-dom";
import { Bitcoin, AlertTriangle, Wallet } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useInvoiceStore } from "@/stores/invoice-store";
import { ExpirationCountdown } from "@/components/pay/ExpirationCountdown";
import { toast } from "sonner";
import { PageTransition } from "@/components/layout/PageTransition";

function formatSats(sats: number) {
  return sats.toLocaleString();
}

export default function InvoicePaymentWidget() {
  const { invoiceId } = useParams();
  const invoice = useInvoiceStore((s) => s.invoices.find((i) => i.id === invoiceId));

  if (!invoice) {
    return (
      <WidgetShell>
        <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto" />
        <p className="text-center text-body-sm text-muted-foreground">Invoice not found</p>
      </WidgetShell>
    );
  }

  const remaining = invoice.amount - invoice.amountPaid;
  const paidPct = invoice.amount > 0 ? Math.round((invoice.amountPaid / invoice.amount) * 100) : 0;

  if (invoice.status === "paid") {
    return (
      <WidgetShell>
        <p className="text-center text-heading-sm text-success">✓ Paid</p>
        <p className="text-center text-sats text-primary font-tabular">{formatSats(invoice.amountPaid)} sats</p>
      </WidgetShell>
    );
  }

  if (invoice.status === "expired" || invoice.status === "cancelled") {
    return (
      <WidgetShell>
        <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
        <p className="text-center text-body-sm text-muted-foreground">Invoice {invoice.status}</p>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell>
      <div className="text-center">
        <p className="text-caption text-muted-foreground">Invoice #{invoice.id}</p>
        {invoice.memo && <p className="text-caption text-muted-foreground italic">"{invoice.memo}"</p>}
      </div>

      <div className="flex justify-center">
        <div className="rounded-lg bg-white p-3">
          <QRCodeSVG value={invoice.merchantAddress} size={120} level="M" />
        </div>
      </div>

      <div className="text-center">
        <span className="text-2xl sm:text-sats text-primary font-tabular">{formatSats(remaining)} sats</span>
      </div>

      {invoice.amountPaid > 0 && <Progress value={paidPct} className="h-2" />}

      {invoice.expiresAt && (
        <div className="flex justify-center">
          <ExpirationCountdown expiresAt={invoice.expiresAt} />
        </div>
      )}

      <Button className="w-full h-10 gap-2 font-semibold" onClick={() => toast.info("Connect wallet to pay")}>
        <Wallet className="h-4 w-4" /> Pay Now
      </Button>
    </WidgetShell>
  );
}

function WidgetShell({ children }: { children: React.ReactNode }) {
  return (
    <PageTransition>
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-xs border-border">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-center gap-2">
              <Bitcoin className="h-4 w-4 text-primary" />
              <span className="text-body font-bold text-primary">sBTC Pay</span>
              <Badge variant="outline" className="text-[10px] border-stacks text-stacks">Widget</Badge>
            </div>
            {children}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
