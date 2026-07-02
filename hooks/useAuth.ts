import { useContext } from "react";
import { AuthContext } from "@/lib/auth-context";

/**
 * Consume the AuthContext.
 * Must be used inside an <AuthProvider> — throws a descriptive error otherwise.
 */
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used within an <AuthProvider>. " +
        "Make sure <AuthProvider> wraps your component tree (e.g. in app/layout.tsx)."
    );
  }

  return context;
}
