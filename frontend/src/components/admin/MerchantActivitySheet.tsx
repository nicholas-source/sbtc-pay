import { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  Calendar, Copy, ExternalLink, FileText, Repeat,
  BadgeCheck, Ban, CheckCircle2,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollableTable } from "@/components/ui/scrollable-table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabaseWithWallet } from "@/lib/supabase/client";
import type { MerchantEntry } from "@/stores/admin-store";
import { formatAmount, tokenLabel, type TokenType } from "@/lib/constants";
import { getExplorerAddressUrl } from "@/lib/stacks/config";
import { toast } from "sonner";
import type { Tables } from "@/lib/supabase/types";

type InvoiceRow = Pick<
  Tables<"invoices">,
  "id" | "amount" | "amount_paid" | "status" | "token_type" | "memo" | "created_at"
>;
type SubscriptionRow = Pick<
  Tables<"subscriptions">,
  "id" | "name" | "amount" | "token_type" | "status" | "subscriber" | "payments_made" | "created_at"
>;

const INVOICE_STATUS_LABELS: Record<number, string> = {
  0: "Pending", 1: "Partial", 2: "Paid", 3: "Expired", 4: "Cancelled", 5: "Refunded",
};
const INVOICE_STATUS_STYLES: Record<number, string> = {
  0: "border-warning/30 text-warning",
  1: "border-info/30 text-info",
  2: "border-success/30 text-success",
  3: "border-destructive/30 text-destructive",
  4: "border-muted-foreground/30 text-muted-foreground",
  5: "border-secondary/30 text-secondary",
};

const SUB_STATUS_LABELS: Record<number, string> = { 0: "Active", 1: "Cancelled", 2: "Expired" };
const SUB_STATUS_STYLES: Record<number, string> = {
  0: "border-success/30 text-success",
  1: "border-muted-foreground/30 text-muted-foreground",
  2: "border-destructive/30 text-destructive",
};

interface Props {
  merchant: MerchantEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletAddress: string;
  isContractOwner: boolean;
  pendingAction: string | null;
  onVerify: (id: string) => void;
  onSuspend: (id: string) => void;
  onUnsuspend: (id: string) => void;
}

