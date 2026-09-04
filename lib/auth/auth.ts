import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { verifyMfaCode } from "@/lib/auth/mfa";

const MFA_REQUIRED_ROLES = ["SUPER_ADMIN", "COMPLIANCE_ADMIN"];

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        mfaCode: { label: "MFA Code", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });

        if (!user || !user.isActive) {
          await writeAuditLog({
            actorId: null,
            action: "LOGIN_FAILED",
            entityType: "User",
            entityId: null,
            newValue: { email: credentials.email, reason: "not_found_or_inactive" },
          });
          return null;
        }

        const validPassword = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!validPassword) {
          await writeAuditLog({
            actorId: user.id,
            action: "LOGIN_FAILED",
            entityType: "User",
            entityId: user.id,
            newValue: { reason: "bad_password" },
          });
          return null;
        }

        const mfaRequired = MFA_REQUIRED_ROLES.includes(user.role);

        if (mfaRequired && !user.mfaEnabled) {
          // First login for a role that requires MFA: issue a
          // deliberately restricted session (mfaPending: true).
          // middleware.ts + requireSession() both block everything
          // except /mfa-setup and its API for a session in this state —
          // this is NOT a way to skip MFA, it's the one-time path to
          // go set it up.
          await writeAuditLog({
            actorId: user.id,
            action: "LOGIN_MFA_SETUP_REQUIRED",
            entityType: "User",
            entityId: user.id,
          });
          return {
            id: user.id,
            email: user.email,
            role: user.role,
            mfaEnabled: false,
            mfaPending: true,
          };
        }

        if (mfaRequired) {
          if (!credentials.mfaCode) {
            // Client sees this and prompts for the code as a second step
            // instead of resubmitting the whole form blind.
            throw new Error("MFA_CODE_REQUIRED");
          }

          const valid = verifyMfaCode(user.mfaSecret!, credentials.mfaCode);
          if (!valid) {
            await writeAuditLog({
              actorId: user.id,
              action: "LOGIN_FAILED",
              entityType: "User",
              entityId: user.id,
              newValue: { reason: "bad_mfa_code" },
            });
            throw new Error("MFA_CODE_INVALID");
          }
        }

        await writeAuditLog({
          actorId: user.id,
          action: "LOGIN_SUCCESS",
          entityType: "User",
          entityId: user.id,
        });

        return {
          id: user.id,
          email: user.email,
          role: user.role,
          mfaEnabled: user.mfaEnabled,
          mfaPending: false,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.mfaEnabled = (user as any).mfaEnabled;
        token.mfaPending = (user as any).mfaPending ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).role = token.role;
        (session.user as any).mfaEnabled = token.mfaEnabled;
        (session.user as any).mfaPending = token.mfaPending;
      }
      return session;
    },
  },
};

