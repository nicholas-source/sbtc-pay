import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { format } from "date-fns";
import {
  Shield, Pause, Play, Settings, Users, FileText, Repeat,
  TrendingUp, AlertTriangle, ArrowRightLeft,
  Bitcoin, ChevronDown, ChevronUp, BadgeCheck, Ban, Loader2,
  Copy, ExternalLink, Search, RefreshCw, CheckCircle2, Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAdminStore } from "@/stores/admin-store";
import type { MerchantEntry } from "@/stores/admin-store";
import { MerchantActivitySheet } from "@/components/admin/MerchantActivitySheet";
import { useWalletStore } from "@/stores/wallet-store";
import { getExplorerAddressUrl } from "@/lib/stacks/config";
import { formatAmount, amountToUsd } from "@/lib/constants";
import { useLivePrices } from "@/stores/wallet-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollableTable } from "@/components/ui/scrollable-table";
import { IndexerHealthPanel } from "@/components/admin/IndexerHealthPanel";
import { PlatformPaymentsFeed } from "@/components/admin/PlatformPaymentsFeed";
import { PlatformAnalyticsPanel } from "@/components/admin/PlatformAnalyticsPanel";

type AccentColor = "primary" | "secondary" | "success" | "warning" | "destructive" | "info";

const iconBgMap: Record<AccentColor, string> = {
  primary: "bg-primary/15 text-primary",
  secondary: "bg-secondary/15 text-secondary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/15 text-destructive",
  info: "bg-info/15 text-info",
};

const accentBorderMap: Record<AccentColor, string> = {
  primary: "card-accent-primary",
  secondary: "card-accent-secondary",
  success: "card-accent-success",
  warning: "card-accent-warning",
  destructive: "card-accent-destructive",
  info: "card-accent-info",
};

