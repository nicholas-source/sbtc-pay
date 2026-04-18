import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useSubscriptionStore } from "@/stores/subscription-store";
import { CONTRACT_LIMITS } from "@/lib/stacks/contract";

const schema = z.object({
  name: z.string().min(1, "Plan name is required").max(CONTRACT_LIMITS.SUBSCRIPTION_NAME, `Max ${CONTRACT_LIMITS.SUBSCRIPTION_NAME} characters`),
  description: z.string().max(CONTRACT_LIMITS.DESCRIPTION, `Max ${CONTRACT_LIMITS.DESCRIPTION} characters`).optional().default(""),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  interval: z.enum(["weekly", "monthly", "yearly"]),
});

type FormValues = z.infer<typeof schema>;

import { amountToUsd, tokenLabel, humanToBaseUnits } from "@/lib/constants";
import { useLivePrices } from "@/stores/wallet-store";
import type { TokenType } from "@/lib/stacks/config";

export default function CreatePlanDialog() {
  const [open, setOpen] = useState(false);
  const [tokenType, setTokenType] = useState<TokenType>("sbtc");
  const { btcPriceUsd, stxPriceUsd } = useLivePrices();
  const createPlan = useSubscriptionStore((s) => s.createPlan);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "", amount: 0, interval: "monthly" },
  });

  const amount = form.watch("amount");
  const usdEstimate = amount ? amountToUsd(humanToBaseUnits(amount, tokenType), tokenType, btcPriceUsd, stxPriceUsd) : "0.00";

  function onSubmit(data: FormValues) {
    try {
      createPlan({
        name: data.name,
        description: data.description || "",
        amount: humanToBaseUnits(data.amount, tokenType),
        interval: data.interval,
        tokenType,
      });
      toast.success("Subscription plan created");
      form.reset();
      setTokenType("sbtc");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create plan");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" /> Create Plan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Subscription Plan</DialogTitle>
          <DialogDescription>Set up a recurring payment plan for your subscribers.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plan Name</FormLabel>
                  <FormControl><Input placeholder="e.g. Pro Hosting" maxLength={CONTRACT_LIMITS.SUBSCRIPTION_NAME} {...field} /></FormControl>
                  <p className="text-xs text-muted-foreground text-right">{field.value?.length || 0}/{CONTRACT_LIMITS.SUBSCRIPTION_NAME}</p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Textarea placeholder="What's included…" className="resize-none" maxLength={CONTRACT_LIMITS.DESCRIPTION} {...field} /></FormControl>
                  <p className="text-xs text-muted-foreground text-right">{field.value?.length || 0}/{CONTRACT_LIMITS.DESCRIPTION}</p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-2">
              <FormLabel>Token</FormLabel>
              <Select value={tokenType} onValueChange={(v) => setTokenType(v as TokenType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sbtc">sBTC</SelectItem>
                  <SelectItem value="stx">STX</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount ({tokenLabel(tokenType)})</FormLabel>
                  <FormControl><Input type="number" step={tokenType === 'stx' ? '0.000001' : '0.00000001'} placeholder={tokenType === 'stx' ? '50' : '0.001'} {...field} /></FormControl>
                  {amount > 0 && (
                    <p className="text-caption text-muted-foreground">≈ ${usdEstimate} USD</p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="interval"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Billing Interval</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">Create Plan</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
