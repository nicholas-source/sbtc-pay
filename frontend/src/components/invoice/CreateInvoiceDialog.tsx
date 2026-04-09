import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addHours, addDays } from "date-fns";
import { format } from "date-fns";
import { CalendarIcon, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInvoiceStore } from "@/stores/invoice-store";
import { useWalletStore } from "@/stores/wallet-store";
import { toast } from "sonner";
import { createInvoice as createInvoiceOnChain, waitForTransaction } from "@/lib/stacks/contract";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

import { sbtcToSats, formatSbtc } from "@/lib/constants";
import { useSatsToUsd } from "@/stores/wallet-store";

const MIN_SBTC = 0.00001; // 1000 sats — contract minimum
const MAX_SBTC = 21; // 21 sBTC — reasonable upper bound

const schema = z.object({
  amount: z.coerce.number()
    .positive("Amount must be greater than 0")
    .min(MIN_SBTC, `Minimum amount is ${MIN_SBTC} sBTC`)
    .max(MAX_SBTC, `Maximum amount is ${MAX_SBTC} sBTC`),
  memo: z.string().max(200, "Max 200 characters").optional().default(""),
  referenceId: z.string().max(50, "Max 50 characters").optional().default(""),
  allowPartial: z.boolean().default(false),
  allowOverpay: z.boolean().default(false),
});

type FormValues = z.infer<typeof schema>;

const expirationPresets = [
  { label: "1 hour", value: "1h" },
  { label: "24 hours", value: "24h" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "1 year", value: "365d" },
  { label: "Custom", value: "custom" },
  { label: "Never", value: "never" },
];

function getExpirationDate(preset: string): Date | null {
  const now = new Date();
  switch (preset) {
    case "1h": return addHours(now, 1);
    case "24h": return addHours(now, 24);
    case "7d": return addDays(now, 7);
    case "30d": return addDays(now, 30);
    case "365d": return addDays(now, 365);
    case "never": return null;
    default: return null;
  }
}

/** Convert expiration preset to approximate Stacks blocks (~10 min/block on testnet) */
function presetToBlocks(preset: string, customDate?: Date): number {
  const BLOCKS_PER_HOUR = 6; // ~10 min/block
  switch (preset) {
    case "1h": return BLOCKS_PER_HOUR;
    case "24h": return BLOCKS_PER_HOUR * 24;
    case "7d": return BLOCKS_PER_HOUR * 24 * 7;
    case "30d": return BLOCKS_PER_HOUR * 24 * 30;
    case "365d": return BLOCKS_PER_HOUR * 24 * 365;
    case "never": return 0;
    case "custom": {
      if (!customDate) return 0;
      const hoursUntil = Math.max(1, (customDate.getTime() - Date.now()) / (1000 * 60 * 60));
      return Math.ceil(hoursUntil * BLOCKS_PER_HOUR);
    }
    default: return 0;
  }
}

export default function CreateInvoiceDialog() {
  const satsToUsd = useSatsToUsd();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expirationPreset, setExpirationPreset] = useState("7d");
  const [customDate, setCustomDate] = useState<Date>();
  const fetchInvoices = useInvoiceStore((s) => s.fetchInvoices);
  const walletAddress = useWalletStore((s) => s.address);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { amount: undefined as unknown as number, memo: "", referenceId: "", allowPartial: false, allowOverpay: false },
  });

  const watchAmount = form.watch("amount");
  const satsAmount = watchAmount && watchAmount > 0 ? sbtcToSats(watchAmount) : 0;
  const usdValue = satsAmount > 0 ? satsToUsd(satsAmount) : null;

  async function onSubmit(data: FormValues) {
    const amountInSats = sbtcToSats(data.amount);
    const expiresInBlocks = presetToBlocks(expirationPreset, customDate);

    setIsSubmitting(true);
    try {
      toast.info("Please confirm the transaction in your wallet");

      const { txId } = await createInvoiceOnChain({
        amount: BigInt(amountInSats),
        memo: data.memo || "",
        referenceId: data.referenceId || undefined,
        expiresInBlocks,
        allowPartial: data.allowPartial,
        allowOverpay: data.allowOverpay,
      });

      toast.success("Transaction submitted", { description: "Waiting for confirmation..." });
      setOpen(false);
      form.reset();
      setExpirationPreset("7d");
      setCustomDate(undefined);

      // Wait for on-chain confirmation, then refresh from Supabase
      const result = await waitForTransaction(txId);
      if (result.status === "success") {
        toast.success("Invoice created on-chain!");
        // Give chainhook a moment to index, then refresh
        if (walletAddress) {
          setTimeout(() => fetchInvoices(walletAddress), 5000);
          setTimeout(() => fetchInvoices(walletAddress), 15000);
        }
      } else if (result.status === "failed") {
        toast.error("Invoice transaction failed on-chain");
      } else {
        toast.info("Transaction still pending. Invoices will update once confirmed.");
        if (walletAddress) {
          setTimeout(() => fetchInvoices(walletAddress), 30000);
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create invoice");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" />Create Invoice</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Invoice</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="amount" render={({ field }) => (
              <FormItem>
                <FormLabel>Amount (sBTC)</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input type="number" step="0.00000001" placeholder="0.001" {...field} className="font-mono pr-20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                    {usdValue && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                        ≈ ${usdValue}
                      </span>
                    )}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="memo" render={({ field }) => (
              <FormItem>
                <FormLabel>Memo <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                <FormControl><Textarea placeholder="Payment for..." maxLength={200} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="referenceId" render={({ field }) => (
              <FormItem>
                <FormLabel>Reference ID <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                <FormControl><Input placeholder="ORDER-1234" maxLength={50} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div>
              <label className="text-sm font-medium">Expiration</label>
              <Select value={expirationPreset} onValueChange={setExpirationPreset}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {expirationPresets.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {expirationPreset === "custom" && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("mt-2 w-full justify-start text-left font-normal", !customDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customDate ? format(customDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customDate} onSelect={setCustomDate} disabled={(d) => d < new Date()} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              )}
            </div>

            <div className="flex items-center justify-between gap-4">
              <FormField control={form.control} name="allowPartial" render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  <FormLabel className="cursor-pointer">Allow partial</FormLabel>
                </FormItem>
              )} />
              <FormField control={form.control} name="allowOverpay" render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  <FormLabel className="cursor-pointer">Allow overpay</FormLabel>
                </FormItem>
              )} />
            </div>

            <DialogFooter>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting...</>
                ) : (
                  "Create Invoice"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
