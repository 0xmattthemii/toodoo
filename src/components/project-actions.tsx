"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { deleteProject, updateProject } from "@/actions/projects";
import { ConfirmDialog } from "@/components/confirm-dialog";
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
import { patchProject, removeProject } from "@/lib/workspace";

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
  const router = useRouter();
  const { mutate } = useWorkspace();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [icon, setIcon] = useState<string | null>(project.icon);
  const [color, setColor] = useState<string | null>(project.color);

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
    const name = String(form.get("name")).trim();
    const description = String(form.get("description")).trim();
    if (!name) return;
    void mutate({
      optimistic: patchProject(project.id, {
        name,
        description: description || null,
        icon,
        color,
      }),
      action: () =>
        updateProject(project.id, { name, description, icon, color }),
      failure: "Could not save the project",
      retry: true,
    });
    setEditOpen(false);
  }

  function onDelete() {
    setDeleteOpen(false);
    // One transition: the navigation home and the project leaving the
    // sidebar commit together, so its page never shows "not found".
    startTransition(() => {
      router.push("/");
      void mutate({
        optimistic: removeProject(project.id),
        action: () => deleteProject(project.id),
        failure: "Could not delete the project",
      });
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
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
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 />
            Delete project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete project?"
        description={
          <>
            <span className="font-medium text-foreground">
              {project.name}
            </span>{" "}
            and all of its tasks will be permanently deleted. This cannot be
            undone.
          </>
        }
        confirmLabel="Delete project"
        destructive
        onConfirm={onDelete}
      />

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
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
