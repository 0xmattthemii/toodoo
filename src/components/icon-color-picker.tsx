"use client";

import { APPEARANCE_COLORS, APPEARANCE_ICONS } from "@/lib/appearance";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function IconColorPicker({
  icon,
  color,
  onIconChange,
  onColorChange,
}: {
  icon: string | null;
  color: string | null;
  onIconChange: (icon: string | null) => void;
  onColorChange: (color: string | null) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label>Icon</Label>
        <div className="flex flex-wrap gap-1">
          {Object.entries(APPEARANCE_ICONS).map(([key, Icon]) => (
            <button
              key={key}
              type="button"
              aria-label={`Icon ${key}`}
              onClick={() => onIconChange(icon === key ? null : key)}
              className={cn(
                "flex size-8 items-center justify-center rounded-lg border border-transparent hover:bg-muted",
                icon === key && "border-ring bg-muted",
              )}
            >
              <Icon
                className="size-4"
                style={color ? { color } : undefined}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-2">
        <Label>Color</Label>
        <div className="flex flex-wrap gap-1.5">
          {APPEARANCE_COLORS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-label={`Color ${option.name}`}
              onClick={() =>
                onColorChange(color === option.value ? null : option.value)
              }
              className={cn(
                "size-6 rounded-full border-2 border-transparent",
                color === option.value && "border-ring",
              )}
            >
              <span
                className="block size-full rounded-full border border-black/10"
                style={{ backgroundColor: option.value }}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
