"use client";

import { ArrowLeftRight, LogOut, Monitor, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { DesktopDialog } from "@/components/desktop-dialog";
import { ProfileDialog } from "@/components/profile-dialog";
import { UserAvatar } from "@/components/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { DESKTOP_CONNECT_URL, useDesktopShell } from "@/lib/desktop-shell";

export function NavUser({
  user,
  googleEnabled,
}: {
  user: { name: string; email: string; image: string | null };
  googleEnabled: boolean;
}) {
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(false);
  // Inside the desktop app the download link is pointless; offer its server
  // picker instead (the shell intercepts its own toodoo:// scheme).
  const desktopShell = useDesktopShell();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-accent">
          <UserAvatar person={user} className="size-7" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {user.name}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {user.email}
            </span>
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onClick={() => setProfileOpen(true)}>
            <UserRound />
            Profile
          </DropdownMenuItem>
          {desktopShell ? (
            <DropdownMenuItem
              onClick={() => {
                window.location.href = DESKTOP_CONNECT_URL;
              }}
            >
              <ArrowLeftRight />
              Switch server…
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setDesktopOpen(true)}>
              <Monitor />
              Download desktop app
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut}>
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProfileDialog
        user={user}
        googleEnabled={googleEnabled}
        open={profileOpen}
        onOpenChange={setProfileOpen}
      />
      <DesktopDialog open={desktopOpen} onOpenChange={setDesktopOpen} />
    </>
  );
}
