import { redirect } from "next/navigation";

// Root always sends users to the dashboard.
// The dashboard (wrapped in AppLayout) uses useRequireAuth,
// which redirects to /auth/login if the user is not signed in.
export default function RootPage() {
  redirect("/dashboard");
}
