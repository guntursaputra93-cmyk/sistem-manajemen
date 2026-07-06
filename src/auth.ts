import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { dbAdmin } from "@/lib/db";
import { users } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { verifyPassword } from "@/lib/auth/password";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        // Lookup ini WAJIB lewat dbAdmin (bypass RLS), bukan db (app_user) — saat
        // login belum ada session/company context sama sekali untuk dicocokkan RLS,
        // dan email harus bisa dicari lintas-company karena unique secara global.
        const [user] = await dbAdmin
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user) return null;
        if (!user.isActive) return null;

        const passwordValid = await verifyPassword(password, user.passwordHash);
        if (!passwordValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          role: user.role,
          companyId: user.companyId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as typeof user & { role: string }).role;
        token.companyId = (user as typeof user & { companyId: string }).companyId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.companyId = token.companyId as string;
      }
      return session;
    },
  },
});
