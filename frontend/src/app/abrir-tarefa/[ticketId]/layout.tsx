export function generateStaticParams() {
  return [{ ticketId: "_" }];
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
