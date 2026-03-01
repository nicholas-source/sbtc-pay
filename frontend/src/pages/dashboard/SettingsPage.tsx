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
import { Loader2, ShieldCheck, Copy, Bell } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import NotificationHistory from "@/components/settings/NotificationHistory";

const schema = z.object({
  name: z.string().trim().min(2, "Business name must be at least 2 characters").max(80),
  description: z.string().trim().max(500).optional().default(""),
  logoUrl: z.string().trim().url("Must be a valid URL").or(z.literal("")).default(""),
  webhookUrl: z.string().trim().url("Must be a valid URL").or(z.literal("")).default(""),
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

  if (!profile) {
    return (
      <div>
        <h1 className="text-heading-lg text-foreground">Settings</h1>
        <p className="text-body-sm text-muted-foreground mt-1">Register as a merchant first to access settings.</p>
      </div>
    );
  }

  const onSubmit = async (data: FormValues) => {
    setSaving(true);
    await updateProfile(data);
    setSaving(false);
    toast.success("Profile updated successfully");
  };

  const handleSaveNotifications = async () => {
    setSavingNotif(true);
    await updateNotifications({ email: notifEmail, webhookUrl: notifWebhook, events: notifEvents });
    setSavingNotif(false);
    toast.success("Notification settings saved");
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
      toast.error("Failed to copy Merchant ID");
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-heading-lg text-foreground">Settings</h1>
        <p className="text-body-sm text-muted-foreground mt-1">Manage your merchant profile.</p>
      </div>

      {/* Profile Header */}
      <Card className="card-glow">
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
      <Card className="card-glow">
        <CardHeader>
          <CardTitle className="text-heading-sm">Profile Details</CardTitle>
          <CardDescription>Update your merchant information.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Business Name</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Textarea rows={3} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="logoUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>Logo URL</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="webhookUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>Webhook URL</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" disabled={saving} className={saving ? "btn-shimmer" : ""}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Save Changes
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="card-glow">
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
                <Switch checked={notifEvents[key]} onCheckedChange={() => toggleEvent(key)} />
              </div>
            ))}
          </div>
          <Separator />
          <Button onClick={handleSaveNotifications} disabled={savingNotif} className={savingNotif ? "btn-shimmer" : ""}>
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
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove your merchant profile. You will need to re-register to accept payments again.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
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
