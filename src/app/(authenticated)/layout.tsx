import Sidebar from "@/components/Sidebar";
import MainLayout from "@/components/MainLayout";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex bg-white">
      <Sidebar />
      <MainLayout title="Bem-vindo ao GAX" breadcrumb={[{ label: "Dashboard", active: true }]}>
        {children}
      </MainLayout>
    </div>
  );
}
