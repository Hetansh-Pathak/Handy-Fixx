import React, { useEffect, useState } from 'react';
import { useProvider } from '@/contexts/ProviderContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { motion } from 'framer-motion';
import { Bell, Lock, AlertTriangle } from 'lucide-react';

const prefItems = [
  { key: 'new_booking', label: 'New Bookings', desc: 'When a customer books your service' },
  { key: 'booking_update', label: 'Booking Updates', desc: 'Status changes on your bookings' },
  { key: 'reviews', label: 'Reviews', desc: 'When customers leave a review' },
  { key: 'payments', label: 'Payments', desc: 'Earnings and payout updates' },
  { key: 'marketing', label: 'Promotions', desc: 'Tips, offers, and platform news' },
];

const ProviderSettings: React.FC = () => {
  const { provider, refreshProvider } = useProvider();
  const { signOut } = useAuth();
  const { toast } = useToast();

  const [prefs, setPrefs] = useState({
    new_booking: true, booking_update: true, reviews: true, payments: true, marketing: false,
  });

  useEffect(() => {
    if (provider?.notification_preferences) {
      const np = provider.notification_preferences as unknown as Record<string, boolean>;
      setPrefs({
        new_booking: np.new_booking ?? true,
        booking_update: np.booking_update ?? true,
        reviews: np.reviews ?? true,
        payments: np.payments ?? true,
        marketing: np.marketing ?? false,
      });
    }
  }, [provider]);

  const updatePref = async (key: string, value: boolean) => {
    if (!provider) return;
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    await supabase.from('service_providers').update({ notification_preferences: updated }).eq('id', provider.id);
  };

  const handleChangePassword = async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(
      provider?.email || '',
      { redirectTo: `${window.location.origin}/reset-password` }
    );
    if (!error) toast({ title: 'Reset email sent 📧', description: 'Check your inbox for password reset link.' });
    else toast({ title: 'Error', description: error.message, variant: 'destructive' });
  };

  const handleDeactivate = async () => {
    if (!provider) return;
    await supabase.from('service_providers').update({ status: 'inactive' }).eq('id', provider.id);
    toast({ title: 'Account deactivated', description: 'Contact support to reactivate.' });
    await signOut();
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Notification Preferences */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="glass-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Notification Preferences</h3>
          </div>
          <div className="space-y-4">
            {prefItems.map(item => (
              <div key={item.key} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <Switch
                  checked={prefs[item.key as keyof typeof prefs]}
                  onCheckedChange={v => updatePref(item.key, v)}
                  className="data-[state=checked]:bg-success"
                />
              </div>
            ))}
          </div>
        </Card>
      </motion.div>

      {/* Security */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="glass-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Security</h3>
          </div>
          <Button variant="outline" onClick={handleChangePassword}>
            Change Password
          </Button>
        </Card>
      </motion.div>

      {/* Danger Zone */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="glass-card p-4 border-destructive/30">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h3 className="font-semibold text-destructive">Danger Zone</h3>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10">
                Deactivate Account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-card border-border">
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your account will be deactivated. You won't receive new bookings. This can be reversed by contacting support.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeactivate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Yes, Deactivate
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Card>
      </motion.div>
    </div>
  );
};

export default ProviderSettings;
