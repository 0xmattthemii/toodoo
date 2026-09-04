"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProjectForm } from "@/components/project-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ProjectDialog() {
  const router = useRouter();
  const [open, setOpenState] = useState(false);
  // Remount the form on each open so it starts blank.
  const [formKey, setFormKey] = useState(0);

  function setOpen(next: boolean) {
    setOpenState(next);
    // Closing returns focus to the trigger, which is what should happen — the
    // sidebar leaves room for its focus ring.
    if (next) setFormKey((key) => key + 1);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="New project"
            className="text-muted-foreground hover:text-foreground"
          />
        }
      >
        <Plus />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Group related tasks and invite people to collaborate.
          </DialogDescription>
        </DialogHeader>
        <ProjectForm
          key={formKey}
          onCreated={(project) => {
            setOpen(false);
            router.push(`/projects/${project.id}`);
          }}
          onCancel={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
