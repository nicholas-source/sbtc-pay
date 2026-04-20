import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Loader2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInvoiceStore, type Invoice } from "@/stores/invoice-store";
import { toast } from "sonner";
import { CONTRACT_LIMITS } from "@/lib/stacks/contract";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

import { baseToHuman, humanToBaseUnits, amountToUsd, tokenLabel } from "@/lib/constants";
import { useLivePrices } from "@/stores/wallet-store";
import { BURN_BLOCKS_PER_HOUR, type TokenType } from "@/lib/stacks/config";

const TOKEN_LIMITS: Record<TokenType, { min: number; max: number; step: string }> = {
  sbtc: { min: 0.00001, max: 21, step: "0.00000001" },
  stx:  { min: 0.000001, max: 1_000_000, step: "0.000001" },
};

function createSchema(tokenType: TokenType) {
  const { min, max } = TOKEN_LIMITS[tokenType];
  return z.object({
    amount: z.coerce.number()
      .positive("Amount must be greater than 0")
      .min(min, `Minimum amount is ${min}`)
      .max(max, `Maximum amount is ${max.toLocaleString()}`),
    memo: z.string().transform((v) => v.trim()).pipe(z.string().max(CONTRACT_LIMITS.MEMO, `Max ${CONTRACT_LIMITS.MEMO} characters`)).default(""),
  });
}

type FormValues = z.infer<ReturnType<typeof createSchema>>;

const expirationPresets = [
  { label: "1 hour", value: "1h" },
  { label: "24 hours", value: "24h" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "1 year", value: "365d" },
  { label: "Custom", value: "custom" },
  { label: "Never", value: "never" },
];

function presetToBlocks(preset: string, customDate?: Date): number {
  switch (preset) {
    case "1h": return BURN_BLOCKS_PER_HOUR;
    case "24h": return BURN_BLOCKS_PER_HOUR * 24;
    case "7d": return BURN_BLOCKS_PER_HOUR * 24 * 7;
    case "30d": return BURN_BLOCKS_PER_HOUR * 24 * 30;
    case "365d": return BURN_BLOCKS_PER_HOUR * 24 * 365;
    case "never": return 0;
    case "custom": {
      if (!customDate) return 0;
      const hoursUntil = Math.max(1, (customDate.getTime() - Date.now()) / (1000 * 60 * 60));
      return Math.ceil(hoursUntil * BURN_BLOCKS_PER_HOUR);
    }
    default: return 0;
  }
}

interface Props {
  invoice: Invoice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function EditInvoiceDialog({ invoice, open, onOpenChange }: Props) {
  const { btcPriceUsd, stxPriceUsd } = useLivePrices();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expirationPreset, setExpirationPreset] = useState("7d");
  const [customDate, setCustomDate] = useState<Date>();
  const updateInvoice = useInvoiceStore((s) => s.updateInvoice);

  const tt = invoice.tokenType;
  const schema = useMemo(() => createSchema(tt), [tt]);

  const humanAmount = baseToHuman(invoice.amount, tt);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: humanAmount,
      memo: invoice.memo || "",
    },
  });

  const watchAmount = form.watch("amount");
  const baseAmount = watchAmount && watchAmount > 0 ? humanToBaseUnits(watchAmount, tt) : 0;
  const usdValue = baseAmount > 0 ? amountToUsd(baseAmount, tt, btcPriceUsd, stxPriceUsd) : null;

  async function onSubmit(data: FormValues) {
    if (expirationPreset === "custom" && !customDate) {
      toast.error("Please select an expiration date");
      return;
    }

    const amountInBaseUnits = humanToBaseUnits(data.amount, tt);
    const expiresInBlocks = presetToBlocks(expirationPreset, customDate);

    setIsSubmitting(true);
    try {
      await updateInvoice(invoice.id, {
        amount: amountInBaseUnits,
        memo: data.memo || "",
        expiresInBlocks,
      });
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update invoice";
      toast.error("Update failed", { description: message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Invoice {invoice.id}</DialogTitle>
          <DialogDescription>Update amount, memo, or expiration. Requires an on-chain transaction.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-space-md">
            <FormField control={form.control} name="amount" render={({ field }) => (
              <FormItem>
                <FormLabel>Amount ({tokenLabel(tt)})</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input type="number" step={TOKEN_LIMITS[tt].step} {...field} className="font-mono pr-20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
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
                <FormControl><Textarea placeholder="Payment for..." maxLength={CONTRACT_LIMITS.MEMO} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div>
              <label className="text-sm font-medium">New Expiration</label>
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

            <DialogFooter>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting...</>
                ) : (
                  <><Pencil className="mr-2 h-4 w-4" />Update Invoice</>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
