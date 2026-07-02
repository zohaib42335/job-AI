import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * This app uses client-side Firebase Auth.
 * Route protection is handled by the `useRequireAuth` hook inside `AppLayout`,
 * which redirects unauthenticated users to /auth/login on the client.
 *
 * The middleware here simply passes all requests through — no server-side
 * cookie check — so that Firebase's client-side `onAuthStateChanged` can
 * run and handle the redirect without being intercepted.
 *
 * If you later upgrade to Firebase Admin SDK + session cookies, you can
 * uncomment the cookie check below and populate `__session` via an API route.
 */
export function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static  (static files)
     * - _next/image   (image optimization)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
