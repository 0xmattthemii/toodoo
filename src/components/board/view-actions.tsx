"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { deleteView } from "@/actions/views";
import { ViewDialog } from "@/components/board/view-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { removeView } from "@/lib/workspace";

export function ViewActions({
  view,
}: {
  view: { id: string; name: string; icon: string | null; color: string | null };
}) {
  const router = useRouter();
  const { mutate } = useWorkspace();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function onDelete() {
    setDeleteOpen(false);
    // One transition: the navigation home and the view leaving the sidebar
    // commit together, so its page never shows "not found".
    startTransition(() => {
      router.push("/");
      void mutate({
        optimistic: removeView(view.id),
        action: () => deleteView(view.id),
        failure: "Could not delete the view",
      });
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
        onConfirm={onDelete}
      />
      <ViewDialog view={view} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}
