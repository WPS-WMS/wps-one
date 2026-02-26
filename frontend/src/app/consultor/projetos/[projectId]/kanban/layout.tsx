export function generateStaticParams() {
  return [{ projectId: "_" }];
}

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
