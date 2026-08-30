"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteProject, updateProject } from "@/actions/projects";
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
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ProjectActions({
  project,
}: {
  project: {
    id: string;
    name: string;
    description: string | null;
    icon: string | null;
    color: string | null;
  };
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [icon, setIcon] = useState<string | null>(project.icon);
  const [color, setColor] = useState<string | null>(project.color);
  const [pending, startTransition] = useTransition();

  // Re-seed appearance from the project each time the dialog opens.
  const [prevOpen, setPrevOpen] = useState(false);
  if (editOpen !== prevOpen) {
    setPrevOpen(editOpen);
    if (editOpen) {
      setIcon(project.icon);
      setColor(project.color);
    }
  }

  function onSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateProject(project.id, {
        name: String(form.get("name")),
        description: String(form.get("description")),
        icon,
        color,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setEditOpen(false);
    });
  }

  function onDelete() {
    if (
      !window.confirm(
        `Delete "${project.name}" and all of its tasks? This cannot be undone.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      await deleteProject(project.id);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Project settings"
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem
            className="whitespace-nowrap"
            onClick={() => setEditOpen(true)}
          >
            <Pencil />
            Edit project
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            className="whitespace-nowrap"
            onClick={onDelete}
          >
            <Trash2 />
            Delete project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit project</DialogTitle>
            <DialogDescription>
              Rename the project or change its appearance.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSave} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-project-name">Name</Label>
              <Input
                id="edit-project-name"
                name="name"
                defaultValue={project.name}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-project-description">Description</Label>
              <Textarea
                id="edit-project-description"
                name="description"
                defaultValue={project.description ?? ""}
                rows={2}
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
                onClick={() => setEditOpen(false)}
              >
                Cancel
              </Button>
              <LoadingButton type="submit" loading={pending}>
                Save
              </LoadingButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
