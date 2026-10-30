import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

const KEY = 'apnabanda.admin.theme';

const isDark = () => document.documentElement.classList.contains('dark');

/** Light = "Blue + White", Dark = "Black + Blur". The first choice follows the computer; a click is remembered on this browser only. */
const ThemeToggle: React.FC = () => {
  const [dark, setDark] = useState(isDark);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    try {
      localStorage.setItem(KEY, next ? 'dark' : 'light');
    } catch {
      /* private window: the choice just is not remembered */
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={toggle} className="h-8 w-8 p-0" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
};

export default ThemeToggle;
