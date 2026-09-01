"use client";

import { addDays, format, startOfToday } from "date-fns";
import { CalendarIcon, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createTask, deleteTask, updateTask } from "@/actions/tasks";
import { UserAvatar } from "@/components/user-avatar";
import { LoadingButton } from "@/components/loading-button";
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
import type {
  Person,
  ProjectSummary,
  TaskWithMeta,
} from "@/lib/types";

const NO_PROJECT = "none";

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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string>(NO_PROJECT);
  const [deadline, setDeadline] = useState<Date | undefined>(undefined);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [deleting, startDeleteTransition] = useTransition();

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
    }
  }

  const projectItems = [
    { value: NO_PROJECT, label: "No project" },
    ...projects.map((project) => ({ value: project.id, label: project.name })),
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

  function pickDeadline(date: Date | undefined) {
    setDeadline(date);
    setDeadlineOpen(false);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = {
      title,
      description,
      deadline: deadline ? deadline.toISOString() : null,
      projectId: projectId === NO_PROJECT ? null : projectId,
      assigneeIds,
    };
    startTransition(async () => {
      const result = task
        ? await updateTask(task.id, input)
        : await createTask(input);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      onOpenChange(false);
    });
  }

  function onDelete() {
    if (!task) return;
    startDeleteTransition(async () => {
      const result = await deleteTask(task.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
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
                onValueChange={(value) => setProjectId(value as string)}
                items={projectItems}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projectItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
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
                        size="xs"
                        onClick={() => pickDeadline(startOfToday())}
                      >
                        Today
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => pickDeadline(addDays(startOfToday(), 1))}
                      >
                        Tomorrow
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
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
              <LoadingButton
                type="button"
                variant="destructive"
                onClick={onDelete}
                loading={deleting}
                disabled={pending}
              >
                <Trash2 />
                Delete
              </LoadingButton>
            ) : null}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <LoadingButton type="submit" loading={pending} disabled={deleting}>
                {task ? "Save changes" : "Create task"}
              </LoadingButton>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
