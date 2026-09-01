"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { deleteView } from "@/actions/views";
import { ViewDialog } from "@/components/board/view-dialog";
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
  const [, startTransition] = useTransition();

  function onDelete() {
    if (!window.confirm(`Delete the view "${view.name}"?`)) return;
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
            onClick={onDelete}
          >
            <Trash2 />
            Delete view
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ViewDialog view={view} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}
