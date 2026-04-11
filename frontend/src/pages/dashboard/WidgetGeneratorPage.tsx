import { useState, useMemo, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Code2, Copy, Check, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useWalletStore, useSatsToUsd } from "@/stores/wallet-store";
import { formatSbtc } from "@/lib/constants";

type WidgetType = "direct" | "invoice" | "subscription";

export default function WidgetGeneratorPage() {
  const walletAddress = useWalletStore((s) => s.address) || "";
  const satsToUsd = useSatsToUsd();
  const [widgetType, setWidgetType] = useState<WidgetType>("direct");
  const [merchantAddress, setMerchantAddress] = useState(walletAddress);
  const [amount, setAmount] = useState("100000");
  const [memo, setMemo] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [planName, setPlanName] = useState("Standard Plan");
  const [interval, setInterval] = useState("monthly");
  const [theme, setTheme] = useState("dark");
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => clearTimeout(copyTimerRef.current);
  }, []);

  // Sync merchant address when wallet connects
  useEffect(() => {
    if (walletAddress && !merchantAddress) {
      setMerchantAddress(walletAddress);
    }
  }, [walletAddress]);

  const previewUrl = useMemo(() => {
    const base = window.location.origin;
    switch (widgetType) {
      case "direct": {
        const params = new URLSearchParams();
        if (amount) params.set("amount", amount);
        if (memo) params.set("memo", memo);
        if (theme) params.set("theme", theme);
        return `${base}/widget/${merchantAddress}?${params.toString()}`;
      }
      case "invoice":
        return `${base}/widget/invoice/${invoiceId || "INV-XXXX"}`;
      case "subscription": {
        const params = new URLSearchParams();
        if (planName) params.set("plan", planName);
        if (amount) params.set("amount", amount);
        if (interval) params.set("interval", interval);
        return `${base}/widget/subscribe/${merchantAddress}?${params.toString()}`;
      }
    }
  }, [widgetType, merchantAddress, amount, memo, invoiceId, planName, interval, theme]);

  const embedCode = `<iframe src="${previewUrl}" width="100%" height="520" frameborder="0" style="border-radius:12px;overflow:hidden;max-width:420px;" allow="clipboard-write"></iframe>`;

  const copyEmbed = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      toast.success("Embed code copied");
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy embed code");
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-heading-lg text-foreground flex items-center gap-2">
          <Code2 className="h-6 w-6 text-primary" /> Widget Generator
        </h1>
        <p className="text-body-sm text-muted-foreground mt-1">
          Create embeddable payment widgets for your website
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-heading-sm">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={widgetType} onValueChange={(v) => setWidgetType(v as WidgetType)}>
              <TabsList className="w-full flex-wrap">
                <TabsTrigger value="direct" className="flex-1 min-w-0 text-xs sm:text-body-sm">Direct Pay</TabsTrigger>
                <TabsTrigger value="invoice" className="flex-1 min-w-0 text-xs sm:text-body-sm">Invoice</TabsTrigger>
                <TabsTrigger value="subscription" className="flex-1 min-w-0 text-xs sm:text-body-sm">Subscribe</TabsTrigger>
              </TabsList>

              <TabsContent value="direct" className="space-y-3 mt-4">
                <div className="space-y-1">
                  <label className="text-caption text-muted-foreground">Merchant Address</label>
                  <Input value={merchantAddress} onChange={(e) => setMerchantAddress(e.target.value)} className="font-mono text-caption" />
                </div>
                <div className="space-y-1">
                  <label className="text-caption text-muted-foreground">Default Amount (sats)</label>
                  <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-tabular" />
                  {amount && Number(amount) > 0 && (
                    <p className="text-caption text-muted-foreground">{formatSbtc(Number(amount))} sBTC ≈ ${satsToUsd(Number(amount))} USD</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-caption text-muted-foreground">Memo</label>
                  <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Optional memo" />
                </div>
                <div className="space-y-1">
                  <label className="text-caption text-muted-foreground">Theme</label>
                  <Select value={theme} onValueChange={setTheme}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="light">Light</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              <TabsContent value="invoice" className="space-y-3 mt-4">
                <div className="space-y-1">
                  <label className="text-caption text-muted-foreground">Invoice ID</label>
                  <Input value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} placeholder="INV-XXXX" className="font-mono" />
                </div>
              </TabsContent>

              <TabsContent value="subscription" className="space-y-3 mt-4">
                <div className="space-y-1">
                  <label className="text-caption text-muted-foreground">Merchant Address</label>
                  <Input value={merchantAddress} onChange={(e) => setMerchantAddress(e.target.value)} className="font-mono text-caption" />
                </div>
                <div className="space-y-1">
                  <label className="text-caption text-muted-foreground">Plan Name</label>
                  <Input value={planName} onChange={(e) => setPlanName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-caption text-muted-foreground">Amount (sats)</label>
                  <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-tabular" />
                  {amount && Number(amount) > 0 && (
                    <p className="text-caption text-muted-foreground">{formatSbtc(Number(amount))} sBTC ≈ ${satsToUsd(Number(amount))} USD</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-caption text-muted-foreground">Interval</label>
                  <Select value={interval} onValueChange={setInterval}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Preview & Embed */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-heading-sm flex items-center gap-2">
                <Eye className="h-4 w-4" /> Live Preview
              </CardTitle>
              <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-caption text-primary transition-colors hover:underline">
                Open ↗
              </a>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border overflow-hidden bg-background">
                <iframe src={previewUrl} className="w-full h-[320px] sm:h-[400px] md:h-[480px]" title="Widget preview" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-heading-sm">Embed Code</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <pre className={cn("rounded-lg bg-muted p-3 text-caption font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all transition-colors duration-300", copied && "bg-primary/10 ring-1 ring-primary/30")}>
                {embedCode}
              </pre>
              <Button variant="outline" className="gap-2" onClick={copyEmbed}>
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied!" : "Copy Embed Code"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
