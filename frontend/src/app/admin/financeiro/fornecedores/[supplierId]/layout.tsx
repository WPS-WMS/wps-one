export function generateStaticParams() {
  return [{ supplierId: "_" }];
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
