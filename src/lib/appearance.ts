import { createElement } from "react";
import {
  Book,
  Briefcase,
  Calendar,
  Flag,
  Folder,
  Hash,
  Heart,
  Home,
  Layers,
  Rocket,
  Star,
  Target,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

/** Preset icons for projects and views. Stored by key so the set can evolve. */
export const APPEARANCE_ICONS: Record<string, LucideIcon> = {
  hash: Hash,
  folder: Folder,
  briefcase: Briefcase,
  rocket: Rocket,
  star: Star,
  heart: Heart,
  flag: Flag,
  zap: Zap,
  book: Book,
  home: Home,
  users: Users,
  calendar: Calendar,
  target: Target,
  layers: Layers,
};

/** Preset colors (name → hex) shown as swatches. */
export const APPEARANCE_COLORS: { name: string; value: string }[] = [
  { name: "Gray", value: "#6b7280" },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Green", value: "#22c55e" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Pink", value: "#ec4899" },
];

export function resolveIcon(icon: string | null, fallback: LucideIcon): LucideIcon {
  return (icon && APPEARANCE_ICONS[icon]) || fallback;
}

/** Renders a stored icon key in its stored color, with a per-context fallback icon. */
export function AppearanceIcon({
  icon,
  color,
  fallback,
  className,
}: {
  icon: string | null;
  color: string | null;
  fallback: LucideIcon;
  className?: string;
}) {
  return createElement(resolveIcon(icon, fallback), {
    className,
    style: color ? { color } : undefined,
  });
}
