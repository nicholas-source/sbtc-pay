import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addHours, addDays } from "date-fns";
import { format } from "date-fns";
import { CalendarIcon, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInvoiceStore } from "@/stores/invoice-store";
import { toast } from "@/hooks/use-toast";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

import { BTC_USD } from "@/lib/constants";

const schema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than 0"),
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

export default function CreateInvoiceDialog() {
  const [open, setOpen] = useState(false);
  const [expirationPreset, setExpirationPreset] = useState("7d");
  const [customDate, setCustomDate] = useState<Date>();
  const createInvoice = useInvoiceStore((s) => s.createInvoice);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { amount: undefined as unknown as number, memo: "", referenceId: "", allowPartial: false, allowOverpay: false },
  });

  const watchAmount = form.watch("amount");
  const usdValue = watchAmount && watchAmount > 0 ? (watchAmount * BTC_USD).toFixed(2) : null;

  function onSubmit(data: FormValues) {
    const expiresAt = expirationPreset === "custom" ? (customDate ?? null) : getExpirationDate(expirationPreset);
    const invoice = createInvoice({ amount: data.amount, memo: data.memo, referenceId: data.referenceId, allowPartial: data.allowPartial, allowOverpay: data.allowOverpay, expiresAt });
    toast({ title: "Invoice created", description: `${invoice.id} for ${data.amount.toLocaleString()} sats` });
    form.reset();
    setExpirationPreset("7d");
    setCustomDate(undefined);
    setOpen(false);
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
                <FormLabel>Amount (sats)</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input type="number" placeholder="100000" {...field} className="font-mono" />
                    {usdValue && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
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
              <Button type="submit" className="w-full">Create Invoice</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
