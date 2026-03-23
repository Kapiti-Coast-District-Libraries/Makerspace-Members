import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

interface AuthContextType {
  user: User | null;
  userRole: 'member' | 'admin' | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, userRole: null, loading: true });

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<'member' | 'admin' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          setUser(firebaseUser);
          
          // Check if user exists in Firestore
          const userRef = doc(db, 'users', firebaseUser.uid);
          const userSnap = await getDoc(userRef);
          
          if (userSnap.exists()) {
            let role = userSnap.data().role;
            // Force admin role for the designated admin email
            if (firebaseUser.email === 'paraparaumumake@gmail.com' && role !== 'admin') {
              role = 'admin';
              await updateDoc(userRef, { role: 'admin' });
            }
            setUserRole(role);
          } else {
            // Create new user profile
            const isFirstUser = firebaseUser.email === 'paraparaumumake@gmail.com';
            const role = isFirstUser ? 'admin' : 'member';
            
            const userData: any = {
              name: firebaseUser.displayName || 'Anonymous User',
              email: firebaseUser.email,
              role: role,
              createdAt: serverTimestamp()
            };
            
            if (firebaseUser.photoURL) {
              userData.photoURL = firebaseUser.photoURL;
            }
            
            await setDoc(userRef, userData);
            setUserRole(role);
          }
        } else {
          setUser(null);
          setUserRole(null);
        }
      } catch (err) {
        console.error("Error in auth state change:", err);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, userRole, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
