export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 p-4">
      <div className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
          t.
        </span>
        toodoo
      </div>
      {children}
    </div>
  );
}
