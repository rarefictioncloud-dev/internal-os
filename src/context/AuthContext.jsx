import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase/config";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stopProfile = null;

    const stopAuth = onAuthStateChanged(auth, (firebaseUser) => {
      stopProfile?.();
      stopProfile = null;
      setUser(firebaseUser);
      setProfile(null);

      if (!firebaseUser) {
        setLoading(false);
        return;
      }

      setLoading(true);
      stopProfile = onSnapshot(
        doc(db, "users", firebaseUser.uid),
        async (snapshot) => {
          if (!snapshot.exists() || snapshot.data()?.isActive === false) {
            await signOut(auth);
            return;
          }

          setProfile(snapshot.data());
          setLoading(false);
        },
        async (error) => {
          console.error("Authentication profile listener:", error);
          setProfile(null);
          await signOut(auth);
        }
      );
    });

    return () => {
      stopProfile?.();
      stopAuth();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isAuthenticated: !!user && !!profile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
