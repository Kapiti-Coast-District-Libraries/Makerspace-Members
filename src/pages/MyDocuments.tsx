import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, query, where, onSnapshot, orderBy, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject, uploadString, uploadBytes } from 'firebase/storage';
import { db, storage, auth, testFirestoreConnection } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { FileText, Upload, Trash2, Loader2, AlertCircle, CheckCircle, Clock, PlayCircle, ExternalLink, Database as DatabaseIcon } from 'lucide-react';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface PrintJob {
  id: string;
  userId: string;
  userName: string;
  fileName: string;
  fileUrl?: string;
  fileData?: string;
  filamentColor?: string;
  notes?: string;
  status: 'pending' | 'processing' | 'ready' | 'completed';
  createdAt: any;
}

export function MyDocuments() {
  const { user, userRole, loading: authLoading } = useAuth();
  const isAdmin = userRole === 'admin' || user?.email === 'paraparaumumake@gmail.com';
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [filamentColor, setFilamentColor] = useState('');
  const [notes, setNotes] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user || authLoading) return;

    const q = query(
      collection(db, 'print_jobs'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const jobsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PrintJob[];
      setJobs(jobsData);
      setLoading(false);
    }, (err) => {
      console.error('Error fetching print jobs:', err);
      setError('Failed to load your documents.');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, authLoading]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 size={48} className="animate-spin text-stone-300" />
      </div>
    );
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError('Please select a file to upload.');
      return;
    }

    // Limit to 50MB
    if (file.size > 50 * 1024 * 1024) {
      setError('File is too large. Max size is 50MB.');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setError('');
    setSuccess('');

    try {
      // Step 1: Upload to Firebase Storage
      const storagePath = `print_jobs/${user.uid}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, storagePath);
      
      const uploadTask = uploadBytesResumable(storageRef, file);

      await new Promise<void>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(progress);
          },
          (error) => {
            console.error('Firebase Storage upload error:', error);
            reject(new Error('Failed to upload file to storage.'));
          },
          () => resolve()
        );
      });

      const fileUrl = await getDownloadURL(uploadTask.snapshot.ref);

      // Step 2: Save metadata to Firestore
      await addDoc(collection(db, 'print_jobs'), {
        userId: user.uid,
        userName: user.displayName || user.email || 'Anonymous',
        fileName: file.name,
        fileUrl,
        storagePath,
        filamentColor: filamentColor || '',
        notes: notes || '',
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      setSuccess('Document uploaded and saved successfully!');
      setFilamentColor('');
      setNotes('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: any) {
      console.error('Upload error details:', err);
      setError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = async (job: PrintJob) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    
    try {
      // 1. Delete from Firestore
      await deleteDoc(doc(db, 'print_jobs', job.id));

      // 2. Delete from Storage if it exists
      if (job.fileUrl && job.fileUrl.includes('firebasestorage.googleapis.com')) {
        try {
          // Attempt to extract path or use a stored path if available
          const storageRef = ref(storage, job.fileUrl);
          await deleteObject(storageRef);
        } catch (storageErr) {
          console.warn('Could not delete storage object (it might have been deleted already):', storageErr);
        }
      }
    } catch (err) {
      console.error('Error deleting document:', err);
      setError('Failed to delete document.');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="text-amber-500" size={20} />;
      case 'processing': return <PlayCircle className="text-blue-500" size={20} />;
      case 'ready': return <CheckCircle className="text-emerald-500" size={20} />;
      case 'completed': return <CheckCircle className="text-stone-500" size={20} />;
      default: return <AlertCircle className="text-stone-500" size={20} />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Pending Review';
      case 'processing': return 'Processing';
      case 'ready': return 'Ready for Pickup';
      case 'completed': return 'Completed';
      default: return 'Unknown';
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-4xl font-bold tracking-tight text-stone-900">Makerspace Document Storage</h1>
        <p className="text-stone-500 mt-2 text-lg">Securely upload documents for printing and review.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-200">
            <h2 className="text-xl font-semibold text-stone-900 mb-6 flex items-center">
              <Upload className="mr-2" size={24} />
              Upload New
            </h2>

            {error && (
              <div className="mb-6 p-4 bg-rose-50 text-rose-700 rounded-xl text-sm flex items-start">
                <AlertCircle size={16} className="mr-2 mt-0.5 flex-shrink-0" />
                {error}
              </div>
            )}

            {success && (
              <div className="mb-6 p-4 bg-emerald-50 text-emerald-700 rounded-xl text-sm flex items-start">
                <CheckCircle size={16} className="mr-2 mt-0.5 flex-shrink-0" />
                {success}
              </div>
            )}

            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">File</label>
                <input
                  type="file"
                  ref={fileInputRef}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-stone-50 file:text-stone-700 hover:file:bg-stone-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Additional Notes (Optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any context or instructions for this file..."
                  rows={4}
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={uploading}
                className="w-full flex flex-col items-center justify-center px-6 py-3 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors disabled:opacity-50 font-medium overflow-hidden relative"
              >
                {uploading && (
                  <div 
                    className="absolute inset-0 bg-stone-700 transition-all duration-300 ease-out origin-left"
                    style={{ width: `${uploadProgress}%`, opacity: 0.3 }}
                  />
                )}
                <span className="relative flex flex-col items-center">
                  <span className="flex items-center">
                    {uploading ? (
                      <><Loader2 size={20} className="mr-2 animate-spin" /> Uploading {Math.round(uploadProgress)}%</>
                    ) : (
                      <><Upload size={20} className="mr-2" /> Upload Document</>
                    )}
                  </span>
                </span>
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-200">
            <h2 className="text-xl font-semibold text-stone-900 mb-6 flex items-center">
              <FileText className="mr-2" size={24} />
              Your Uploads
            </h2>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={32} className="animate-spin text-stone-400" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-12 bg-stone-50 rounded-2xl border border-dashed border-stone-200">
                <FileText size={48} className="mx-auto text-stone-300 mb-4" />
                <h3 className="text-lg font-medium text-stone-900">No documents yet</h3>
                <p className="text-stone-500 mt-1">Upload a document to get started.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {jobs.map((job) => (
                  <div key={job.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl border border-stone-100 hover:border-stone-200 transition-colors bg-stone-50/50">
                    <div className="flex items-start space-x-4 mb-4 sm:mb-0">
                      <div className="p-3 bg-white rounded-xl shadow-sm border border-stone-100">
                        <FileText size={24} className="text-stone-700" />
                      </div>
                      <div>
                        <h3 className="font-medium text-stone-900 truncate max-w-[200px] sm:max-w-xs" title={job.fileName}>
                          {job.fileName}
                        </h3>
                        <div className="flex items-center text-sm text-stone-500 mt-1 space-x-3">
                          <span className="flex items-center">
                            {getStatusIcon(job.status)}
                            <span className="ml-1.5">{getStatusText(job.status)}</span>
                          </span>
                          {job.createdAt && (
                            <span>• {job.createdAt.toDate().toLocaleDateString()}</span>
                          )}
                        </div>
                        {job.notes && (
                          <div className="mt-2 text-sm text-stone-600 bg-white p-2 rounded-lg border border-stone-100">
                            <p><span className="font-medium">Notes:</span> {job.notes}</p>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2 sm:ml-4">
                      <a
                        href={job.fileUrl || job.fileData}
                        download={job.fileName}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-white text-stone-700 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors text-sm font-medium"
                      >
                        Download
                      </a>
                      {job.status === 'pending' && (
                        <button
                          onClick={() => handleDelete(job)}
                          className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={20} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
