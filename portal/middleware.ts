import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * How long to wait on Supabase before giving up and letting the request
 * through. Vercel kills middleware at 25s, and a hung `getUser()` burns
 * the whole budget and returns MIDDLEWARE_INVOCATION_TIMEOUT for EVERY
 * route this matcher covers — including pages that never touch Supabase.
 */
const AUTH_TIMEOUT_MS = 3000;

/**
 * Resolve to null rather than hang. `try/catch` alone does not help here:
 * a slow Supabase does not throw, it simply never settles.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            supabaseResponse = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    // Refresh the auth session (important for Server Components).
    //
    // On timeout `result` is null and `user` is undefined, so we fall
    // through to the redirect checks below as if nobody were signed in.
    // That is safe in BOTH directions: this middleware is a fast path,
    // never the security boundary. /admin re-checks the session and the
    // is_admin flag in its own layout, /dashboard and /support do their
    // own checks, and every admin server action calls requireAdminUser().
    // Failing open here costs a signed-in user a redirect to /auth; it
    // does not grant anyone access to anything.
    const result = await withTimeout(supabase.auth.getUser(), AUTH_TIMEOUT_MS);
    const user = result?.data?.user;

    const { pathname } = request.nextUrl;

    // Protected routes — redirect to /auth if not signed in.
    //
    // Skipped when the lookup timed out: we do not know whether they are
    // signed in, and bouncing a real customer to /auth during a Supabase
    // blip is worse than letting the page's own guard decide.
    if (
      result !== null &&
      !user &&
      (pathname.startsWith("/dashboard") ||
       pathname.startsWith("/support") ||
       pathname.startsWith("/admin"))
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth";
      return NextResponse.redirect(url);
    }

    // If signed in and visiting /auth (but not /auth/callback), redirect to dashboard
    if (user && pathname === "/auth") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  } catch (e) {
    // If Supabase fails, let the request through
    // (pages will handle auth checks themselves)
  }

  return supabaseResponse;
}

export const config = {
  /*
   * Only the routes that actually need a session.
   *
   * This used to match every path but static assets, which meant the
   * marketing home page — static JSX with no Supabase call anywhere in it
   * — still waited on `getUser()` and 504'd whenever Supabase was slow.
   * A database blip took down the whole domain. Now it can only affect
   * the pages that genuinely depend on a login.
   *
   * /auth/callback is deliberately included: it is under /auth, and the
   * "signed in and visiting /auth" redirect explicitly exempts it.
   */
  matcher: ["/dashboard/:path*", "/support/:path*", "/admin/:path*", "/auth/:path*", "/auth"],
};
