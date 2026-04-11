import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useMerchantStore } from "@/stores/merchant-store";
import { CONTRACT_LIMITS } from "@/lib/stacks/contract";
import { Loader2, Store } from "lucide-react";
import { toast } from "sonner";

const schema = z.object({
  name: z.string().trim()
    .min(2, "Business name must be at least 2 characters")
    .max(CONTRACT_LIMITS.MERCHANT_NAME, `Business name must be ${CONTRACT_LIMITS.MERCHANT_NAME} characters or less`),
  description: z.string().trim()
    .max(CONTRACT_LIMITS.DESCRIPTION, `Description must be ${CONTRACT_LIMITS.DESCRIPTION} characters or less`)
    .optional().default(""),
  logoUrl: z.string().trim()
    .max(CONTRACT_LIMITS.LOGO_URL, `Logo URL must be ${CONTRACT_LIMITS.LOGO_URL} characters or less`)
    .url("Must be a valid URL").or(z.literal("")).default(""),
  webhookUrl: z.string().trim()
    .max(CONTRACT_LIMITS.WEBHOOK_URL, `Webhook URL must be ${CONTRACT_LIMITS.WEBHOOK_URL} characters or less`)
    .url("Must be a valid URL").or(z.literal("")).default(""),
});

type FormValues = z.infer<typeof schema>;

export default function MerchantRegistration() {
  const { registerMerchant, isRegistering } = useMerchantStore();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "", logoUrl: "", webhookUrl: "" },
  });

  const onSubmit = async (data: FormValues) => {
    try {
      await registerMerchant({
        name: data.name,
        description: data.description ?? "",
        logoUrl: data.logoUrl ?? "",
        webhookUrl: data.webhookUrl ?? "",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Registration failed";
      toast.error("Registration failed", { description: message });
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[50vh] sm:min-h-[60vh] px-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Store className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-heading-lg">Register as Merchant</CardTitle>
          <CardDescription className="text-body-sm">
            Set up your merchant profile to start accepting sBTC payments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isRegistering ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground animate-pulse">Submitting to blockchain...</p>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex justify-between">
                        <FormLabel>Business Name *</FormLabel>
                        <span className="text-xs text-muted-foreground">{field.value?.length ?? 0}/{CONTRACT_LIMITS.MERCHANT_NAME}</span>
                      </div>
                      <FormControl>
                        <Input placeholder="Acme Inc." maxLength={CONTRACT_LIMITS.MERCHANT_NAME} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex justify-between">
                        <FormLabel>Description</FormLabel>
                        <span className="text-xs text-muted-foreground">{field.value?.length ?? 0}/{CONTRACT_LIMITS.DESCRIPTION}</span>
                      </div>
                      <FormControl>
                        <Textarea placeholder="Tell customers about your business..." rows={3} maxLength={CONTRACT_LIMITS.DESCRIPTION} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="logoUrl"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex justify-between">
                        <FormLabel>Logo URL</FormLabel>
                        <span className="text-xs text-muted-foreground">{field.value?.length ?? 0}/{CONTRACT_LIMITS.LOGO_URL}</span>
                      </div>
                      <FormControl>
                        <Input placeholder="https://example.com/logo.png" maxLength={CONTRACT_LIMITS.LOGO_URL} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="webhookUrl"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex justify-between">
                        <FormLabel>Webhook URL</FormLabel>
                        <span className="text-xs text-muted-foreground">{field.value?.length ?? 0}/{CONTRACT_LIMITS.WEBHOOK_URL}</span>
                      </div>
                      <FormControl>
                        <Input placeholder="https://api.example.com/webhooks/sbtc" maxLength={CONTRACT_LIMITS.WEBHOOK_URL} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" size="lg">
                  Register Merchant
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
