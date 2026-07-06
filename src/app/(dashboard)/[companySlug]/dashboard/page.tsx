import { auth } from "@/auth";
import { ROLE_LABEL } from "@/lib/rbac/permissions";

export default async function DashboardPage() {
  const session = await auth();
  const role = session?.user.role as keyof typeof ROLE_LABEL | undefined;

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
      <p className="text-gray-500 text-sm mt-1">
        Selamat datang, {session?.user.name} ({role ? ROLE_LABEL[role] : "-"}).
      </p>
      <div className="mt-6 bg-white border border-dashed border-gray-200 rounded-xl p-8 text-center">
        <p className="text-gray-400 text-sm">
          Modul bisnis akan ditambahkan pada fase pengembangan berikutnya.
        </p>
      </div>
    </div>
  );
}
