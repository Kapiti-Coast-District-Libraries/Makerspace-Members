import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Camera, Plus, Trash2, Heart, QrCode, X, Upload } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export function ProjectBoard() {
  const { user, userRole } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [isAdding, setIsAdding] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Check if URL has ?new=true to auto-open the form (useful for QR code scans)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('new') === 'true') {
      setIsAdding(true);
    }

    const q = query(collection(db, 'projects'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const projData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(projData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const resizeImage = (file: File, maxWidth: number, maxHeight: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          
          // Return as Base64 string instead of Blob
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(dataUrl);
        };
        img.onerror = reject;
        img.src = event.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !imageFile) {
      return;
    }

    setUploading(true);
    setError(null);
    try {
      // 1. Resize image and convert to Base64 (max 800x800px, 70% quality JPEG)
      // This ensures the image is small enough to fit in a Firestore document (< 1MB)
      const base64Image = await resizeImage(imageFile, 800, 800);

      // 2. Save project to Firestore directly with the image data
      await addDoc(collection(db, 'projects'), {
        userId: user.uid,
        authorName: user.displayName || 'Anonymous',
        title,
        description,
        imageUrl: base64Image,
        createdAt: serverTimestamp(),
        likes: 0
      });
      resetForm();
    } catch (err: any) {
      console.error('Error saving project:', err);
      setError(err.message || 'An error occurred while uploading the project.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, authorId: string) => {
    if (userRole !== 'admin' && user?.uid !== authorId) return;
    try {
      await deleteDoc(doc(db, 'projects', id));
    } catch (err) {
      console.error('Error deleting project:', err);
    }
  };

  const handleLike = async (id: string, currentLikes: number) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'projects', id), {
        likes: (currentLikes || 0) + 1
      });
    } catch (err) {
      console.error('Error liking project:', err);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setImageFile(null);
    setImagePreview(null);
    setIsAdding(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    // Remove ?new=true from URL if present
    const url = new URL(window.location.href);
    if (url.searchParams.has('new')) {
      url.searchParams.delete('new');
      window.history.replaceState({}, '', url.toString());
    }
  };

  const qrCodeUrl = `${window.location.origin}/projects?new=true`;

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-stone-900">Project Board</h1>
          <p className="text-stone-500 mt-2 text-lg">See what others have made and share your own creations.</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowQR(true)}
            className="flex items-center bg-stone-100 text-stone-700 px-4 py-2 rounded-xl hover:bg-stone-200 transition-colors"
          >
            <QrCode size={20} className="mr-2" />
            My QR Code
          </button>
          {!isAdding && (
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center bg-stone-900 text-white px-4 py-2 rounded-xl hover:bg-stone-800 transition-colors"
            >
              <Plus size={20} className="mr-2" />
              Share Project
            </button>
          )}
        </div>
      </header>

      {showQR && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-sm w-full relative text-center">
            <button 
              onClick={() => setShowQR(false)}
              className="absolute top-4 right-4 text-stone-400 hover:text-stone-900"
            >
              <X size={24} />
            </button>
            <h2 className="text-2xl font-bold text-stone-900 mb-2">Post from Mobile</h2>
            <p className="text-stone-500 mb-8">Scan this code with your phone's camera to quickly upload a photo of your project.</p>
            <div className="flex justify-center bg-white p-4 rounded-xl border border-stone-100 shadow-sm inline-block mx-auto mb-6">
              <QRCodeSVG value={qrCodeUrl} size={200} />
            </div>
            <p className="text-xs text-stone-400 break-all">{qrCodeUrl}</p>
          </div>
        </div>
      )}

      {isAdding && (
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-200 mb-8 max-w-2xl">
          <h2 className="text-2xl font-semibold mb-4">Share a New Project</h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Project Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none"
                placeholder="e.g. Wooden Robot Toy"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">Project Photo</label>
              <div 
                className="border-2 border-dashed border-stone-300 rounded-2xl p-8 text-center cursor-pointer hover:bg-stone-50 transition-colors relative overflow-hidden"
                onClick={() => fileInputRef.current?.click()}
              >
                {imagePreview ? (
                  <div className="absolute inset-0 w-full h-full">
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <p className="text-white font-medium flex items-center"><Camera className="mr-2" /> Change Photo</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center text-stone-500">
                      <Upload size={24} />
                    </div>
                    <div>
                      <p className="text-stone-900 font-medium">Click to upload photo</p>
                      <p className="text-stone-500 text-sm mt-1">or take a picture on your phone</p>
                    </div>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Description</label>
              <textarea
                required
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none resize-y"
                placeholder="Tell us about how you made it, what materials you used, etc."
              />
            </div>
            <div className="flex justify-end space-x-3 pt-4 border-t border-stone-100">
              {error && (
                <div className="flex-1 text-sm text-red-600 flex items-center">
                  {error}
                </div>
              )}
              <button
                type="button"
                onClick={resetForm}
                disabled={uploading}
                className="px-6 py-2 text-stone-600 hover:bg-stone-100 rounded-xl transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploading || !imageFile}
                className="px-6 py-2 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors disabled:opacity-50 flex items-center"
              >
                {uploading ? 'Uploading...' : 'Post Project'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6">
        {projects.length === 0 ? (
          <p className="text-stone-500 text-center py-8 col-span-full">No projects shared yet. Be the first!</p>
        ) : (
          projects.map((proj) => (
            <div key={proj.id} className="break-inside-avoid bg-white rounded-3xl shadow-sm border border-stone-200 overflow-hidden group">
              <div className="relative">
                <img 
                  src={proj.imageUrl || 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=800'} 
                  alt={proj.title} 
                  className="w-full h-auto object-cover aspect-[4/3]"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=800';
                  }}
                />
                {(userRole === 'admin' || user?.uid === proj.userId) && (
                  <button 
                    onClick={() => handleDelete(proj.id, proj.userId)}
                    className="absolute top-4 right-4 p-2 bg-white/90 text-stone-600 hover:text-red-600 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
              <div className="p-6">
                <h3 className="text-xl font-semibold text-stone-900 mb-2">{proj.title}</h3>
                <p className="text-stone-600 text-sm mb-4 line-clamp-3">{proj.description}</p>
                <div className="flex items-center justify-between pt-4 border-t border-stone-100">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-stone-600 font-medium text-sm">
                      {proj.authorName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-stone-700">{proj.authorName}</span>
                  </div>
                  <div className="flex items-center space-x-3 text-stone-400">
                    <button 
                      onClick={() => handleLike(proj.id, proj.likes)}
                      className="hover:text-rose-500 transition-colors flex items-center space-x-1"
                    >
                      <Heart size={18} />
                      <span className="text-xs">{proj.likes || 0}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
