import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', opts ?? { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatTime(time: string | null | undefined): string {
  if (!time) return '—';
  return time.slice(0, 5);
}

export function timeAgo(date: string | null | undefined): string {
  if (!date) return '—';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function maskAadhaar(last4: string): string {
  return `XXXX XXXX ${last4}`;
}

export function maskPAN(pan: string): string {
  if (!pan || pan.length !== 10) return pan;
  return `XXXXX${pan.slice(5, 9)}${pan[9]}`;
}

export function shortId(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

export const KYC_REJECTION_REASONS: string[] = [
  'Blurry document',
  'Name mismatch',
  'Selfie unclear',
  'PAN not matching',
  'Aadhaar not matching',
  'Documents not readable',
  'Under 18',
  'Duplicate account',
  'Other',
];

export const CANCEL_REASONS: string[] = [
  'Customer requested via support',
  'Provider unavailable',
  'Duplicate booking',
  'Safety/fraud concern',
  'Scheduling conflict',
  'Other',
];

export const SUSPEND_REASONS: string[] = [
  'Repeated no-shows',
  'Customer complaints',
  'Fraud suspicion',
  'Policy violation',
  'Other',
];

export type BookingStatus = 'pending' | 'confirmed' | 'on_the_way' | 'in_progress' | 'completed' | 'cancelled';

export const STATUS_STYLES: Record<string, string> = {
  pending:     'bg-warning/20 text-warning border border-warning/30',
  confirmed:   'bg-primary/20 text-primary border border-primary/30',
  on_the_way:  'bg-orange-500/20 text-orange-500 border border-orange-500/30',
  in_progress: 'bg-blue-500/20 text-blue-500 border border-blue-500/30',
  completed:   'bg-success/20 text-success border border-success/30',
  cancelled:   'bg-destructive/20 text-destructive border border-destructive/30',
  active:      'bg-success/20 text-success border border-success/30',
  suspended:   'bg-destructive/20 text-destructive border border-destructive/30',
  approved:    'bg-success/20 text-success border border-success/30',
  rejected:    'bg-destructive/20 text-destructive border border-destructive/30',
  not_submitted: 'bg-muted text-muted-foreground border border-border',
};

export const STATUS_LABELS: Record<string, string> = {
  pending:       'Pending',
  confirmed:     'Confirmed',
  on_the_way:    'On the way',
  in_progress:   'In progress',
  completed:     'Completed',
  cancelled:     'Cancelled',
  active:        'Active',
  suspended:     'Suspended',
  approved:      'Approved',
  rejected:      'Rejected',
  not_submitted: 'Not submitted',
};
