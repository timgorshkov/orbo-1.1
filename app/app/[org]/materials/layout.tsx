import AppShell from '@/components/app-shell';

export default function MaterialsLayout({ children, params }: { children: React.ReactNode; params: { org: string } }) {
  return (
    <AppShell orgId={params.org} currentPath={`/app/${params.org}/materials`}>
      {children}
    </AppShell>
  );
}
