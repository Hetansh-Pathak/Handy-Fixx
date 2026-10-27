import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProvider } from '@/contexts/ProviderContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion } from 'framer-motion';
import { Bell, Briefcase, Star, DollarSign, XCircle, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

const typeIcons: Record<string, any> = {
  new_booking: Briefcase,
  booking_cancelled: XCircle,
  new_review: Star,
  payment: DollarSign,
};

const Notifications: React.FC = () => {
  const { provider, refreshUnreadCount } = useProvider();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');

  const fetchNotifications = useCallback(async () => {
    if (!provider) return;
    const { data } = await supabase
      .from('provider_notifications')
      .select('*')
      .eq('provider_id', provider.id)
      .order('created_at', { ascending: false });
    setNotifications(data || []);
  }, [provider]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  useEffect(() => {
    if (!provider) return;
    const channel = supabase.channel('notifications-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'provider_notifications',
          filter: `provider_id=eq.${provider.id}` }, () => fetchNotifications())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [provider, fetchNotifications]);

  const handleClick = async (n: any) => {
    if (!n.is_read) {
      await supabase.from('provider_notifications').update({ is_read: true }).eq('id', n.id);
      fetchNotifications();
      refreshUnreadCount();
    }
    if (n.type === 'new_booking' || n.type === 'booking_cancelled') navigate('/provider-panel/bookings');
    else if (n.type === 'new_review') navigate('/provider-panel/reviews');
    else if (n.type === 'payment') navigate('/provider-panel/earnings');
  };

  const markAllRead = async () => {
    if (!provider) return;
    await supabase.from('provider_notifications').update({ is_read: true }).eq('provider_id', provider.id).eq('is_read', false);
    fetchNotifications();
    refreshUnreadCount();
    toast({ title: 'All notifications marked as read ✅' });
  };

  const filtered = notifications.filter(n => {
    if (filter === 'unread') return !n.is_read;
    if (filter === 'all') return true;
    return n.type === filter;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread">Unread</TabsTrigger>
            <TabsTrigger value="new_booking">Bookings</TabsTrigger>
            <TabsTrigger value="new_review">Reviews</TabsTrigger>
            <TabsTrigger value="payment">Payments</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="ghost" size="sm" onClick={markAllRead} className="text-xs text-muted-foreground">
          <CheckCheck className="h-3.5 w-3.5 mr-1" /> Mark all read
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card className="glass-card p-8 text-center text-muted-foreground">
          <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
          No notifications
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((n, i) => {
            const Icon = typeIcons[n.type] || Bell;
            return (
              <motion.div key={n.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Card
                  className={cn("glass-card p-4 cursor-pointer transition-colors hover:bg-secondary/30", !n.is_read && "border-l-2 border-l-primary")}
                  onClick={() => handleClick(n)}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0",
                      n.type === 'new_booking' ? 'bg-primary/20 text-primary' :
                      n.type === 'booking_cancelled' ? 'bg-destructive/20 text-destructive' :
                      n.type === 'new_review' ? 'bg-warning/20 text-warning' :
                      'bg-success/20 text-success'
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className={cn("font-medium text-sm", !n.is_read && "text-foreground")}>{n.title}</p>
                        <span className="text-[10px] text-muted-foreground ml-2 shrink-0">
                          {new Date(n.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {n.message && <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>}
                    </div>
                    {!n.is_read && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Notifications;
