export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center gap-8 bg-muted/40 p-4">
      {/* Dotted backdrop, faded out toward the edges. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_70%_70%_at_50%_40%,black,transparent)]"
      />
      <div className="relative flex w-full max-w-sm flex-col items-center gap-8">
        <div className="text-3xl font-bold tracking-tight">toodoo</div>
        {children}
      </div>
    </div>
  );
}
