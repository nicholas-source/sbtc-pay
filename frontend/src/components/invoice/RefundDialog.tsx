import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RotateCcw } from "lucide-react";
import type { Invoice } from "@/stores/invoice-store";
import { useInvoiceStore } from "@/stores/invoice-store";
import { toast } from "sonner";
import { CONTRACT_LIMITS } from "@/lib/stacks/contract";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

import { formatAmount, baseToHuman, humanToBaseUnits, amountToUsd, tokenLabel } from "@/lib/constants";
import { useSatsToUsd } from "@/stores/wallet-store";

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
  const satsToUsd = useSatsToUsd();
  const refundInvoice = useInvoiceStore((s) => s.refundInvoice);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [refundType, setRefundType] = useState<"full" | "partial">("full");
  const [reasonPreset, setReasonPreset] = useState<string>("Customer request");
  const tt = invoice.tokenType;

  const schema = z.object({
    amount: z.coerce
      .number()
      .positive("Amount must be positive")
      .max(baseToHuman(invoice.amountPaid, tt), `Cannot exceed ${formatAmount(invoice.amountPaid, tt)} ${tokenLabel(tt)}`),
    reason: z.string().trim().min(1, "Reason is required").max(CONTRACT_LIMITS.REASON, `Max ${CONTRACT_LIMITS.REASON} characters`),
  });

  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: baseToHuman(invoice.amountPaid, tt),
      reason: "Customer request",
    },
  });

  const amount = form.watch("amount");
  const amountInBaseUnits = humanToBaseUnits(amount, tt);
  const usd = amountToUsd(amountInBaseUnits, tt);

  function handleTypeChange(type: "full" | "partial") {
    setRefundType(type);
    if (type === "full") {
      form.setValue("amount", baseToHuman(invoice.amountPaid, tt));
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

  async function handleConfirm() {
    const values = form.getValues();
    const refundBaseUnits = humanToBaseUnits(values.amount, tt);
    try {
      const success = await refundInvoice(invoice.id, refundBaseUnits, values.reason);
      if (success) {
        toast.success("Refund processed", { description: `${formatAmount(refundBaseUnits, tt)} ${tokenLabel(tt)} refunded` });
        setConfirmOpen(false);
        onOpenChange(false);
      } else {
        toast.error("Refund failed", { description: "Invalid refund amount" });
        setConfirmOpen(false);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Refund failed");
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
              Available: {formatAmount(invoice.amountPaid, tt)} {tokenLabel(tt)} (${amountToUsd(invoice.amountPaid, tt)})
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
                      <FormLabel>Amount ({tokenLabel(tt)})</FormLabel>
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
                <p>Amount: <span className="font-mono font-semibold">{formatAmount(amountInBaseUnits, tt)} {tokenLabel(tt)}</span> (${usd})</p>
                <p>Reason: {form.getValues("reason")}</p>
                <p className="text-destructive font-medium mt-2">This refund is permanent and cannot be reversed.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Process Refund
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
