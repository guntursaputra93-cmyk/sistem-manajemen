import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { dbAdmin } from "@/lib/db";
import { users, companies } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { verifyPassword } from "@/lib/auth/password";
import { checkRateLimit, recordLoginFailure, recordLoginSuccess } from "@/lib/auth/rate-limit";
import { logAudit, getRequestMeta } from "@/lib/audit/log";
import { setSentryUserContext } from "@/lib/sentry/context";

const LOGIN_ACTION_TYPE = "login_attempt";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const rawEmail = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        const { ipAddress, userAgent } = getRequestMeta(request);

        if (!rawEmail || !password) return null;

        const email = rawEmail.toLowerCase();

        // Cek rate limit SEBELUM cek password sama sekali — kalau sedang terkunci,
        // tolak percobaan ini apapun password-nya (itu inti dari lockout).
        const rateLimitStatus = await checkRateLimit(email, LOGIN_ACTION_TYPE);
        if (rateLimitStatus.locked) {
          await logAudit({
            action: "login_failed",
            metadata: { reason: "rate_limited", email },
            ipAddress,
            userAgent,
          });
          return null;
        }

        // Lookup ini WAJIB lewat dbAdmin (bypass RLS), bukan db (app_user) — saat
        // login belum ada session/company context sama sekali untuk dicocokkan RLS,
        // dan email harus bisa dicari lintas-company karena unique secara global.
        // Sekalian join companies untuk slug — dipakai proxy.ts membandingkan
        // [companySlug] di URL tanpa perlu query DB lagi di setiap request.
        const [row] = await dbAdmin
          .select({ user: users, companySlug: companies.slug })
          .from(users)
          .innerJoin(companies, eq(users.companyId, companies.id))
          .where(eq(users.email, email))
          .limit(1);

        const user = row?.user;

        if (!user || !user.isActive) {
          await recordLoginFailure(email, LOGIN_ACTION_TYPE);
          await logAudit({
            companyId: user?.companyId ?? null,
            userId: user?.id ?? null,
            action: "login_failed",
            metadata: { reason: !user ? "user_not_found" : "inactive_user", email },
            ipAddress,
            userAgent,
          });
          return null;
        }

        const passwordValid = await verifyPassword(password, user.passwordHash);
        if (!passwordValid) {
          await recordLoginFailure(email, LOGIN_ACTION_TYPE);
          await logAudit({
            companyId: user.companyId,
            userId: user.id,
            action: "login_failed",
            metadata: { reason: "wrong_password", email },
            ipAddress,
            userAgent,
          });
          return null;
        }

        await recordLoginSuccess(email, LOGIN_ACTION_TYPE);
        await logAudit({
          companyId: user.companyId,
          userId: user.id,
          action: "login",
          metadata: { email },
          ipAddress,
          userAgent,
        });

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          role: user.role,
          companyId: user.companyId,
          companySlug: row.companySlug,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as typeof user & { role: string; companyId: string; companySlug: string };
        token.id = u.id as string;
        token.role = u.role;
        token.companyId = u.companyId;
        token.companySlug = u.companySlug;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.companyId = token.companyId as string;
        session.user.companySlug = token.companySlug as string;

        setSentryUserContext({
          id: session.user.id,
          role: session.user.role,
          companyId: session.user.companyId,
        });
      }
      return session;
    },
  },
});
