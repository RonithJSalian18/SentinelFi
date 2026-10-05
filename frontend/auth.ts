import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";

export type Role = "analyst" | "admin";

declare module "next-auth" {
  interface User {
    role: Role;
    accessToken: string;
    accessTokenExpires: number;
  }
  interface Session {
    accessToken: string;
    user: { id: string; role: Role } & DefaultSession["user"];
  }
}

// next-auth/jwt only re-exports @auth/core/jwt, so augment the declaring module directly
declare module "@auth/core/jwt" {
  interface JWT {
    uid: string;
    role: Role;
    accessToken: string;
    accessTokenExpires: number;
  }
}

// Server-side calls (from the Next.js server to FastAPI) may use a private address
const API_URL =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://127.0.0.1:8000";

class AccountLocked extends CredentialsSignin {
  code = "locked";
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  user: { id: number; email: string; full_name: string; role: Role };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      // Exchange credentials for a FastAPI JWT via the OAuth2 password flow
      async authorize(credentials) {
        const response = await fetch(`${API_URL}/auth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            username: String(credentials?.email ?? ""),
            password: String(credentials?.password ?? ""),
          }),
        });
        if (response.status === 429) throw new AccountLocked();
        if (!response.ok) return null;

        const data: TokenResponse = await response.json();
        return {
          id: String(data.user.id),
          email: data.user.email,
          name: data.user.full_name,
          role: data.user.role,
          accessToken: data.access_token,
          accessTokenExpires: Date.now() + data.expires_in * 1000,
        };
      },
    }),
  ],
  // Hard cap; the session also ends as soon as the API token expires (see jwt callback)
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/login" },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        return {
          ...token,
          uid: user.id!,
          role: user.role,
          accessToken: user.accessToken,
          accessTokenExpires: user.accessTokenExpires,
        };
      }
      // The API token has expired: end the session so the user signs in again
      if (Date.now() >= token.accessTokenExpires) return null;
      return token;
    },
    session({ session, token }) {
      session.accessToken = token.accessToken;
      session.user.id = token.uid;
      session.user.role = token.role;
      return session;
    },
    // Used by proxy.ts: unauthenticated visitors are redirected to the sign-in page
    authorized({ auth }) {
      return !!auth;
    },
  },
});
