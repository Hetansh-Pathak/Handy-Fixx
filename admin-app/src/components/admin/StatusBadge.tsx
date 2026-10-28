import {
  Ban,
  CheckCircle2,
  Clock3,
  FileQuestion,
  ShieldAlert,
  Truck,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn, STATUS_LABELS, STATUS_STYLES } from '@/lib/utils';

const STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  pending: Clock3,
  confirmed: CheckCircle2,
  on_the_way: Truck,
  in_progress: Wrench,
  completed: CheckCircle2,
  cancelled: Ban,
  active: CheckCircle2,
  suspended: Ban,
  approved: CheckCircle2,
  rejected: ShieldAlert,
  not_submitted: FileQuestion,
};

const STATUS_HOVER_STYLES: Record<string, string> = {
  pending: 'hover:bg-warning/35 hover:border-warning/60 hover:text-warning-foreground',
  confirmed: 'hover:bg-primary/35 hover:border-primary/60',
  on_the_way: 'hover:bg-orange-500/35 hover:border-orange-500/60',
  in_progress: 'hover:bg-blue-500/35 hover:border-blue-500/60',
  completed: 'hover:bg-success/35 hover:border-success/60',
  cancelled: 'hover:bg-destructive/35 hover:border-destructive/60',
  active: 'hover:bg-success/35 hover:border-success/60',
  suspended: 'hover:bg-destructive/35 hover:border-destructive/60',
  approved: 'hover:bg-success/35 hover:border-success/60',
  rejected: 'hover:bg-destructive/35 hover:border-destructive/60',
  not_submitted: 'hover:bg-muted hover:border-muted-foreground/40',
};

interface StatusBadgeProps {
  status: string;
  prefix?: string;
  className?: string;
}

const StatusBadge = ({ status, prefix, className }: StatusBadgeProps) => {
  const Icon = STATUS_ICONS[status] ?? FileQuestion;
  const label = STATUS_LABELS[status] ?? status.replace(/_/g, ' ');

  return (
    <Badge
      title={`${prefix ? `${prefix}: ` : ''}${label}`}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap border px-2.5 py-1 text-xs font-semibold capitalize shadow-sm transition-colors duration-200',
        STATUS_STYLES[status] ?? 'border-border bg-secondary text-foreground',
        STATUS_HOVER_STYLES[status] ?? 'hover:bg-secondary/80 hover:border-border',
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {prefix && <span>{prefix}</span>}
      <span>{label}</span>
    </Badge>
  );
};

export default StatusBadge;
