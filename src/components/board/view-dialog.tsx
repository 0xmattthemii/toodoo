"use client";

import { Bookmark } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createView, updateView } from "@/actions/views";
import { useBoardOptional } from "@/components/board/board-context";
import { IconColorPicker } from "@/components/icon-color-picker";
import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type EditableView = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
};

/**
 * Create mode (no `view`): renders its own "Save view" trigger and persists
 * the board's current configuration. Edit mode (`view` + open/onOpenChange):
 * renames the view and updates its icon/color.
 */
export function ViewDialog({
  view,
  open: controlledOpen,
  onOpenChange,
}: {
  view?: EditableView;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  // Present in create mode (toolbar); may be absent for edit mode in headers.
  const board = useBoardOptional();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [icon, setIcon] = useState<string | null>(view?.icon ?? null);
  const [color, setColor] = useState<string | null>(view?.color ?? null);
  const [pending, startTransition] = useTransition();

  // Re-seed icon/color from props each time the dialog opens.
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setIcon(view?.icon ?? null);
      setColor(view?.color ?? null);
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name"));
    startTransition(async () => {
      if (view) {
        const result = await updateView(view.id, { name, icon, color });
        if (result.error) {
          toast.error(result.error);
          return;
        }
        setOpen(false);
      } else {
        if (!board) return;
        const result = await createView({
          name,
          icon,
          color,
          config: board.config,
        });
        if (result.error) {
          toast.error(result.error);
          return;
        }
        setOpen(false);
        router.push(`/views/${result.viewId}`);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!view ? (
        <DialogTrigger render={<Button variant="outline" />}>
          <Bookmark />
          Save view
        </DialogTrigger>
      ) : null}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{view ? "Edit view" : "Save view"}</DialogTitle>
          <DialogDescription>
            {view
              ? "Rename the view or change its appearance."
              : "Save the current grouping and filters as a view."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="view-name">Name</Label>
            <Input
              id="view-name"
              name="name"
              defaultValue={view?.name ?? ""}
              placeholder="My tasks this week"
              required
              autoFocus
            />
          </div>
          <IconColorPicker
            icon={icon}
            color={color}
            onIconChange={setIcon}
            onColorChange={setColor}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <LoadingButton type="submit" loading={pending}>
              {view ? "Save" : "Save view"}
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
