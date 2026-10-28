import React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

/** The apnabanda icon (public/apnabanda-icon.svg, same file as apps/mobile/assets/brand). */
export const AppIcon: React.FC<{ size?: number; className?: string }> = ({ size = 32, className }) => (
  <img src="/apnabanda-icon.svg" alt="" aria-hidden width={size} height={size} className={cn('shrink-0', className)} />
);

/** "apna" in the text colour + "banda" in brand blue, weight 800, tight tracking, with an amber ADMIN badge. */
export const AdminLogo: React.FC<{ size?: number; compact?: boolean }> = ({ size = 32, compact = false }) => (
  <div className="flex items-center gap-2" aria-label="apnabanda Admin" role="img">
    <AppIcon size={size} />
    {!compact && (
      <>
        <span className="font-extrabold tracking-tight text-foreground" style={{ fontSize: Math.round(size * 0.6), letterSpacing: '-0.02em' }}>
          apna<span className="text-primary">banda</span>
        </span>
        <span className="rounded-lg px-1.5 py-0.5 text-xs font-bold" style={{ background: '#FFC233', color: '#1A1100' }}>ADMIN</span>
      </>
    )}
  </div>
);

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

/** Light / Dark / System, remembered in this browser (same storage key as the app's Appearance setting). */
export const ThemeSwitch: React.FC = () => {
  const { theme = 'system', setTheme } = useTheme();
  return (
    <div role="radiogroup" aria-label="Appearance" className="flex items-center gap-0.5 rounded-xl border border-border/60 bg-secondary/60 p-0.5">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={`Appearance: ${label}`}
          title={label}
          onClick={() => setTheme(value)}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
            theme === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
};
