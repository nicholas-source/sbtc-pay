import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInvoiceStore } from "@/stores/invoice-store";
import { useWalletStore } from "@/stores/wallet-store";
import { toast } from "sonner";
import { createInvoice as createInvoiceOnChain, waitForTransaction, CONTRACT_LIMITS } from "@/lib/stacks/contract";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

import { humanToBaseUnits, amountToUsd, tokenLabel } from "@/lib/constants";
import { useSatsToUsd, useLivePrices } from "@/stores/wallet-store";
import type { TokenType } from "@/lib/stacks/config";

const MIN_AMOUNT = 0.00001;
const MAX_AMOUNT = 21;

const schema = z.object({
  amount: z.coerce.number()
    .positive("Amount must be greater than 0")
    .min(MIN_AMOUNT, `Minimum amount is ${MIN_AMOUNT}`)
    .max(MAX_AMOUNT, `Maximum amount is ${MAX_AMOUNT}`),
  memo: z.string().max(CONTRACT_LIMITS.MEMO, `Max ${CONTRACT_LIMITS.MEMO} characters`).optional().default(""),
  referenceId: z.string().max(CONTRACT_LIMITS.REFERENCE_ID, `Max ${CONTRACT_LIMITS.REFERENCE_ID} characters`).optional().default(""),
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
  const { btcPriceUsd, stxPriceUsd } = useLivePrices();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expirationPreset, setExpirationPreset] = useState("7d");
  const [customDate, setCustomDate] = useState<Date>();
  const [tokenType, setTokenType] = useState<TokenType>('sbtc');
  const fetchInvoices = useInvoiceStore((s) => s.fetchInvoices);
  const createInvoiceLocal = useInvoiceStore((s) => s.createInvoice);
  const backfillFromChain = useInvoiceStore((s) => s.backfillFromChain);
  const walletAddress = useWalletStore((s) => s.address);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { amount: undefined as unknown as number, memo: "", referenceId: "", allowPartial: false, allowOverpay: false },
  });

  const watchAmount = form.watch("amount");
  const baseAmount = watchAmount && watchAmount > 0 ? humanToBaseUnits(watchAmount, tokenType) : 0;
  const usdValue = baseAmount > 0 ? amountToUsd(baseAmount, tokenType, btcPriceUsd, stxPriceUsd) : null;

  async function onSubmit(data: FormValues) {
    if (!walletAddress) {
      toast.error("Wallet not connected");
      return;
    }

    const amountInBaseUnits = humanToBaseUnits(data.amount, tokenType);
    const expiresInBlocks = presetToBlocks(expirationPreset, customDate);

    setIsSubmitting(true);
    try {
      toast.info("Please confirm the transaction in your wallet");

      const { txId } = await createInvoiceOnChain({
        amount: BigInt(amountInBaseUnits),
        memo: data.memo || "",
        referenceId: data.referenceId || undefined,
        expiresInBlocks,
        allowPartial: data.allowPartial,
        allowOverpay: data.allowOverpay,
        tokenType,
      });

      // Immediately add optimistic invoice to the store so it's visible
      const optimistic = createInvoiceLocal({
        amount: amountInBaseUnits,
        memo: data.memo || "",
        referenceId: data.referenceId || "",
        allowPartial: data.allowPartial,
        allowOverpay: data.allowOverpay,
        merchantAddress: walletAddress,
        tokenType,
        txId,
      });
      const optimisticId = optimistic.id;

      toast.success("Invoice created!", {
        description: "Waiting for on-chain confirmation...",
      });
      setOpen(false);
      form.reset();
      setExpirationPreset("7d");
      setCustomDate(undefined);
      setTokenType('sbtc');

      // Monitor the transaction in background, then refresh real data from Supabase
      waitForTransaction(txId, 90, 10000).then(async (result) => {
        if (result.status === 'success') {
          toast.success("Invoice confirmed on-chain!");
          // Backfill: parse tx to get on-chain ID, insert into Supabase if chainhook missed it
          if (walletAddress) {
            await backfillFromChain(txId, optimisticId, walletAddress);
          }
        } else if (result.status === 'failed') {
          toast.error("Invoice transaction failed on-chain", {
            description: "The optimistic invoice will be replaced on next refresh.",
          });
        }
        // Also try to refresh from Supabase with delays for chainhook indexing
        if (walletAddress) {
          for (const delay of [5_000, 15_000, 30_000]) {
            await new Promise((r) => setTimeout(r, delay));
            await fetchInvoices(walletAddress);
          }
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create invoice";
      toast.error("Invoice creation failed", { description: message });
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
          <DialogDescription>Fill in the details to generate a new payment invoice.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="amount" render={({ field }) => (
              <FormItem>
                <FormLabel>Amount ({tokenLabel(tokenType)})</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input type="number" step={tokenType === 'stx' ? '0.000001' : '0.00000001'} placeholder="0.001" {...field} className="font-mono pr-20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
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

            {/* Token Type Selector */}
            <div>
              <label className="text-sm font-medium">Token</label>
              <Select value={tokenType} onValueChange={(v) => setTokenType(v as TokenType)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sbtc">sBTC</SelectItem>
                  <SelectItem value="stx">STX</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <FormField control={form.control} name="memo" render={({ field }) => (
              <FormItem>
                <FormLabel>Memo <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                <FormControl><Textarea placeholder="Payment for..." maxLength={CONTRACT_LIMITS.MEMO} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="referenceId" render={({ field }) => (
              <FormItem>
                <FormLabel>Reference ID <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                <FormControl><Input placeholder="ORDER-1234" maxLength={CONTRACT_LIMITS.REFERENCE_ID} {...field} /></FormControl>
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
