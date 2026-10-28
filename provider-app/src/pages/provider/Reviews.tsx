import React, { useEffect, useState, useCallback } from 'react';
import { useProvider } from '@/contexts/ProviderContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion } from 'framer-motion';
import { Star, MessageSquare } from 'lucide-react';

const Reviews: React.FC = () => {
  const { provider } = useProvider();
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('latest');

  const fetchReviews = useCallback(async () => {
    if (!provider) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('reviews')
      .select('*, bookings(services(name)), profiles!reviews_customer_id_fkey(full_name)')
      .eq('provider_id', provider.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Could not load provider reviews:', error);
      setLoadError(error.message);
      setReviews([]);
    } else {
      setLoadError(null);
      setReviews(data ?? []);
    }
    setLoading(false);
  }, [provider]);

  useEffect(() => { fetchReviews(); }, [fetchReviews]);

  const filtered = reviews
    .filter(r => {
      if (filter === 'all') return true;
      if (filter === '5') return r.rating === 5;
      if (filter === '4') return r.rating === 4;
      if (filter === 'low') return r.rating <= 3;
      if (filter === 'comments') return !!r.comment;
      return true;
    })
    .sort((a, b) => {
      if (sort === 'highest') return b.rating - a.rating;
      if (sort === 'lowest') return a.rating - b.rating;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const ratingBreakdown = [5, 4, 3, 2, 1].map(r => ({
    rating: r,
    count: reviews.filter(rv => rv.rating === r).length,
    pct: reviews.length ? Math.round((reviews.filter(rv => rv.rating === r).length / reviews.length) * 100) : 0,
  }));

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="glass-card p-4 text-center">
          <p className="text-4xl font-bold gold-text">
            {provider?.rating != null ? Number(provider.rating).toFixed(1) : '—'}
          </p>
          {provider?.rating != null && (
            <div className="flex justify-center gap-0.5 my-2">
              {[1, 2, 3, 4, 5].map(s => (
                <Star key={s} className={`h-5 w-5 ${s <= Math.round(Number(provider.rating)) ? 'fill-primary text-primary' : 'text-muted-foreground'}`} />
              ))}
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            {provider?.total_reviews != null ? `${provider.total_reviews} reviews` : 'Review count unavailable'}
          </p>
        </Card>

        <Card className="glass-card p-4">
          <h4 className="font-semibold mb-2 text-sm">Rating Breakdown</h4>
          {loadError ? (
            <p role="alert" className="text-sm text-destructive">{loadError}</p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Loading reviews…</p>
          ) : ratingBreakdown.map(r => (
            <div key={r.rating} className="flex items-center gap-2 text-sm mb-1">
              <span className="w-3">{r.rating}</span>
              <Star className="h-3 w-3 fill-primary text-primary" />
              <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${r.pct}%` }} />
              </div>
              <span className="text-xs text-muted-foreground w-6 text-right">{r.count}</span>
            </div>
          ))}
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="5">5★</TabsTrigger>
            <TabsTrigger value="4">4★</TabsTrigger>
            <TabsTrigger value="low">≤3★</TabsTrigger>
            <TabsTrigger value="comments">With Comments</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-32 glass-input h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="latest">Latest</SelectItem>
            <SelectItem value="highest">Highest</SelectItem>
            <SelectItem value="lowest">Lowest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Review list */}
      {loadError ? (
        <Card role="alert" className="glass-card p-8 text-center text-destructive">{loadError}</Card>
      ) : loading ? (
        <Card className="glass-card p-8 text-center text-muted-foreground">Loading reviews…</Card>
      ) : filtered.length === 0 ? (
        <Card className="glass-card p-8 text-center text-muted-foreground">No reviews yet</Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r, i) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="glass-card p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    {((r as any).profiles?.full_name || r.reviewer_name) && (
                    <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm">
                      {((r as any).profiles?.full_name || r.reviewer_name)[0].toUpperCase()}
                    </div>
                    )}
                    <div>
                      {(r as any).profiles?.full_name || r.reviewer_name ? (
                        <p className="font-medium text-sm">{(r as any).profiles?.full_name || r.reviewer_name}</p>
                      ) : null}
                      {((r as any).bookings?.services?.name || r.service_name) && (
                        <p className="text-xs text-muted-foreground">{(r as any).bookings?.services?.name || r.service_name}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex gap-0.5 mb-2">
                  {[1, 2, 3, 4, 5].map(s => (
                    <Star key={s} className={`h-4 w-4 ${s <= r.rating ? 'fill-primary text-primary' : 'text-muted-foreground'}`} />
                  ))}
                </div>
                {r.comment && (
                  <p className="text-sm text-muted-foreground italic flex items-start gap-2">
                    <MessageSquare className="h-4 w-4 mt-0.5 shrink-0" />
                    "{r.comment}"
                  </p>
                )}
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Reviews;
