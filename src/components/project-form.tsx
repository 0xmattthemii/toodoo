"use client";

import { useId, useState } from "react";

import { createProject } from "@/actions/projects";
import { IconColorPicker } from "@/components/icon-color-picker";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { newId } from "@/lib/ids";
import type { ProjectSummary } from "@/lib/types";
import { addProject } from "@/lib/workspace";

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
  const { me, mutate } = useWorkspace();
  const [icon, setIcon] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);

  // The project exists on screen (sidebar, selects, its own page) as soon as
  // the form is submitted; the server is told in the background.
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name")).trim();
    const description = String(form.get("description")).trim();
    if (!name) return;
    // Whoever creates a project is its admin.
    const project: ProjectSummary = {
      id: newId(),
      name,
      description: description || null,
      icon,
      color,
      role: "admin",
    };
    void mutate({
      optimistic: addProject(project, me),
      action: () =>
        createProject({ id: project.id, name, description, icon, color }),
      failure: "Could not create the project",
      retry: true,
    });
    onCreated(project);
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
        <Button type="submit">Create project</Button>
      </DialogFooter>
    </form>
  );
}
