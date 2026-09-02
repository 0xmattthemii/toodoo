import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formats an email-domain allowlist for display: ["a.com","b.dev"] → "@a.com, @b.dev". */
export function formatEmailDomains(domains: string[]) {
  return domains.map((domain) => `@${domain}`).join(", ");
}
