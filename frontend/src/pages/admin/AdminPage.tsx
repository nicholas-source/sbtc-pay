import { useState } from "react";
import { motion } from "framer-motion";
import { PageTransition, StaggerContainer, StaggerItem } from "@/components/layout/PageTransition";
import { format } from "date-fns";
import {
  Shield, Pause, Play, Settings, Users, FileText, Repeat,
  TrendingUp, AlertTriangle, CheckCircle2, XCircle, ArrowRightLeft,
  Bitcoin, ChevronDown, ChevronUp, BadgeCheck, Ban,
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
import { toast } from "sonner";
import { useAdminStore } from "@/stores/admin-store";

import { BTC_USD } from "@/lib/constants";

function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  return (
    <Card className="card-glow">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-body-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="font-mono-nums text-sats text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

export default function AdminPage() {
  const {
    contractPaused, toggleContractPause, feeBps, updateFeeBps,
    feeRecipient, updateFeeRecipient, pendingOwner, currentOwner,
    initiateOwnershipTransfer, cancelOwnershipTransfer,
    merchants, stats, verifyMerchant, suspendMerchant, unsuspendMerchant,
  } = useAdminStore();

  const [newFeeBps, setNewFeeBps] = useState(feeBps.toString());
  const [newFeeRecipient, setNewFeeRecipient] = useState(feeRecipient);
  const [transferAddress, setTransferAddress] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  return (
    <StaggerContainer className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <StaggerItem>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-heading-lg text-foreground flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" /> Admin Panel
          </h1>
          <p className="text-body-sm text-muted-foreground mt-1">
            Contract owner controls &amp; platform management
          </p>
        </div>
        <Badge variant="outline" className={contractPaused ? "border-destructive text-destructive" : "border-success text-success"}>
          {contractPaused ? "Contract Paused" : "Contract Active"}
        </Badge>
      </div>
      </StaggerItem>

      {/* Platform Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StaggerItem><StatCard label="Merchants" value={stats.totalMerchants.toString()} icon={Users} /></StaggerItem>
        <StaggerItem><StatCard label="Invoices" value={stats.totalInvoices.toString()} icon={FileText} /></StaggerItem>
        <StaggerItem><StatCard label="Subscriptions" value={stats.totalSubscriptions.toString()} icon={Repeat} /></StaggerItem>
        <StaggerItem><StatCard label="Total Volume" value={`${(stats.totalVolume / 1e6).toFixed(1)}M sats`} icon={TrendingUp} /></StaggerItem>
        <StaggerItem><StatCard label="Fees Collected" value={`${stats.feesCollected.toLocaleString()} sats`} icon={Bitcoin} /></StaggerItem>
      </div>

      {/* Contract Controls */}
      <StaggerItem>
      <Card className="card-glow">
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
                <Button variant={contractPaused ? "default" : "destructive"} size="sm">
                  {contractPaused ? <Play className="h-4 w-4 mr-1" /> : <Pause className="h-4 w-4 mr-1" />}
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
                  <AlertDialogAction onClick={() => { toggleContractPause(); toast.success(contractPaused ? "Contract unpaused" : "Contract paused"); }}>
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
                  <Button size="sm" variant="outline" onClick={() => { updateFeeBps(parseInt(newFeeBps)); toast.success("Fee updated"); }}>
                    Update
                  </Button>
                </div>
              </div>

              {/* Fee Recipient */}
              <div className="space-y-2">
                <p className="text-body font-medium text-foreground">Fee Recipient</p>
                <div className="flex items-center gap-2">
                  <Input value={newFeeRecipient} onChange={(e) => setNewFeeRecipient(e.target.value)} className="font-mono text-caption" />
                  <Button size="sm" variant="outline" onClick={() => { updateFeeRecipient(newFeeRecipient); toast.success("Recipient updated"); }}>
                    Update
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
                    <Button size="sm" variant="destructive" onClick={() => { cancelOwnershipTransfer(); toast.success("Transfer cancelled"); }}>Cancel</Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input placeholder="New owner address" value={transferAddress} onChange={(e) => setTransferAddress(e.target.value)} className="font-mono text-caption" />
                    <Button size="sm" variant="outline" onClick={() => { if (transferAddress) { initiateOwnershipTransfer(transferAddress); toast.success("Transfer initiated"); setTransferAddress(""); } }}>
                      <ArrowRightLeft className="h-4 w-4 mr-1" /> Transfer
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>
      </StaggerItem>

      {/* Merchant Management */}
      <StaggerItem>
      <Card className="card-glow">
        <CardHeader>
          <CardTitle className="text-heading-sm">Merchant Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-hidden">
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
                {merchants.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{m.name}</p>
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
                      {(m.totalVolume / 1e6).toFixed(2)}M
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {!m.isVerified && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { verifyMerchant(m.id); toast.success(`${m.name} verified`); }}>
                            <BadgeCheck className="h-4 w-4 text-success" />
                          </Button>
                        )}
                        {m.isSuspended ? (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { unsuspendMerchant(m.id); toast.success(`${m.name} unsuspended`); }}>
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          </Button>
                        ) : (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { suspendMerchant(m.id); toast.success(`${m.name} suspended`); }}>
                            <Ban className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      </StaggerItem>
    </StaggerContainer>
  );
}
