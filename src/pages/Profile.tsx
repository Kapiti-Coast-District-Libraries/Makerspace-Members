import React, { useState, useEffect, useRef } from 'react';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { User, Camera, Save, Loader2, CreditCard } from 'lucide-react';

export function Profile() {
  const { user, userRole } = useAuth();
  const [name, setName] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [libraryCardNumber, setLibraryCardNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      if (user) {
        setName(user.displayName || '');
        setPhotoURL(user.photoURL || '');
        
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            setLibraryCardNumber(userDoc.data().libraryCardNumber || '');
          }
        } catch (err) {
          console.error('Error fetching user data:', err);
        }
      }
    };
    
    fetchUserData();
  }, [user]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    setMessage('');

    try {
      const storageRef = ref(storage, `profiles/${user.uid}/${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      
      setPhotoURL(downloadURL);
      
      // Auto-save the new photo URL
      await updateProfile(user, { photoURL: downloadURL });
      await updateDoc(doc(db, 'users', user.uid), { photoURL: downloadURL });
      
      setMessage('Profile photo updated successfully!');
    } catch (err) {
      console.error('Error uploading image:', err);
      setMessage('Failed to upload image.');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setMessage('');

    try {
      // Update Firebase Auth Profile
      await updateProfile(user, {
        displayName: name,
        photoURL: photoURL
      });

      // Update Firestore User Document
      await updateDoc(doc(db, 'users', user.uid), {
        name: name,
        photoURL: photoURL
      });

      setMessage('Profile updated successfully!');
    } catch (err) {
      console.error('Error updating profile:', err);
      setMessage('Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-stone-900">Your Profile</h1>
        <p className="text-stone-500 mt-2 text-lg">Manage your personal information.</p>
      </header>

      <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-200">
        <div className="flex items-center space-x-6 mb-8">
          <div className="relative">
            {photoURL ? (
              <img src={photoURL} alt="Profile" className="w-24 h-24 rounded-full object-cover border-4 border-stone-100" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 border-4 border-white shadow-sm">
                <User size={40} />
              </div>
            )}
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 bg-stone-900 text-white p-2 rounded-full shadow-sm hover:bg-stone-800 transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImageUpload} 
              accept="image/*" 
              className="hidden" 
            />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-stone-900">{name || 'Anonymous User'}</h2>
            <p className="text-stone-500">{user.email}</p>
            <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium ${userRole === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-stone-100 text-stone-800'}`}>
              {userRole === 'admin' ? 'Administrator' : 'Member'}
            </span>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none"
              placeholder="Your full name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Library Card Number</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <CreditCard size={18} className="text-stone-400" />
              </div>
              <input
                type="text"
                value={libraryCardNumber}
                disabled
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-stone-200 bg-stone-50 text-stone-500 outline-none cursor-not-allowed"
                placeholder="No library card assigned yet"
              />
            </div>
            <p className="mt-1 text-xs text-stone-500">Only administrators can update your library card number.</p>
          </div>

          {message && (
            <div className={`p-4 rounded-xl text-sm font-medium ${message.includes('success') ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              {message}
            </div>
          )}

          <div className="pt-4 border-t border-stone-100">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center justify-center w-full sm:w-auto px-8 py-3 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : <><Save size={20} className="mr-2" /> Save Changes</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