function StatCard({ label, value, icon: Icon, accent = "primary" }: { label: string; value: string; icon: React.ElementType; accent?: AccentColor }) {
  return (
    <Card className={cn("animate-fade-slide-up", accentBorderMap[accent])}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-body-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", iconBgMap[accent])}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="font-mono-nums text-sats text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

export default function AdminPage() {

  const navigate = useNavigate();
  const hasFetchStarted = useRef(false);
  const { address } = useWalletStore();
  const {
    contractPaused, toggleContractPause, feeBps, updateFeeBps,
    feeRecipient, updateFeeRecipient, pendingOwner, currentOwner,
    initiateOwnershipTransfer, cancelOwnershipTransfer, acceptOwnership,
    merchants, stats, verifyMerchant, suspendMerchant, unsuspendMerchant,
    isLoading, pendingAction, fetchAdminData, isContractOwner,
  } = useAdminStore();
  const { btcPriceUsd, stxPriceUsd } = useLivePrices();

  useEffect(() => {
    if (address) {
      hasFetchStarted.current = true;
      fetchAdminData(address);
    }
  }, [address, fetchAdminData]);

  const [newFeeBps, setNewFeeBps] = useState(feeBps.toString());
  const [feeBpsError, setFeeBpsError] = useState<string | null>(null);
  const [newFeeRecipient, setNewFeeRecipient] = useState(feeRecipient);
  const [transferAddress, setTransferAddress] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [merchantSearch, setMerchantSearch] = useState("");
  const [selectedMerchant, setSelectedMerchant] = useState<MerchantEntry | null>(null);
  const [merchantSheetOpen, setMerchantSheetOpen] = useState(false);

  const isInitialLoading = isLoading && merchants.length === 0 && stats.totalMerchants === 0;

  const handleFeeBpsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewFeeBps(val);
    const num = parseInt(val);
    if (!val || isNaN(num)) setFeeBpsError("Enter a whole number");
    else if (num < 0) setFeeBpsError("Cannot be negative");
    else if (num > 500) setFeeBpsError("Maximum is 500 BPS (5%)");
    else setFeeBpsError(null);
  };

  const filteredMerchants = merchants.filter((m) => {
    if (!merchantSearch) return true;
    const q = merchantSearch.trim().toLowerCase();
    return m.name.toLowerCase().includes(q) || m.address.toLowerCase().includes(q);
  });

  // Sync local input state when chain data loads
  useEffect(() => {
    setNewFeeBps(feeBps.toString());
  }, [feeBps]);
  useEffect(() => {
    setNewFeeRecipient(feeRecipient);
  }, [feeRecipient]);

  // Gate: once the initial fetch completes, block non-owners from viewing the panel
  if (hasFetchStarted.current && !isLoading && !isContractOwner) {
    return (
      <div className="mx-auto max-w-7xl flex flex-col items-center justify-center gap-fluid-lg p-fluid-md lg:p-fluid-lg min-h-[60vh]">
        <Card className="border-destructive/30 bg-destructive/5 max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15">
              <Shield className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <h2 className="text-heading-sm font-display text-foreground">Access Restricted</h2>
              <p className="text-body-sm text-muted-foreground mt-2">
                This panel is only accessible to the contract owner.
                {address && (
                  <> Your connected wallet (<code className="font-mono text-caption">{address.slice(0, 8)}…{address.slice(-4)}</code>) is not the owner.</>
                )}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")}>
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isInitialLoading) {
    return (
      <div className="mx-auto max-w-7xl flex flex-col gap-fluid-lg p-fluid-md lg:p-fluid-lg">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-60" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-space-md">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-8 rounded-lg" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-7 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl flex flex-col gap-fluid-lg p-fluid-md lg:p-fluid-lg">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-heading-lg font-display text-foreground flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" /> Admin Panel
          </h1>
          <p className="text-body-sm text-muted-foreground mt-1">
            Contract owner controls &amp; platform management
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Badge variant="outline" className={contractPaused ? "border-destructive text-destructive" : "border-success text-success"}>
            {contractPaused ? "Contract Paused" : "Contract Active"}
          </Badge>
          <button
            onClick={() => address && fetchAdminData(address)}
            disabled={isLoading || !address}
            aria-label="Refresh admin data"
            className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-ring disabled:opacity-40"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </button>
        </div>
      </div>



      {/* Platform Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-space-md">
        <StatCard label="Merchants" value={Math.max(stats.totalMerchants, merchants.length).toString()} icon={Users} accent="info" />
        <Card className="card-accent-primary animate-fade-slide-up">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-body-sm font-medium text-muted-foreground">Invoices</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <FileText className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-mono-nums text-sats text-foreground">{stats.totalInvoices.toString()}</div>
            {stats.totalInvoices > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-caption text-muted-foreground">
                {stats.invoiceBreakdown.paid > 0 && (
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-success" />{stats.invoiceBreakdown.paid} Paid</span>
                )}
                {stats.invoiceBreakdown.pending > 0 && (
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-warning" />{stats.invoiceBreakdown.pending} Pending</span>
                )}
                {stats.invoiceBreakdown.partial > 0 && (
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-info" />{stats.invoiceBreakdown.partial} Partial</span>
                )}
                {stats.invoiceBreakdown.expired > 0 && (
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-destructive" />{stats.invoiceBreakdown.expired} Expired</span>
                )}
                {stats.invoiceBreakdown.cancelled > 0 && (
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />{stats.invoiceBreakdown.cancelled} Cancelled</span>
                )}
                {stats.invoiceBreakdown.refunded > 0 && (
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-secondary" />{stats.invoiceBreakdown.refunded} Refunded</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <StatCard label="Subscriptions" value={stats.totalSubscriptions.toString()} icon={Repeat} accent="secondary" />
        <Card className="card-accent-success animate-fade-slide-up">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-body-sm font-medium text-muted-foreground">Total Volume</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/15 text-success">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-mono-nums text-sats text-foreground">
              {[stats.totalVolumeSbtc > 0 ? `${formatAmount(stats.totalVolumeSbtc, 'sbtc')} sBTC` : '', stats.totalVolumeStx > 0 ? `${formatAmount(stats.totalVolumeStx, 'stx')} STX` : ''].filter(Boolean).join(' + ') || '0'}
            </div>
            {(stats.totalVolumeSbtc > 0 || stats.totalVolumeStx > 0) && (
              <div className="text-caption text-muted-foreground mt-1">
                ≈ ${(
                  (stats.totalVolumeSbtc > 0 ? parseFloat(amountToUsd(stats.totalVolumeSbtc, 'sbtc', btcPriceUsd, stxPriceUsd)) || 0 : 0) +
                  (stats.totalVolumeStx > 0 ? parseFloat(amountToUsd(stats.totalVolumeStx, 'stx', btcPriceUsd, stxPriceUsd)) || 0 : 0)
                ).toFixed(2)}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="card-accent-warning animate-fade-slide-up">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-body-sm font-medium text-muted-foreground">Fees Collected</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/15 text-warning">
              <Bitcoin className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-mono-nums text-sats text-foreground">
              {[stats.feesCollectedSbtc > 0 ? `${formatAmount(stats.feesCollectedSbtc, 'sbtc')} sBTC` : '', stats.feesCollectedStx > 0 ? `${formatAmount(stats.feesCollectedStx, 'stx')} STX` : ''].filter(Boolean).join(' + ') || '0'}
            </div>
            {(stats.feesCollectedSbtc > 0 || stats.feesCollectedStx > 0) && (
              <div className="text-caption text-muted-foreground mt-1">
                ≈ ${
                  (
                    (stats.feesCollectedSbtc > 0 ? parseFloat(amountToUsd(stats.feesCollectedSbtc, 'sbtc', btcPriceUsd, stxPriceUsd)) || 0 : 0) +
                    (stats.feesCollectedStx > 0 ? parseFloat(amountToUsd(stats.feesCollectedStx, 'stx', btcPriceUsd, stxPriceUsd)) || 0 : 0)
                  ).toFixed(2)
                }
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Analytics */}
      <PlatformAnalyticsPanel />

      {/* Contract Controls */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-heading-sm">Contract Controls</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setShowSettings(!showSettings)} aria-label={showSettings ? "Hide advanced settings" : "Show advanced settings"} aria-expanded={showSettings}>
            <Settings className="h-4 w-4" />
            <span className="ml-1.5 hidden sm:inline">Advanced</span>
            {showSettings ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-space-md">
          {/* Pause / Unpause */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-body font-medium text-foreground">Contract Status</p>
              <p className="text-caption text-muted-foreground">
                {contractPaused ? "All operations are currently paused." : "Contract is running normally."}
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant={contractPaused ? "default" : "destructive"} size="sm" disabled={!isContractOwner || !!pendingAction}>
                  {pendingAction === "pause" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : contractPaused ? <Play className="h-4 w-4 mr-1" /> : <Pause className="h-4 w-4 mr-1" />}
                  {contractPaused ? "Unpause" : "Pause"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{contractPaused ? "Unpause Contract?" : "Pause Contract?"}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {contractPaused
                      ? "This will resume all contract operations."
                      : "This will halt all contract operations. No new invoices or payments can be processed."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => toggleContractPause()}>
                    Confirm
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {showSettings && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="flex flex-col gap-space-md overflow-hidden">
              <Separator />

              {/* Fee Management */}
              <div className="flex flex-col gap-2">
                <p className="text-body font-medium text-foreground">Platform Fee</p>
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={500}
                        step={1}
                        value={newFeeBps}
                        onChange={handleFeeBpsChange}
                        className={cn("w-24 font-mono", feeBpsError && "border-destructive focus-visible:ring-destructive")}
                        aria-invalid={!!feeBpsError}
                        aria-describedby={feeBpsError ? "fee-bps-error" : undefined}
                        disabled={!isContractOwner || !!pendingAction}
                      />
                      <span className="text-caption text-muted-foreground">BPS ({(parseInt(newFeeBps) / 100 || 0).toFixed(2)}%)</span>
                      <Button size="sm" variant="outline" disabled={!isContractOwner || !!pendingAction || !!feeBpsError} onClick={() => updateFeeBps(parseInt(newFeeBps))}>
                        {pendingAction === "fee" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update"}
                      </Button>
                    </div>
                    {feeBpsError && (
                      <p id="fee-bps-error" className="text-caption text-destructive">{feeBpsError}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Fee Recipient */}
              <div className="flex flex-col gap-2">
                <p className="text-body font-medium text-foreground">Fee Recipient</p>
                <div className="flex items-center gap-2">
                  <Input value={newFeeRecipient} onChange={(e) => setNewFeeRecipient(e.target.value)} className="font-mono text-caption" disabled={!isContractOwner || !!pendingAction} />
                  <Button size="sm" variant="outline" disabled={!isContractOwner || !!pendingAction} onClick={() => updateFeeRecipient(newFeeRecipient)}>
                    {pendingAction === "recipient" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update"}
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Ownership Transfer */}
              <div className="flex flex-col gap-2">
                <p className="text-body font-medium text-foreground">Ownership Transfer</p>
                <p className="text-caption text-muted-foreground">Current owner: <code className="font-mono">{currentOwner.slice(0, 10)}…{currentOwner.slice(-6)}</code></p>
                {pendingOwner ? (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
                    <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                    <div className="flex-1">
                      <p className="text-caption text-foreground">Pending transfer to:</p>
                      <code className="text-caption font-mono text-muted-foreground">{pendingOwner}</code>
                    </div>
                    {pendingOwner === address ? (
                      <Button size="sm" variant="default" disabled={!!pendingAction} onClick={() => acceptOwnership()}>
                        {pendingAction === "accept" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accept Ownership"}
                      </Button>
                    ) : null}
                    <Button size="sm" variant="destructive" disabled={!isContractOwner || !!pendingAction} onClick={() => cancelOwnershipTransfer()}>
                      {pendingAction === "cancelTransfer" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel"}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <Input placeholder="New owner address" value={transferAddress} onChange={(e) => setTransferAddress(e.target.value)} className="font-mono text-caption" disabled={!isContractOwner || !!pendingAction} />
                      <Button size="sm" variant="outline" disabled={!isContractOwner || !!pendingAction || !transferAddress} onClick={() => { initiateOwnershipTransfer(transferAddress); setTransferAddress(""); }}>
                        {pendingAction === "transfer" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ArrowRightLeft className="h-4 w-4 mr-1" /> Transfer</>}
                      </Button>
                    </div>
                    <p className="text-micro text-muted-foreground/70 mt-1">
                      The new owner must call <code className="font-mono">accept-ownership</code> on the contract to complete the transfer.
                      On-chain acceptance UI — <span className="text-muted-foreground">coming soon</span>.
                    </p>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Merchant Management */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="text-heading-sm">Merchant Management</CardTitle>
            <p className="text-body-sm text-muted-foreground mt-1">
              {merchants.length} registered merchant{merchants.length !== 1 ? "s" : ""}
              {stats.totalMerchants > merchants.length && (
                <span className="text-warning ml-2">
                  ({stats.totalMerchants - merchants.length} pending indexing)
                </span>
              )}
            </p>
          </div>
          {merchants.length > 0 && (
            <div className="relative w-full sm:w-64 md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search merchants…"
                value={merchantSearch}
                onChange={(e) => setMerchantSearch(e.target.value)}
                className="pl-9"
                aria-label="Search merchants by name or address"
              />
            </div>
          )}
        </CardHeader>
        <CardContent>
          <TooltipProvider delayDuration={200}>
          <ScrollableTable label="Merchants table">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Merchant</TableHead>
                  <TableHead className="hidden md:table-cell">Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Registered</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Volume</TableHead>
                  <TableHead className="w-[100px] sm:w-[140px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {merchants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p>No merchants registered yet</p>
                    </TableCell>
                  </TableRow>
                ) : filteredMerchants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No merchants match "{merchantSearch}"
                    </TableCell>
                  </TableRow>
                ) : filteredMerchants.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground max-w-[180px] truncate">{m.name}</p>
                        <p className="text-caption text-muted-foreground">
                          {m.invoiceCount} invoice{m.invoiceCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex items-center gap-1.5">
                        <code className="font-mono text-caption text-muted-foreground">
                          {m.address.slice(0, 6)}…{m.address.slice(-6)}
                        </code>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 focus-ring"
                              onClick={() => {
                                navigator.clipboard.writeText(m.address);
                                toast.success("Address copied");
                              }}
                              aria-label={`Copy address for ${m.name}`}
                            >
                              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">Copy full address</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={getExplorerAddressUrl(m.address)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-accent focus-ring"
                              aria-label={`View ${m.name} on explorer`}
                            >
                              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                            </a>
                          </TooltipTrigger>
                          <TooltipContent side="top">View on explorer</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {m.isSuspended ? (
                          <Badge variant="outline" className="border-destructive/30 text-destructive text-micro">Suspended</Badge>
                        ) : m.isVerified ? (
                          <Badge variant="outline" className="border-success/30 text-success text-micro">Verified</Badge>
                        ) : (
                          <Badge variant="outline" className="border-warning/30 text-warning text-micro">Unverified</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-caption text-muted-foreground">
                      {format(m.registeredAt, "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-right hidden sm:table-cell font-mono text-caption">
                      {[m.totalVolumeSbtc > 0 ? `${formatAmount(m.totalVolumeSbtc, 'sbtc')} sBTC` : '', m.totalVolumeStx > 0 ? `${formatAmount(m.totalVolumeStx, 'stx')} STX` : ''].filter(Boolean).join(' / ') || '0'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-9 w-9 p-0"
                              onClick={() => { setSelectedMerchant(m); setMerchantSheetOpen(true); }}
                              aria-label={`View activity for ${m.name}`}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">View activity</TooltipContent>
                        </Tooltip>
                        {!m.isVerified && !m.isSuspended && (
                          <AlertDialog>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-9 gap-1.5 text-success border-success/30 hover:bg-success/10 transition-colors"
                                    disabled={!isContractOwner || !!pendingAction}
                                    aria-label={`Verify ${m.name}`}
                                  >
                                    {pendingAction === `verify-${m.id}` ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <BadgeCheck className="h-3.5 w-3.5" />
                                    )}
                                    <span className="hidden lg:inline">Verify</span>
                                  </Button>
                                </AlertDialogTrigger>
                              </TooltipTrigger>
                              <TooltipContent side="top">Mark merchant as verified</TooltipContent>
                            </Tooltip>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Verify {m.name}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will mark <span className="font-mono text-foreground">{m.address.slice(0, 8)}…{m.address.slice(-6)}</span> as a verified merchant.
                                  This action requires an on-chain transaction.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => verifyMerchant(m.id)}>
                                  Verify Merchant
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        {!m.isSuspended && (
                          <AlertDialog>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-9 gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 transition-colors"
                                    disabled={!isContractOwner || !!pendingAction}
                                    aria-label={`Suspend ${m.name}`}
                                  >
                                    {pendingAction === `suspend-${m.id}` ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Ban className="h-3.5 w-3.5" />
                                    )}
                                    <span className="hidden lg:inline">Suspend</span>
                                  </Button>
                                </AlertDialogTrigger>
                              </TooltipTrigger>
                              <TooltipContent side="top">Suspend this merchant</TooltipContent>
                            </Tooltip>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Suspend {m.name}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will prevent <span className="font-mono text-foreground">{m.address.slice(0, 8)}…{m.address.slice(-6)}</span> from
                                  creating invoices or receiving payments. This action requires an on-chain transaction.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => suspendMerchant(m.id)}
                                >
                                  Suspend Merchant
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        {m.isSuspended && (
                          <AlertDialog>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-9 gap-1.5 text-success border-success/30 hover:bg-success/10 transition-colors"
                                    disabled={!isContractOwner || !!pendingAction}
                                    aria-label={`Reinstate ${m.name}`}
                                  >
                                    {pendingAction === `unsuspend-${m.id}` ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                    )}
                                    <span className="hidden lg:inline">Reinstate</span>
                                  </Button>
                                </AlertDialogTrigger>
                              </TooltipTrigger>
                              <TooltipContent side="top">Lift suspension</TooltipContent>
                            </Tooltip>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Reinstate {m.name}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will lift the admin suspension on <span className="font-mono text-foreground">{m.address.slice(0, 8)}…{m.address.slice(-6)}</span>, allowing them to create invoices and receive payments again.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => unsuspendMerchant(m.id)}>
                                  Reinstate Merchant
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollableTable>
          </TooltipProvider>
        </CardContent>
      </Card>

      {/* Indexer Health */}
      <IndexerHealthPanel />

      {/* Platform-wide Payments */}
      <PlatformPaymentsFeed />

      {/* Merchant Activity Sheet */}
      <MerchantActivitySheet
        merchant={selectedMerchant}
        open={merchantSheetOpen}
        onOpenChange={setMerchantSheetOpen}
        walletAddress={address ?? ""}
        isContractOwner={isContractOwner}
        pendingAction={pendingAction}
        onVerify={verifyMerchant}
        onSuspend={suspendMerchant}
        onUnsuspend={unsuspendMerchant}
      />
    </div>
  );
}
