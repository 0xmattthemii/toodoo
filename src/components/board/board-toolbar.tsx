"use client";

import { Bookmark, Eye, EyeOff, ListFilter, Plus, X } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { updateView } from "@/actions/views";
import { useBoard } from "@/components/board/board-context";
import { ViewDialog } from "@/components/board/view-dialog";
import { LoadingButton } from "@/components/loading-button";
import { TaskDialog } from "@/components/task-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  BoardFilter,
  BoardMode,
  FilterField,
  GroupBy,
} from "@/lib/types";

const GROUP_ITEMS: { value: GroupBy; label: string }[] = [
  { value: "none", label: "None" },
  { value: "project", label: "Project" },
  { value: "assignee", label: "Assignee" },
  { value: "deadline", label: "Deadline" },
];

const DEADLINE_VALUES = [
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "week", label: "Due this week" },
  { value: "later", label: "Due later" },
  { value: "none", label: "No deadline" },
];

const FIELD_LABELS: Record<FilterField, string> = {
  assignee: "Assignee",
  project: "Project",
  deadline: "Deadline",
};

export function BoardToolbar() {
  const board = useBoard();
  const [pending, startTransition] = useTransition();

  const { config, options, scopedProjectId, viewId, dirty, showDone } = board;

  function filterValueLabel(filter: BoardFilter): string {
    switch (filter.field) {
      case "deadline":
        return (
          DEADLINE_VALUES.find((option) => option.value === filter.value)
            ?.label ?? filter.value
        );
      case "assignee":
        if (filter.value === "me") return "Me";
        if (filter.value === "unassigned") return "Unassigned";
        return (
          options.people.find((person) => person.id === filter.value)?.name ??
          "…"
        );
      case "project":
        if (filter.value === "none") return "No project";
        return (
          options.projects.find((project) => project.id === filter.value)
            ?.name ?? "…"
        );
    }
  }

  function saveViewChanges() {
    if (!viewId) return;
    startTransition(async () => {
      const result = await updateView(viewId, { config });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      board.markSaved();
      toast.success("View updated");
    });
  }

  const assigneeOptions = [
    { value: "me", label: "Me" },
    { value: "unassigned", label: "Unassigned" },
    ...options.people
      .filter((person) => person.id !== board.currentUserId)
      .map((person) => ({ value: person.id, label: person.name })),
  ];

  const projectOptions = [
    { value: "none", label: "No project" },
    ...options.projects.map((project) => ({
      value: project.id,
      label: project.name,
    })),
  ];

  return (
    <div className="flex flex-col gap-2 px-6">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={config.mode}
          onValueChange={(value) => board.setMode(value as BoardMode)}
        >
          <TabsList>
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
          </TabsList>
        </Tabs>

        <Select
          value={config.groupBy}
          onValueChange={(value) => board.setGroupBy(value as GroupBy)}
          items={GROUP_ITEMS}
        >
          <SelectTrigger size="sm" aria-label="Group by">
            <span className="text-muted-foreground">Group by</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GROUP_ITEMS.filter(
              (item) => !(scopedProjectId && item.value === "project"),
            ).map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
            <ListFilter />
            Add filter
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-44">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Assignee</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {assigneeOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() =>
                      board.addFilter({
                        field: "assignee",
                        value: option.value,
                      })
                    }
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {!scopedProjectId ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Project</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {projectOptions.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() =>
                        board.addFilter({
                          field: "project",
                          value: option.value,
                        })
                      }
                    >
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : null}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Deadline</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {DEADLINE_VALUES.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() =>
                      board.addFilter({
                        field: "deadline",
                        value: option.value,
                      })
                    }
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-2">
          {viewId && dirty ? (
            <LoadingButton
              variant="outline"
              size="sm"
              onClick={saveViewChanges}
              loading={pending}
            >
              <Bookmark />
              Save changes
            </LoadingButton>
          ) : null}
          {!viewId && !scopedProjectId ? <ViewDialog /> : null}
          <Button size="sm" onClick={board.openCreate}>
            <Plus />
            New task
          </Button>
        </div>
      </div>

      {/* Active filters row — always rendered so the layout doesn't shift. */}
      <div className="flex min-h-7 flex-wrap items-center gap-2">
        {config.filters.map((filter) => (
          <Badge
            key={`${filter.field}:${filter.value}`}
            variant="secondary"
            className="gap-1 pr-1"
          >
            <span className="text-muted-foreground">
              {FIELD_LABELS[filter.field]}:
            </span>
            {filterValueLabel(filter)}
            <button
              type="button"
              aria-label={`Remove filter ${FIELD_LABELS[filter.field]}`}
              onClick={() => board.removeFilter(filter)}
              className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={showDone}
          className="ml-auto text-muted-foreground"
          onClick={() => board.setShowDone(!showDone)}
        >
          {showDone ? <Eye /> : <EyeOff />}
          Completed
        </Button>
      </div>

      <TaskDialog
        open={board.dialogOpen}
        onOpenChange={board.setDialogOpen}
        task={board.dialogTask}
        projects={options.projects}
        people={options.people}
        defaultProjectId={scopedProjectId}
      />
    </div>
  );
}
