import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { dummyCompare } from "@/lib/password";
import logger from "@/lib/logger";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { config } from "@/lib/config";

const log = logger.child({ module: "auth" });

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-Mail", type: "email" },
        password: { label: "Passwort", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const rateLimitKey = `login:${email}`;
        if (!checkRateLimit(rateLimitKey)) {
          log.warn({ email }, "login blocked: rate limit exceeded");
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.isActive) {
          // Equalize response time with the real password check so the
          // duration does not reveal whether the email exists.
          await dummyCompare(password);
          log.warn({ email }, "login failed: user not found or inactive");
          return null;
        }

        const passwordValid = await compare(password, user.passwordHash);
        if (!passwordValid) {
          log.warn({ email }, "login failed: wrong password");
          return null;
        }

        resetRateLimit(rateLimitKey);
        log.info({ email, userId: user.id }, "login success");
        return {
          id: String(user.id),
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: config.session.maxAgeSec,
    updateAge: config.session.updateAgeSec,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: UserRole }).role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as UserRole;
      return session;
    },
  },
});
