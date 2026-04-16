import { useState, useMemo, useCallback } from "react";
import { FileText, Clock, CheckCircle, Download } from "lucide-react";
import { format } from "date-fns";
import { useInvoiceStore, type Invoice } from "@/stores/invoice-store";
import CreateInvoiceDialog from "@/components/invoice/CreateInvoiceDialog";
import InvoiceTable from "@/components/invoice/InvoiceTable";
import InvoiceDetail from "@/components/invoice/InvoiceDetail";
import StatCard from "@/components/dashboard/StatCard";
import EmptyState from "@/components/dashboard/EmptyState";
import { Button } from "@/components/ui/button";
import { exportToCSV } from "@/lib/export-csv";

import { formatAmount, amountToUsd, tokenLabel } from "@/lib/constants";

function InvoicesPage() {
  const invoices = useInvoiceStore((s) => s.invoices);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const stats = useMemo(() => {
    const pending = invoices.filter((i) => i.status === "pending" || i.status === "partial");
    const paid = invoices.filter((i) => i.status === "paid");
    const pendingAmount = pending.reduce((s, i) => s + (i.amount - i.amountPaid), 0);
    const paidAmount = paid.reduce((s, i) => s + i.amountPaid, 0);
    return { total: invoices.length, pendingAmount, paidAmount };
  }, [invoices]);

  const handleExport = useCallback(() => {
    const rows = invoices.map((inv) => ({
      "Invoice ID": inv.id,
      "Amount (sats)": inv.amount,
      "Amount Paid (sats)": inv.amountPaid,
      Status: inv.status,
      Memo: inv.memo ?? "",
      Created: format(new Date(inv.createdAt), "yyyy-MM-dd HH:mm"),
      Payer: inv.payerAddress ?? "",
    }));
    exportToCSV(rows, `invoices-${format(new Date(), "yyyy-MM-dd")}.csv`);
  }, [invoices]);

  function handleSelect(invoice: Invoice) {
    setSelectedInvoice(invoice);
    setDetailOpen(true);
  }

  if (invoices.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-heading-lg text-foreground">Invoices</h1>
          <p className="text-body-sm text-muted-foreground mt-1">Create and manage payment invoices</p>
        </div>
        <EmptyState
            icon={FileText}
            title="No invoices yet"
            description="Create your first invoice to start accepting sBTC payments from your customers."
            action={<CreateInvoiceDialog />}
          />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-heading-lg text-foreground">Invoices</h1>
          <p className="text-body-sm text-muted-foreground mt-1">Create and manage payment invoices</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-1 h-4 w-4" />
            Export CSV
          </Button>
          <CreateInvoiceDialog />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Invoices" value={stats.total} displayValue={String(stats.total)} icon={FileText} change="" accent="primary" />
        <StatCard label="Pending Amount" value={stats.pendingAmount} displayValue={formatAmount(stats.pendingAmount, 'sbtc')} unit="sBTC" usd={`$${amountToUsd(stats.pendingAmount, 'sbtc')}`} icon={Clock} change="" accent="warning" />
        <StatCard label="Paid Amount" value={stats.paidAmount} displayValue={formatAmount(stats.paidAmount, 'sbtc')} unit="sBTC" usd={`$${amountToUsd(stats.paidAmount, 'sbtc')}`} icon={CheckCircle} change="" accent="success" />
      </div>

      <InvoiceTable onSelect={handleSelect} />
      <InvoiceDetail invoice={selectedInvoice} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}
export default InvoicesPage;
