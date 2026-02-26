export function generateStaticParams() {
  return [{ projectId: "_", ticketId: "_" }];
}

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
