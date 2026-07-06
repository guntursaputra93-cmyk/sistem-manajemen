import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: string;
    companyId: string;
    companySlug: string;
  }

  interface Session {
    user: {
      id: string;
      role: string;
      companyId: string;
      companySlug: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    companyId: string;
    companySlug: string;
  }
}
