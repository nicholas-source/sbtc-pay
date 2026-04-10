import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import {
  Shield, Pause, Play, Settings, Users, FileText, Repeat,
  TrendingUp, AlertTriangle, ArrowRightLeft,
  Bitcoin, ChevronDown, ChevronUp, BadgeCheck, Ban, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAdminStore } from "@/stores/admin-store";
import { useWalletStore } from "@/stores/wallet-store";

import { cn } from "@/lib/utils";
import { formatSbtcCompact, formatSbtc } from "@/lib/constants";

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

  const { address } = useWalletStore();
  const {
    contractPaused, toggleContractPause, feeBps, updateFeeBps,
    feeRecipient, updateFeeRecipient, pendingOwner, currentOwner,
    initiateOwnershipTransfer, cancelOwnershipTransfer,
    merchants, stats, verifyMerchant, suspendMerchant,
    isLoading, pendingAction, fetchAdminData, isContractOwner,
  } = useAdminStore();

  useEffect(() => {
    if (address) fetchAdminData(address);
  }, [address, fetchAdminData]);

  const [newFeeBps, setNewFeeBps] = useState(feeBps.toString());
  const [newFeeRecipient, setNewFeeRecipient] = useState(feeRecipient);
  const [transferAddress, setTransferAddress] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  // Sync local input state when chain data loads
  useEffect(() => {
    setNewFeeBps(feeBps.toString());
  }, [feeBps]);
  useEffect(() => {
    setNewFeeRecipient(feeRecipient);
  }, [feeRecipient]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-heading-lg text-foreground flex items-center gap-2">
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
        </div>
      </div>

      {!isContractOwner && !isLoading && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
            <p className="text-body-sm text-foreground">
              Your connected wallet is not the contract owner. Admin actions will require the owner wallet.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Platform Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Merchants" value={stats.totalMerchants.toString()} icon={Users} accent="info" />
        <StatCard label="Invoices" value={stats.totalInvoices.toString()} icon={FileText} accent="primary" />
        <StatCard label="Subscriptions" value={stats.totalSubscriptions.toString()} icon={Repeat} accent="secondary" />
        <StatCard label="Total Volume" value={`${formatSbtcCompact(stats.totalVolume)} sBTC`} icon={TrendingUp} accent="success" />
        <StatCard label="Fees Collected" value={`${formatSbtc(stats.feesCollected)} sBTC`} icon={Bitcoin} accent="warning" />
      </div>

      {/* Contract Controls */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-heading-sm">Contract Controls</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setShowSettings(!showSettings)}>
            <Settings className="h-4 w-4 mr-1" />
            {showSettings ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
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
                <Button variant={contractPaused ? "default" : "destructive"} size="sm" disabled={!!pendingAction}>
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
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-4 overflow-hidden">
              <Separator />

              {/* Fee Management */}
              <div className="space-y-2">
                <p className="text-body font-medium text-foreground">Platform Fee</p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={1000}
                    value={newFeeBps}
                    onChange={(e) => setNewFeeBps(e.target.value)}
                    className="w-24 font-mono"
                  />
                  <span className="text-caption text-muted-foreground">BPS ({(parseInt(newFeeBps) / 100 || 0).toFixed(2)}%)</span>
                  <Button size="sm" variant="outline" disabled={!!pendingAction} onClick={() => updateFeeBps(parseInt(newFeeBps))}>
                    {pendingAction === "fee" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update"}
                  </Button>
                </div>
              </div>

              {/* Fee Recipient */}
              <div className="space-y-2">
                <p className="text-body font-medium text-foreground">Fee Recipient</p>
                <div className="flex items-center gap-2">
                  <Input value={newFeeRecipient} onChange={(e) => setNewFeeRecipient(e.target.value)} className="font-mono text-caption" />
                  <Button size="sm" variant="outline" disabled={!!pendingAction} onClick={() => updateFeeRecipient(newFeeRecipient)}>
                    {pendingAction === "recipient" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update"}
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Ownership Transfer */}
              <div className="space-y-2">
                <p className="text-body font-medium text-foreground">Ownership Transfer</p>
                <p className="text-caption text-muted-foreground">Current owner: <code className="font-mono">{currentOwner.slice(0, 10)}…{currentOwner.slice(-6)}</code></p>
                {pendingOwner ? (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
                    <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                    <div className="flex-1">
                      <p className="text-caption text-foreground">Pending transfer to:</p>
                      <code className="text-caption font-mono text-muted-foreground">{pendingOwner}</code>
                    </div>
                    <Button size="sm" variant="destructive" disabled={!!pendingAction} onClick={() => cancelOwnershipTransfer()}>
                      {pendingAction === "cancelTransfer" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel"}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input placeholder="New owner address" value={transferAddress} onChange={(e) => setTransferAddress(e.target.value)} className="font-mono text-caption" />
                    <Button size="sm" variant="outline" disabled={!!pendingAction || !transferAddress} onClick={() => { initiateOwnershipTransfer(transferAddress); setTransferAddress(""); }}>
                      {pendingAction === "transfer" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ArrowRightLeft className="h-4 w-4 mr-1" /> Transfer</>}
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Merchant Management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-heading-sm">Merchant Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Merchant</TableHead>
                  <TableHead className="hidden md:table-cell">Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Registered</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Volume</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {merchants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No merchants registered yet
                    </TableCell>
                  </TableRow>
                ) : merchants.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground max-w-[180px] truncate">{m.name}</p>
                        <p className="text-caption text-muted-foreground">{m.invoiceCount} invoices</p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell font-mono text-caption text-muted-foreground">
                      {m.address.slice(0, 8)}…{m.address.slice(-4)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {m.isVerified ? (
                          <Badge variant="outline" className="border-success/30 text-success text-[10px]">Verified</Badge>
                        ) : (
                          <Badge variant="outline" className="border-warning/30 text-warning text-[10px]">Unverified</Badge>
                        )}
                        {m.isSuspended && (
                          <Badge variant="outline" className="border-destructive/30 text-destructive text-[10px]">Suspended</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-caption text-muted-foreground">
                      {format(m.registeredAt, "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-right hidden sm:table-cell font-mono text-caption">
                      {formatSbtcCompact(m.totalVolume)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {!m.isVerified && (
                          <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={`Verify ${m.name}`} disabled={!!pendingAction} onClick={() => verifyMerchant(m.id)}>
                            {pendingAction === `verify-${m.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4 text-success" />}
                          </Button>
                        )}
                        {!m.isSuspended && (
                          <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={`Suspend ${m.name}`} disabled={!!pendingAction} onClick={() => suspendMerchant(m.id)}>
                            {pendingAction === `suspend-${m.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4 text-destructive" />}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
