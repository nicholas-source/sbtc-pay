import { useState, useEffect, useMemo } from "react";
import { FileText, Clock, CheckCircle } from "lucide-react";
import { useInvoiceStore, type Invoice } from "@/stores/invoice-store";
import CreateInvoiceDialog from "@/components/invoice/CreateInvoiceDialog";
import InvoiceTable from "@/components/invoice/InvoiceTable";
import InvoiceDetail from "@/components/invoice/InvoiceDetail";
import StatCard from "@/components/dashboard/StatCard";
import InvoicesSkeleton from "@/components/dashboard/InvoicesSkeleton";
import EmptyState from "@/components/dashboard/EmptyState";
import { StaggerContainer, StaggerItem } from "@/components/layout/PageTransition";

import { BTC_USD } from "@/lib/constants";

function InvoicesPage() {
  const invoices = useInvoiceStore((s) => s.invoices);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const stats = useMemo(() => {
    const pending = invoices.filter((i) => i.status === "pending" || i.status === "partial");
    const paid = invoices.filter((i) => i.status === "paid");
    const pendingAmount = pending.reduce((s, i) => s + (i.amount - i.amountPaid), 0);
    const paidAmount = paid.reduce((s, i) => s + i.amountPaid, 0);
    return { total: invoices.length, pendingAmount, paidAmount };
  }, [invoices]);

  function handleSelect(invoice: Invoice) {
    setSelectedInvoice(invoice);
    setDetailOpen(true);
  }

  if (isLoading) return <InvoicesSkeleton />;

  if (invoices.length === 0) {
    return (
      <StaggerContainer className="space-y-6">
        <StaggerItem>
          <h1 className="text-heading-lg text-foreground">Invoices</h1>
          <p className="text-body-sm text-muted-foreground mt-1">Create and manage payment invoices</p>
        </StaggerItem>
        <StaggerItem>
          <EmptyState
            icon={FileText}
            title="No invoices yet"
            description="Create your first invoice to start accepting sBTC payments from your customers."
            action={<CreateInvoiceDialog />}
          />
        </StaggerItem>
      </StaggerContainer>
    );
  }

  return (
    <StaggerContainer className="space-y-6">
      <StaggerItem>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-heading-lg text-foreground">Invoices</h1>
            <p className="text-body-sm text-muted-foreground mt-1">Create and manage payment invoices</p>
          </div>
          <CreateInvoiceDialog />
        </div>
      </StaggerItem>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StaggerItem>
          <StatCard label="Total Invoices" value={stats.total} displayValue={String(stats.total)} icon={FileText} change="" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Pending Amount" value={stats.pendingAmount} displayValue={stats.pendingAmount.toLocaleString()} unit="sats" usd={`$${(stats.pendingAmount * BTC_USD).toFixed(2)}`} icon={Clock} change="" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Paid Amount" value={stats.paidAmount} displayValue={stats.paidAmount.toLocaleString()} unit="sats" usd={`$${(stats.paidAmount * BTC_USD).toFixed(2)}`} icon={CheckCircle} change="" />
        </StaggerItem>
      </div>

      <StaggerItem><InvoiceTable onSelect={handleSelect} /></StaggerItem>
      <InvoiceDetail invoice={selectedInvoice} open={detailOpen} onOpenChange={setDetailOpen} />
    </StaggerContainer>
  );
}
export default InvoicesPage;
