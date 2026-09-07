"use client";

import { addDays, format, startOfToday } from "date-fns";
import { CalendarIcon, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

import { createTask, deleteTask, updateTask } from "@/actions/tasks";
import { ProjectForm } from "@/components/project-form";
import { UserAvatar } from "@/components/user-avatar";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { newId } from "@/lib/ids";
import type {
  Person,
  ProjectSummary,
  TaskWithMeta,
} from "@/lib/types";
import { addTask, patchTask, removeTask } from "@/lib/workspace";

const NO_PROJECT = "none";
/** Sentinel item in the project select — never stored as a task's project. */
const NEW_PROJECT = "new";

export function TaskDialog({
  open,
  onOpenChange,
  task,
  projects,
  people,
  defaultProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TaskWithMeta | null;
  projects: ProjectSummary[];
  people: Person[];
  defaultProjectId?: string;
}) {
  const { me, mutate } = useWorkspace();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string>(NO_PROJECT);
  const [deadline, setDeadline] = useState<Date | undefined>(undefined);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);

  // Creating a project takes over this dialog rather than stacking a second
  // one on top of it. Every task field is controlled state, so the task form
  // can unmount and come back exactly as it was.
  const [pane, setPane] = useState<"task" | "project">("task");
  // Bumped on each visit so the project form starts blank.
  const [projectFormKey, setProjectFormKey] = useState(0);

  // Re-seed the form from props each time the dialog opens.
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setTitle(task?.title ?? "");
      setDescription(task?.description ?? "");
      setProjectId(
        task ? (task.projectId ?? NO_PROJECT) : (defaultProjectId ?? NO_PROJECT),
      );
      setDeadline(task?.deadline ? new Date(task.deadline) : undefined);
      setDeadlineOpen(false);
      setAssigneeIds(task?.assignees.map((person) => person.id) ?? []);
      setPane("task");
    }
  }

  const projectItems = [
    { value: NO_PROJECT, label: "No project" },
    ...projects.map((project) => ({
      value: project.id,
      label: project.name,
    })),
    { value: NEW_PROJECT, label: "New project" },
  ];

  const selectedAssignees = people.filter((person) =>
    assigneeIds.includes(person.id),
  );

  function toggleAssignee(personId: string, checked: boolean) {
    setAssigneeIds((current) =>
      checked
        ? [...current, personId]
        : current.filter((id) => id !== personId),
    );
  }

  function onSelectProject(value: string) {
    if (value === NEW_PROJECT) {
      setProjectFormKey((key) => key + 1);
      setPane("project");
      return;
    }
    setProjectId(value);
  }

  /** A project created here becomes this task's project, then back to the task. */
  function onProjectCreated(project: ProjectSummary) {
    setProjectId(project.id);
    setPane("task");
  }

  function pickDeadline(date: Date | undefined) {
    setDeadline(date);
    setDeadlineOpen(false);
  }

  // The task is on the board the moment the dialog closes; the server is
  // told in the background, and a failure offers to send it again.
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    const nextProjectId = projectId === NO_PROJECT ? null : projectId;
    const input = {
      title: trimmedTitle,
      description,
      deadline: deadline ? deadline.toISOString() : null,
      projectId: nextProjectId,
      assigneeIds,
    };
    const fields = {
      title: trimmedTitle,
      description: description.trim() || null,
      deadline: deadline ?? null,
      projectId: nextProjectId,
      projectName: nextProjectId
        ? (projects.find((project) => project.id === nextProjectId)?.name ??
          null)
        : null,
      assignees: people.filter((person) => assigneeIds.includes(person.id)),
    };

    if (task) {
      void mutate({
        optimistic: patchTask(task.id, fields),
        action: () => updateTask(task.id, input),
        failure: "Could not save the task",
        retry: true,
      });
    } else {
      const id = newId();
      void mutate({
        optimistic: addTask({
          id,
          ...fields,
          done: false,
          createdBy: me.id,
          createdAt: new Date(),
        }),
        action: () => createTask({ id, ...input }),
        failure: "Could not create the task",
        retry: true,
      });
    }
    onOpenChange(false);
  }

  function onDelete() {
    if (!task) return;
    void mutate({
      optimistic: removeTask(task.id),
      action: () => deleteTask(task.id),
      failure: "Could not delete the task",
      retry: true,
    });
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        // Escape on the project pane steps back to the task rather than
        // throwing the half-filled task away, the way the pane it replaced
        // used to. The close button and a press outside still close outright.
        if (!next && pane === "project" && details.reason === "escape-key") {
          setPane("task");
          return;
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {pane === "project" ? (
          <>
            <DialogHeader>
              <DialogTitle>New project</DialogTitle>
              <DialogDescription>
                It will be selected for this task once created. Your task is
                kept as you left it.
              </DialogDescription>
            </DialogHeader>
            {/* Nothing focusable sits above the form, so the dialog hands the
                caret straight to its Name field. */}
            <ProjectForm
              key={projectFormKey}
              onCreated={onProjectCreated}
              onCancel={() => setPane("task")}
            />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
              <DialogDescription>
                {task
                  ? "Update the details of this task."
                  : "Add a task with a deadline and assignees."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={onSubmit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="task-title">Title</Label>
                <Input
                  id="task-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="What needs to be done?"
                  required
                  autoFocus
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="task-description">Description</Label>
                <Textarea
                  id="task-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Optional"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Project</Label>
                  <Select
                    value={projectId}
                    onValueChange={(value) => onSelectProject(value as string)}
                    items={projectItems}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {projectItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.value === NEW_PROJECT ? (
                            <>
                              <Plus /> {item.label}
                            </>
                          ) : (
                            item.label
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Deadline</Label>
                  <div className="flex items-center gap-1">
                    <Popover open={deadlineOpen} onOpenChange={setDeadlineOpen}>
                      <PopoverTrigger
                        render={
                          <Button
                            type="button"
                            variant="outline"
                            className="flex-1 justify-start font-normal"
                          />
                        }
                      >
                        <CalendarIcon className="text-muted-foreground" />
                        {deadline ? (
                          format(deadline, "PPP")
                        ) : (
                          <span className="text-muted-foreground">No deadline</span>
                        )}
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <div className="flex gap-1 border-b p-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => pickDeadline(startOfToday())}
                          >
                            Today
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => pickDeadline(addDays(startOfToday(), 1))}
                          >
                            Tomorrow
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => pickDeadline(addDays(startOfToday(), 7))}
                          >
                            Next week
                          </Button>
                        </div>
                        <Calendar
                          mode="single"
                          selected={deadline}
                          onSelect={pickDeadline}
                          fixedWeeks
                        />
                      </PopoverContent>
                    </Popover>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Clear deadline"
                      onClick={() => setDeadline(undefined)}
                      className={deadline ? undefined : "invisible"}
                      tabIndex={deadline ? undefined : -1}
                    >
                      <X />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Assignees</Label>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          className="justify-start font-normal"
                        />
                      }
                    >
                      {selectedAssignees.length === 0 ? (
                        <span className="text-muted-foreground">Unassigned</span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <span className="flex -space-x-1.5">
                            {selectedAssignees.slice(0, 3).map((person) => (
                              <UserAvatar
                                key={person.id}
                                person={person}
                                className="size-5 ring-2 ring-background"
                              />
                            ))}
                          </span>
                          {selectedAssignees.length === 1
                            ? selectedAssignees[0].name
                            : `${selectedAssignees.length} people`}
                        </span>
                      )}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-64">
                      {people.map((person) => (
                        <DropdownMenuCheckboxItem
                          key={person.id}
                          checked={assigneeIds.includes(person.id)}
                          onCheckedChange={(checked) =>
                            toggleAssignee(person.id, checked === true)
                          }
                          closeOnClick
                        >
                          <span className="flex items-center gap-2">
                            <UserAvatar person={person} className="size-5" />
                            {person.name}
                          </span>
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <DialogFooter className={task ? "sm:justify-between" : undefined}>
                {task ? (
                  <Button type="button" variant="destructive" onClick={onDelete}>
                    <Trash2 />
                    Delete
                  </Button>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">
                    {task ? "Save changes" : "Create task"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
