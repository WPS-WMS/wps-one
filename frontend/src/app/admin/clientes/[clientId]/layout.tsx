export function generateStaticParams() {
  return [{ clientId: "_" }];
}

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
