import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SettingTabs } from "./SettingTabs";

// Area Setting Keuangan — header + tab bar dipegang layout ini, tiap tab (halaman
// anak) cukup merender kontennya sendiri. Pola ini akan diulang per modul.
export default async function KeuanganSettingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  const tabs = [{ label: "Chart of Accounts", href: `/${companySlug}/keuangan/setting/akun` }];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[{ label: "Keuangan" }, { label: "Setting" }]}
        title="Setting Keuangan"
        description="Konfigurasi modul Keuangan — bagan akun & pengaturan lain."
      />
      <SettingTabs tabs={tabs} />
      {children}
    </div>
  );
}
