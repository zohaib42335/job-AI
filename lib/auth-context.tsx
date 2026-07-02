"use client";

import React, {
  createContext,
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "@/lib/firebase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Persists a user document in Firestore on first sign-in.
 * Subsequent calls are no-ops (merge: false + existence check).
 */
async function persistUserToFirestore(user: User): Promise<void> {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName ?? null,
      photoURL: user.photoURL ?? null,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });
  } else {
    // Update last login timestamp on every sign-in
    await setDoc(ref, { lastLoginAt: serverTimestamp() }, { merge: true });
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Subscribe to Firebase auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // ── Sign in with email / password ──────────────────────────────────────
  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      const { user: firebaseUser } = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      await persistUserToFirestore(firebaseUser);
    },
    []
  );

  // ── Sign in with Google popup ──────────────────────────────────────────
  const signInWithGoogle = useCallback(async () => {
    const { user: firebaseUser } = await signInWithPopup(auth, googleProvider);
    await persistUserToFirestore(firebaseUser);
  }, []);

  // ── Sign up with email / password ─────────────────────────────────────
  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const { user: firebaseUser } = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      // Persist with optional display name override
      const ref = doc(db, "users", firebaseUser.uid);
      await setDoc(ref, {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: displayName ?? firebaseUser.displayName ?? null,
        photoURL: firebaseUser.photoURL ?? null,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });
    },
    []
  );

  // ── Sign out ───────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    signInWithEmail,
    signInWithGoogle,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------------------------------------------------------------------------
// Raw context export (consumed by useAuth hook)
// ---------------------------------------------------------------------------

export { AuthContext };
