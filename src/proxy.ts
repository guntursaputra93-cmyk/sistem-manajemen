import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAccessCompanySlug, canAccessPilihPerusahaan } from "@/lib/rbac/access";

function safeCallbackPath(pathname: string, search: string): string {
  const combined = pathname + search;
  if (!combined.startsWith("/") || combined.startsWith("//")) return "/";
  return combined;
}

export const proxy = auth((req) => {
  const pathname = req.nextUrl.pathname;
  const session = req.auth;

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  if (!session?.user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", safeCallbackPath(pathname, req.nextUrl.search));
    return NextResponse.redirect(loginUrl);
  }

  const { role, companySlug } = session.user;

  // Halaman pemilihan company: khusus super_admin.
  if (pathname === "/pilih-perusahaan") {
    if (!canAccessPilihPerusahaan(session.user)) {
      return NextResponse.redirect(new URL(`/${companySlug}/dashboard`, req.url));
    }
    return NextResponse.next();
  }

  // Route dashboard per company: /[companySlug]/...
  const companySlugMatch = pathname.match(/^\/([^/]+)(\/.*)?$/);
  if (companySlugMatch) {
    const urlCompanySlug = companySlugMatch[1];
    if (!canAccessCompanySlug(session.user, urlCompanySlug)) {
      // Non-super_admin coba akses company lain -> lempar balik ke company sendiri.
      return NextResponse.redirect(new URL(`/${companySlug}/dashboard`, req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
