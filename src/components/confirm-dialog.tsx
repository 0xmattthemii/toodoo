"use client";

import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * In-app replacement for `window.confirm`. Controlled: the caller owns `open`
 * and runs the action in `onConfirm`; pass `loading` while it runs so the
 * dialog stays up (and can't be dismissed) until the action settles.
 *
 * Built on Dialog rather than AlertDialog — which carries the same role but
 * refuses to close on a press outside — because backing out is the harmless
 * answer here and should cost a click anywhere. Rendered from inside another
 * dialog it stacks on that one: Escape and a press outside take this one back
 * off, leaving the dialog underneath open and untouched.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  loading = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next, eventDetails) => {
        // Refuse Escape / outside dismissal while the action is in flight.
        if (loading && !next) {
          eventDetails.cancel();
          return;
        }
        onOpenChange(next);
      }}
    >
      <DialogContent role="alertdialog" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter>
          {/* First in the DOM, so it is what the dialog focuses on the way in:
              Enter backs out rather than going through with it. */}
          <DialogClose
            render={<Button variant="outline" disabled={loading} />}
          >
            {cancelLabel}
          </DialogClose>
          <LoadingButton
            variant={destructive ? "destructive" : "default"}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
