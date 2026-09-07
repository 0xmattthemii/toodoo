"use client";

import { Bookmark } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createView, updateView } from "@/actions/views";
import { useBoardOptional } from "@/components/board/board-context";
import { IconColorPicker } from "@/components/icon-color-picker";
import { useWorkspace } from "@/components/workspace/workspace-provider";
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
import { newId } from "@/lib/ids";
import { addView, patchView } from "@/lib/workspace";

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

  const { mutate } = useWorkspace();
  const [icon, setIcon] = useState<string | null>(view?.icon ?? null);
  const [color, setColor] = useState<string | null>(view?.color ?? null);

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
    const name = String(new FormData(event.currentTarget).get("name")).trim();
    if (!name) return;
    if (view) {
      void mutate({
        optimistic: patchView(view.id, { name, icon, color }),
        action: () => updateView(view.id, { name, icon, color }),
        failure: "Could not save the view",
        retry: true,
      });
      setOpen(false);
    } else {
      if (!board) return;
      const id = newId();
      const config = board.config;
      // The view is in the sidebar and open before the server hears of it.
      void mutate({
        optimistic: addView({ id, name, icon, color, config }),
        action: () => createView({ id, name, icon, color, config }),
        failure: "Could not create the view",
        retry: true,
      });
      setOpen(false);
      router.push(`/views/${id}`);
    }
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
            <Button type="submit">{view ? "Save" : "Save view"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
