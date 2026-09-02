"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { deleteView } from "@/actions/views";
import { ViewDialog } from "@/components/board/view-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ViewActions({
  view,
}: {
  view: { id: string; name: string; icon: string | null; color: string | null };
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onDelete() {
    // The action redirects on success, which unmounts this component.
    startTransition(async () => {
      await deleteView(view.id);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="View settings" />
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
            Edit view
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            className="whitespace-nowrap"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 />
            Delete view
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete view?"
        description={
          <>
            The view{" "}
            <span className="font-medium text-foreground">{view.name}</span>{" "}
            will be removed. Tasks are not affected.
          </>
        }
        confirmLabel="Delete view"
        destructive
        loading={pending}
        onConfirm={onDelete}
      />
      <ViewDialog view={view} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}
