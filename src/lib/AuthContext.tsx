import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { auth } from './firebase';
import { getOrCreateUser, subscribeToUser } from './db';

interface AuthContextType {
  user: User | null;
  guestId: string | null;
  dbUser: any | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [dbUser, setDbUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initialize guest ID if not present
    let gid = localStorage.getItem('guest_id');
    if (!gid) {
      gid = `guest_${Math.random().toString(36).substring(2, 15)}`;
      localStorage.setItem('guest_id', gid);
    }
    setGuestId(gid);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const userData = await getOrCreateUser(firebaseUser.uid, firebaseUser.email!);
        setDbUser(userData);
        
        // Subscribe to real-time updates for user data (credits)
        const unsubUser = subscribeToUser(firebaseUser.uid, (updatedUser) => {
          setDbUser(updatedUser);
        });
        
        setLoading(false);
        return () => unsubUser();
      } else {
        setDbUser(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login error:", error);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, guestId, dbUser, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
