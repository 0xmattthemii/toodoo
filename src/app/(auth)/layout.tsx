export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 p-4">
      <div className="text-3xl font-bold tracking-tight">toodoo</div>
      {children}
    </div>
  );
}
