export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Auth pages don't use the main layout with sidebar
  return <>{children}</>
}
