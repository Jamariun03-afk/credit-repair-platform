import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Route-level gate — the first of three RBAC layers (see lib/auth/rbac.ts
// for the other two: server action/API guards and row-level query scoping).
// This layer stops the wrong role from even loading a page shell; it is
// NOT sufficient on its own for data access decisions.

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const role = (req.nextauth.token as any)?.role;
    const mfaPending = (req.nextauth.token as any)?.mfaPending;

    // A session issued only to complete MFA setup can reach nowhere else.
    if (mfaPending && pathname !== "/mfa-setup") {
      return NextResponse.redirect(new URL("/mfa-setup", req.url));
    }

    const staffOnlyPrefixes = [
      "/clients",
      "/disputes",
      "/tasks",
      "/documents",
      "/communications",
      "/analytics",
      "/templates",
      "/automations",
      "/compliance",
      "/settings",
    ];

    const isStaffRoute = staffOnlyPrefixes.some((p) => pathname.startsWith(p));
    const isPortalRoute = pathname.startsWith("/portal");

    if (isStaffRoute && role === "CLIENT") {
      return NextResponse.redirect(new URL("/portal", req.url));
    }
    if (isPortalRoute && role !== "CLIENT") {
      return NextResponse.redirect(new URL("/", req.url));
    }
    if (pathname.startsWith("/settings") && role !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    "/clients/:path*",
    "/disputes/:path*",
    "/tasks/:path*",
    "/documents/:path*",
    "/communications/:path*",
    "/analytics/:path*",
    "/templates/:path*",
    "/automations/:path*",
    "/compliance/:path*",
    "/settings/:path*",
    "/portal/:path*",
  ],
};
