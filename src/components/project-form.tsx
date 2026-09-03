"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { createProject } from "@/actions/projects";
import { IconColorPicker } from "@/components/icon-color-picker";
import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectSummary } from "@/lib/types";

/**
 * The new-project fields, shared by the sidebar's dialog and the one nested in
 * the task dialog. `onCreated` receives the project so each caller can decide
 * what happens next (navigate to it, or select it for the task at hand).
 */
export function ProjectForm({
  onCreated,
  onCancel,
}: {
  onCreated: (project: ProjectSummary) => void;
  onCancel: () => void;
}) {
  // Both this form and the one nested in the task dialog can be mounted at
  // once, so the field ids have to be per-instance.
  const fieldId = useId();
  const [icon, setIcon] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name"));
    const description = String(form.get("description"));
    startTransition(async () => {
      const result = await createProject({ name, description, icon, color });
      if (result.error || !result.projectId) {
        toast.error(result.error ?? "Could not create the project");
        return;
      }
      // Whoever creates a project is its admin.
      onCreated({
        id: result.projectId,
        name: name.trim(),
        description: description.trim() || null,
        icon,
        color,
        role: "admin",
      });
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`${fieldId}-name`}>Name</Label>
        <Input
          id={`${fieldId}-name`}
          name="name"
          placeholder="Website redesign"
          required
          autoFocus
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${fieldId}-description`}>Description</Label>
        <Textarea
          id={`${fieldId}-description`}
          name="description"
          placeholder="Optional"
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
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <LoadingButton type="submit" loading={pending}>
          Create project
        </LoadingButton>
      </DialogFooter>
    </form>
  );
}
