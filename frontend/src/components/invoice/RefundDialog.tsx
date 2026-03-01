import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RotateCcw } from "lucide-react";
import type { Invoice } from "@/stores/invoice-store";
import { useInvoiceStore } from "@/stores/invoice-store";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

import { BTC_USD } from "@/lib/constants";

const REASON_PRESETS = [
  "Customer request",
  "Duplicate payment",
  "Service not delivered",
  "Other",
] as const;

interface Props {
  invoice: Invoice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function RefundDialog({ invoice, open, onOpenChange }: Props) {
  const refundInvoice = useInvoiceStore((s) => s.refundInvoice);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [refundType, setRefundType] = useState<"full" | "partial">("full");
  const [reasonPreset, setReasonPreset] = useState<string>("Customer request");

  const schema = z.object({
    amount: z.coerce
      .number()
      .positive("Amount must be positive")
      .max(invoice.amountPaid, `Cannot exceed ${invoice.amountPaid.toLocaleString()} sats`),
    reason: z.string().trim().min(1, "Reason is required").max(200, "Max 200 characters"),
  });

  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: invoice.amountPaid,
      reason: "Customer request",
    },
  });

  const amount = form.watch("amount");
  const usd = (amount * BTC_USD).toFixed(2);

  function handleTypeChange(type: "full" | "partial") {
    setRefundType(type);
    if (type === "full") {
      form.setValue("amount", invoice.amountPaid);
    }
  }

  function handleReasonPreset(preset: string) {
    setReasonPreset(preset);
    if (preset !== "Other") {
      form.setValue("reason", preset);
    } else {
      form.setValue("reason", "");
    }
  }

  function onSubmit() {
    setConfirmOpen(true);
  }

  function handleConfirm() {
    const values = form.getValues();
    const success = refundInvoice(invoice.id, values.amount, values.reason);
    if (success) {
      toast({ title: "Refund processed", description: `${values.amount.toLocaleString()} sats refunded` });
      setConfirmOpen(false);
      onOpenChange(false);
    } else {
      toast({ title: "Refund failed", description: "Invalid refund amount", variant: "destructive" });
      setConfirmOpen(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4" /> Refund {invoice.id}
            </DialogTitle>
            <DialogDescription>
              Available: {invoice.amountPaid.toLocaleString()} sats (${(invoice.amountPaid * BTC_USD).toFixed(2)})
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Type selector */}
              <RadioGroup
                value={refundType}
                onValueChange={(v) => handleTypeChange(v as "full" | "partial")}
                className="flex gap-4"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="full" id="full" />
                  <Label htmlFor="full">Full refund</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="partial" id="partial" />
                  <Label htmlFor="partial">Partial refund</Label>
                </div>
              </RadioGroup>

              {/* Amount */}
              {refundType === "partial" && (
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount (sats)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">${usd} USD</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Reason */}
              <div className="space-y-2">
                <Label>Reason</Label>
                <Select value={reasonPreset} onValueChange={handleReasonPreset}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REASON_PRESETS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {reasonPreset === "Other" && (
                  <FormField
                    control={form.control}
                    name="reason"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Textarea placeholder="Describe the reason…" maxLength={200} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              <Button type="submit" variant="destructive" className="w-full">
                Review Refund
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Confirmation */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Refund</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Invoice: <span className="font-mono font-semibold">{invoice.id}</span></p>
                <p>Amount: <span className="font-mono font-semibold">{amount.toLocaleString()} sats</span> (${usd})</p>
                <p>Reason: {form.getValues("reason")}</p>
                <p className="text-destructive font-medium mt-2">This action cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Process Refund
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
