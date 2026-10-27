import {
  Wrench,
  Zap,
  Sparkles,
  PaintBucket,
  Wind,
  Hammer,
  Bug,
  Thermometer,
  Settings,
  Scissors,
  LucideIcon,
} from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  Wrench,
  Zap,
  Sparkles,
  PaintBucket,
  Wind,
  Hammer,
  Bug,
  Thermometer,
  Settings,
  Scissors,
};

export const getServiceIcon = (iconName?: string | null): LucideIcon => {
  if (!iconName) return Wrench;
  return iconMap[iconName] ?? Wrench;
};
