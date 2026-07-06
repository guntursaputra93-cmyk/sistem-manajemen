import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function RootPage() {
  const session = await auth();

  if (!session?.user) redirect("/login");
  if (session.user.role === "super_admin") redirect("/pilih-perusahaan");
  redirect(`/${session.user.companySlug}/dashboard`);
}