export function MerchantActivitySheet({
  merchant, open, onOpenChange,
  walletAddress, isContractOwner, pendingAction,
  onVerify, onSuspend, onUnsuspend,
}: Props) {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !merchant || !walletAddress) return;
    let cancelled = false;

    setLoading(true);
    setInvoices([]);
    setSubscriptions([]);

    const db = supabaseWithWallet(walletAddress);

    Promise.allSettled([
      db.from("invoices")
        .select("id, amount, amount_paid, status, token_type, memo, created_at")
        .eq("merchant_principal", merchant.address)
        .order("created_at", { ascending: false })
        .limit(100),
      db.from("subscriptions")
        .select("id, name, amount, token_type, status, subscriber, payments_made, created_at")
        .eq("merchant_principal", merchant.address)
        .order("created_at", { ascending: false })
        .limit(100),
    ]).then(([invRes, subRes]) => {
      if (cancelled) return;
      if (invRes.status === "fulfilled" && invRes.value.data) setInvoices(invRes.value.data);
      if (subRes.status === "fulfilled" && subRes.value.data) setSubscriptions(subRes.value.data);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [open, merchant?.address, walletAddress]);

  if (!merchant) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col gap-0 p-0">
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex flex-col gap-2 pr-8">
            <SheetTitle className="text-heading-sm truncate">{merchant.name}</SheetTitle>
            <div className="flex flex-wrap gap-1.5">
              {merchant.isSuspended ? (
                <Badge variant="outline" className="border-destructive/30 text-destructive text-micro">Suspended</Badge>
              ) : merchant.isVerified ? (
                <Badge variant="outline" className="border-success/30 text-success text-micro">Verified</Badge>
              ) : (
                <Badge variant="outline" className="border-warning/30 text-warning text-micro">Unverified</Badge>
              )}
            </div>
            <TooltipProvider delayDuration={200}>
              <div className="flex items-center gap-1">
                <code className="font-mono text-caption text-muted-foreground">
                  {merchant.address.slice(0, 8)}…{merchant.address.slice(-6)}
                </code>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { navigator.clipboard.writeText(merchant.address); toast.success("Address copied"); }}>
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy full address</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a href={getExplorerAddressUrl(merchant.address)} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-accent focus-ring">
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent>View on explorer</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
            <p className="text-micro text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3 shrink-0" />
              Registered {format(merchant.registeredAt, "MMM d, yyyy")}
            </p>
          </div>
        </SheetHeader>

        {/* Tabs */}
        <Tabs defaultValue="invoices" className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full rounded-none border-b border-border bg-transparent h-11 px-6 justify-start gap-6 shrink-0">
            <TabsTrigger
              value="invoices"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5 text-body-sm px-0 h-full"
            >
              <FileText className="h-3.5 w-3.5" />
              Invoices
              {!loading && (
                <span className="text-micro text-muted-foreground">({invoices.length})</span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="subscriptions"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5 text-body-sm px-0 h-full"
            >
              <Repeat className="h-3.5 w-3.5" />
              Subscriptions
              {!loading && (
                <span className="text-micro text-muted-foreground">({subscriptions.length})</span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Invoices */}
          <TabsContent value="invoices" className="flex-1 overflow-auto m-0 data-[state=inactive]:hidden">
            {loading ? (
              <div className="flex flex-col gap-2 px-4 pt-3">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : invoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-center px-6">
                <FileText className="h-8 w-8 text-muted-foreground/30 mb-3" />
                <p className="text-body-sm text-muted-foreground">No invoices found</p>
              </div>
            ) : (
              <ScrollableTable label="Merchant invoices">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono text-caption text-muted-foreground">
                          #{inv.id}
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-sm">
                            {formatAmount(inv.amount, inv.token_type as TokenType)}{" "}
                            <span className="text-muted-foreground text-xs">{tokenLabel(inv.token_type as TokenType)}</span>
                          </div>
                          {inv.amount_paid > 0 && inv.status !== 2 && (
                            <div className="text-micro text-muted-foreground">
                              {formatAmount(inv.amount_paid, inv.token_type as TokenType)} paid
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-micro ${INVOICE_STATUS_STYLES[inv.status] ?? "border-border text-muted-foreground"}`}>
                            {INVOICE_STATUS_LABELS[inv.status] ?? "Unknown"}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-caption text-muted-foreground">
                          {format(new Date(inv.created_at), "MMM d, yyyy")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollableTable>
            )}
          </TabsContent>

          {/* Subscriptions */}
          <TabsContent value="subscriptions" className="flex-1 overflow-auto m-0 data-[state=inactive]:hidden">
            {loading ? (
              <div className="flex flex-col gap-2 px-4 pt-3">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : subscriptions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-center px-6">
                <Repeat className="h-8 w-8 text-muted-foreground/30 mb-3" />
                <p className="text-body-sm text-muted-foreground">No subscriptions found</p>
              </div>
            ) : (
              <ScrollableTable label="Merchant subscriptions">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plan</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">Payments</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subscriptions.map((sub) => (
                      <TableRow key={sub.id}>
                        <TableCell>
                          <div className="font-medium text-sm max-w-[120px] sm:max-w-[180px] truncate">{sub.name}</div>
                          <div className="font-mono text-micro text-muted-foreground">
                            {sub.subscriber.slice(0, 6)}…{sub.subscriber.slice(-4)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-sm">
                            {formatAmount(sub.amount, sub.token_type as TokenType)}{" "}
                            <span className="text-muted-foreground text-xs">{tokenLabel(sub.token_type as TokenType)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-micro ${SUB_STATUS_STYLES[sub.status] ?? "border-border text-muted-foreground"}`}>
                            {SUB_STATUS_LABELS[sub.status] ?? "Unknown"}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-caption text-muted-foreground">
                          {sub.payments_made} made
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollableTable>
            )}
          </TabsContent>
        </Tabs>

        {/* Admin actions — sticky footer, only for contract owner */}
        {isContractOwner && (
          <div className="border-t border-border px-6 py-4 flex flex-wrap gap-2 shrink-0">
            {!merchant.isVerified && !merchant.isSuspended && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1.5 text-success border-success/30 hover:bg-success/10" disabled={!!pendingAction}>
                    <BadgeCheck className="h-3.5 w-3.5" />
                    Verify
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Verify {merchant.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Marks <span className="font-mono text-foreground">{merchant.address.slice(0, 8)}…{merchant.address.slice(-6)}</span> as a verified merchant. Requires an on-chain transaction.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => { onVerify(merchant.id); onOpenChange(false); }}>
                      Verify Merchant
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {!merchant.isSuspended && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10" disabled={!!pendingAction}>
                    <Ban className="h-3.5 w-3.5" />
                    Suspend
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Suspend {merchant.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Prevents this merchant from creating invoices or receiving payments. Requires an on-chain transaction.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => { onSuspend(merchant.id); onOpenChange(false); }}
                    >
                      Suspend Merchant
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {merchant.isSuspended && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1.5 text-success border-success/30 hover:bg-success/10" disabled={!!pendingAction}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Reinstate
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reinstate {merchant.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Lifts the suspension and allows this merchant to resume operations. Requires an on-chain transaction.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => { onUnsuspend(merchant.id); onOpenChange(false); }}>
                      Reinstate Merchant
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
