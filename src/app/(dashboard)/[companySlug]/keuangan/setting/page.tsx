import { redirect } from "next/navigation";

// /keuangan/setting → langsung ke tab pertama (Chart of Accounts).
export default async function KeuanganSettingIndex({ params }: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = await params;
  redirect(`/${companySlug}/keuangan/setting/akun`);
}
