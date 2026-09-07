"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/** A sidebar row that highlights itself while its page is the one shown. */
export function SidebarLink({
  href,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Link>, "href"> & { href: string }) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-2 rounded-lg px-2 text-sm text-foreground transition-colors duration-150 hover:bg-accent",
        active && "bg-accent font-medium",
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}
