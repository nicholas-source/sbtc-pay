import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useMerchantStore, type NotificationSettings, type NotificationEvents } from "@/stores/merchant-store";
import { CONTRACT_LIMITS } from "@/lib/stacks/contract";
import { Loader2, ShieldCheck, Copy, Bell } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import NotificationHistory from "@/components/settings/NotificationHistory";

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

function SettingsPage() {
  const { profile, updateProfile, updateNotifications, clearProfile } = useMerchantStore();
  const [saving, setSaving] = useState(false);
  const [savingNotif, setSavingNotif] = useState(false);
  const [notifEmail, setNotifEmail] = useState(profile?.notifications?.email ?? "");
  const [notifWebhook, setNotifWebhook] = useState(profile?.notifications?.webhookUrl ?? "");
  const [notifEvents, setNotifEvents] = useState<NotificationEvents>(
    profile?.notifications?.events ?? { renewal: true, cancellation: true, failedPayment: true, newSubscriber: true, pauseResume: true }
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: profile?.name ?? "",
      description: profile?.description ?? "",
      logoUrl: profile?.logoUrl ?? "",
      webhookUrl: profile?.webhookUrl ?? "",
    },
  });

  // Keep form in sync when profile data is (re)loaded from on-chain
  useEffect(() => {
    if (profile) {
      form.reset({
        name: profile.name,
        description: profile.description ?? "",
        logoUrl: profile.logoUrl ?? "",
        webhookUrl: profile.webhookUrl ?? "",
      });
    }
  }, [profile?.name, profile?.description, profile?.logoUrl, profile?.webhookUrl]);

  if (!profile) {
    return (
      <div>
        <h1 className="text-heading-lg text-foreground">Settings</h1>
        <p className="text-body-sm text-muted-foreground mt-1">You need to register as a merchant before you can update settings.</p>
      </div>
    );
  }

  const onSubmit = async (data: FormValues) => {
    setSaving(true);
    try {
      await updateProfile(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update failed";
      toast.error("Profile update failed", { description: message });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    // Validate email if provided
    const trimmedEmail = notifEmail.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("Invalid email address");
      return;
    }
    // Validate webhook URL if provided
    const trimmedWebhook = notifWebhook.trim();
    if (trimmedWebhook) {
      try {
        const url = new URL(trimmedWebhook);
        if (!['http:', 'https:'].includes(url.protocol)) {
          toast.error("Webhook URL must use http or https");
          return;
        }
      } catch {
        toast.error("Invalid webhook URL");
        return;
      }
    }
    setSavingNotif(true);
    try {
      await updateNotifications({ email: trimmedEmail, webhookUrl: trimmedWebhook, events: notifEvents });
      toast.success("Notification settings saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save notification settings";
      toast.error(message);
    } finally {
      setSavingNotif(false);
    }
  };

  const toggleEvent = (key: keyof NotificationEvents) => {
    setNotifEvents((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const eventToggles: { key: keyof NotificationEvents; label: string; description: string }[] = [
    { key: "renewal", label: "Renewal Processed", description: "Notify when a recurring payment is successfully collected" },
    { key: "cancellation", label: "Subscription Cancelled", description: "Notify when a subscriber cancels their plan" },
    { key: "failedPayment", label: "Payment Failed", description: "Notify when a payment attempt fails" },
    { key: "newSubscriber", label: "New Subscriber", description: "Notify when someone subscribes to a plan" },
    { key: "pauseResume", label: "Pause / Resume", description: "Notify when a subscriber pauses or resumes" },
  ];

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(profile.id);
      toast.success("Merchant ID copied");
    } catch {
      toast.error("Couldn't copy the Merchant ID. Check your browser permissions.");
    }
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-heading-lg text-foreground">Settings</h1>
        <p className="text-body-sm text-muted-foreground mt-1">Manage your merchant profile.</p>
      </div>

      {/* Profile Header */}
      <Card>
        <CardContent className="flex items-center gap-4 pt-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg">
            {profile.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-heading-sm text-foreground truncate">{profile.name}</h2>
              {profile.isVerified && (
                <Badge variant="secondary" className="gap-1">
                  <ShieldCheck className="h-3 w-3" /> Verified
                </Badge>
              )}
            </div>
            <button
              onClick={copyId}
              className="flex items-center gap-1 text-caption text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="font-mono-nums">{profile.id}</span>
              <Copy className="h-3 w-3" />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Edit Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-heading-sm">Profile Details</CardTitle>
          <CardDescription>Update your merchant information.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <div className="flex justify-between">
                    <FormLabel>Business Name</FormLabel>
                    <span className="text-xs text-muted-foreground">{field.value?.length ?? 0}/{CONTRACT_LIMITS.MERCHANT_NAME}</span>
                  </div>
                  <FormControl><Input maxLength={CONTRACT_LIMITS.MERCHANT_NAME} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <div className="flex justify-between">
                    <FormLabel>Description</FormLabel>
                    <span className="text-xs text-muted-foreground">{field.value?.length ?? 0}/{CONTRACT_LIMITS.DESCRIPTION}</span>
                  </div>
                  <FormControl><Textarea rows={3} maxLength={CONTRACT_LIMITS.DESCRIPTION} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="logoUrl" render={({ field }) => (
                <FormItem>
                  <div className="flex justify-between">
                    <FormLabel>Logo URL</FormLabel>
                    <span className="text-xs text-muted-foreground">{field.value?.length ?? 0}/{CONTRACT_LIMITS.LOGO_URL}</span>
                  </div>
                  <FormControl><Input maxLength={CONTRACT_LIMITS.LOGO_URL} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="webhookUrl" render={({ field }) => (
                <FormItem>
                  <div className="flex justify-between">
                    <FormLabel>Webhook URL</FormLabel>
                    <span className="text-xs text-muted-foreground">{field.value?.length ?? 0}/{CONTRACT_LIMITS.WEBHOOK_URL}</span>
                  </div>
                  <FormControl><Input maxLength={CONTRACT_LIMITS.WEBHOOK_URL} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Save Changes
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-heading-sm flex items-center gap-2">
            <Bell className="h-5 w-5" /> Notifications
          </CardTitle>
          <CardDescription>Configure alerts for subscription events.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div>
              <Label htmlFor="notif-email">Email Address</Label>
              <Input
                id="notif-email"
                type="email"
                placeholder="notifications@example.com"
                value={notifEmail}
                onChange={(e) => setNotifEmail(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="notif-webhook">Webhook URL</Label>
              <Input
                id="notif-webhook"
                type="url"
                placeholder="https://example.com/webhook"
                value={notifWebhook}
                onChange={(e) => setNotifWebhook(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <Separator />
          <div className="space-y-3">
            {eventToggles.map(({ key, label, description }) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-caption text-muted-foreground">{description}</p>
                </div>
                <Switch checked={notifEvents[key]} onCheckedChange={() => toggleEvent(key)} disabled={savingNotif} />
              </div>
            ))}
          </div>
          <Separator />
          <Button onClick={handleSaveNotifications} disabled={savingNotif}>
            {savingNotif && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save Notification Settings
          </Button>
        </CardContent>
      </Card>

      {/* Notification History */}
      <NotificationHistory />

      {/* Danger Zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-heading-sm text-destructive">Danger Zone</CardTitle>
          <CardDescription>Irreversible actions for your merchant account.</CardDescription>
        </CardHeader>
        <CardContent>
          <Separator className="mb-4" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Disconnect Merchant</p>
              <p className="text-caption text-muted-foreground">Remove your merchant profile entirely.</p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">Disconnect</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect your merchant profile?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove your merchant profile and all settings. You'll need to re-register to accept payments again.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep Profile</AlertDialogCancel>
                  <AlertDialogAction onClick={clearProfile}>Disconnect</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
export default SettingsPage;
