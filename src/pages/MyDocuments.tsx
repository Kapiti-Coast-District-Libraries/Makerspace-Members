import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, query, where, onSnapshot, orderBy, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject, uploadString, uploadBytes } from 'firebase/storage';
import { db, storage, auth, testFirestoreConnection } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { FileText, Upload, Trash2, Loader2, AlertCircle, CheckCircle, Clock, PlayCircle, ExternalLink } from 'lucide-react';

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
  const isAdmin = userRole === 'admin';
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStep, setUploadStep] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [filamentColor, setFilamentColor] = useState('');
  const [notes, setNotes] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [connectionMethod, setConnectionMethod] = useState<'none' | 'oauth' | 'service_account'>('none');
  const [checkingDrive, setCheckingDrive] = useState(true);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  useEffect(() => {
    if (authLoading) return;
    console.log('MyDocuments: Checking Drive status...');
    checkDriveStatus();
    
    const handleMessage = (event: MessageEvent) => {
      // Validate origin is from AI Studio preview or localhost
      const origin = event.origin;
      const isAllowedOrigin = origin.endsWith('.run.app') || 
                             origin.endsWith('.vercel.app') || 
                             origin.includes('localhost');
                             
      if (!isAllowedOrigin) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        console.log('Client: OAuth success message received');
        checkDriveStatus();
        setSuccess('Google Drive connected successfully!');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [authLoading]);

  const checkDriveStatus = async () => {
    try {
      const response = await fetch('/api/auth/google/status');
      const data = await response.json();
      console.log('MyDocuments: Drive status response:', data);
      setIsDriveConnected(data.connected);
      setConnectionMethod(data.method || 'none');
      setDebugInfo(data.debug);
    } catch (err) {
      console.error('MyDocuments: Error checking drive status:', err);
    } finally {
      setCheckingDrive(false);
    }
  };

  const handleConnectDrive = async () => {
    console.log('MyDocuments: handleConnectDrive clicked');
    // Open window immediately to avoid popup blockers
    const authWindow = window.open('about:blank', 'google_auth_popup', 'width=600,height=700');
    if (!authWindow) {
      console.error('MyDocuments: Popup blocked');
      setError('Popup blocked! Please allow popups for this site to connect Google Drive.');
      return;
    }
    
    authWindow.document.write('<p style="font-family: sans-serif; text-align: center; margin-top: 50px;">Loading authentication...</p>');

    try {
      console.log('MyDocuments: Fetching Google Auth URL...');
      const response = await fetch('/api/auth/google/url');
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Failed to fetch' }));
        throw new Error(errData.error || 'Failed to fetch auth URL');
      }
      
      const { url } = await response.json();
      console.log('MyDocuments: Redirecting popup to:', url);
      authWindow.location.href = url;
    } catch (err: any) {
      console.error('MyDocuments: Error starting OAuth:', err);
      authWindow.close();
      setError('Failed to start Google Drive connection: ' + (err.message || 'Unknown error'));
    }
  };

  const handleDisconnectDrive = async () => {
    try {
      await fetch('/api/auth/google/logout', { method: 'POST' });
      setIsDriveConnected(false);
      setSuccess('Google Drive disconnected.');
    } catch (err) {
      setError('Failed to disconnect Google Drive');
    }
  };

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

    // Basic validation for Google Drive storage (e.g., 50MB)
    if (file.size > 50 * 1024 * 1024) {
      setError('File is too large. Max size is 50MB.');
      return;
    }

    if (!isDriveConnected) {
      if (isAdmin) {
        setError('Please connect your Google Drive first.');
      } else {
        setError('Makerspace Google Drive is not connected. Please contact an administrator.');
      }
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadStep('Initializing...');
    setError('');
    setSuccess('');

    console.log('Starting upload process (Google Drive)...');
    
    // Timeout helper
    const withTimeout = (promise: Promise<any>, ms: number, stepName: string) => {
      return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout during ${stepName}`)), ms))
      ]);
    };

    try {
      // Step 1: Firestore connection
      setUploadStep('Checking database...');
      const isConnected = await withTimeout(testFirestoreConnection(), 5000, 'database check');
      if (!isConnected) {
        throw new Error('Could not connect to the database. Please check your internet connection.');
      }

      // Step 2: Server-side Upload & Save
      setUploadStep('Uploading & Saving...');
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', user.uid);
      formData.append('userName', user.displayName || user.email || 'Anonymous');
      formData.append('filamentColor', filamentColor);
      formData.append('notes', notes);

      const uploadResponse = await withTimeout(
        fetch('/api/upload', {
          method: 'POST',
          body: formData,
        }),
        60000, // 1 minute timeout
        'server upload'
      );

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({ error: 'Unknown server error' }));
        throw new Error(`Upload failed: ${errorData.error}`);
      }

      const result = await uploadResponse.json();

      // Step 3: Save to Firestore from Client
      setUploadStep('Finalizing record...');
      try {
        await addDoc(collection(db, 'print_jobs'), {
          userId: user.uid,
          userName: user.displayName || user.email || 'Anonymous',
          fileName: file.name,
          fileUrl: result.fileUrl,
          driveFileId: result.driveFileId,
          filamentColor: filamentColor || '',
          notes: notes || '',
          status: 'pending',
          createdAt: serverTimestamp(),
        });
      } catch (fsErr) {
        handleFirestoreError(fsErr, OperationType.CREATE, 'print_jobs');
      }

      setSuccess('Document uploaded and saved successfully!');
      setFilamentColor('');
      setNotes('');
      setUploadStep('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: any) {
      console.error('Upload error details:', err);
      setError(err.message || 'An unexpected error occurred. Please try again.');
      setUploadStep('');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = async (job: PrintJob) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    
    try {
      // Delete from Firestore
      await deleteDoc(doc(db, 'print_jobs', job.id));
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
        <h1 className="text-4xl font-bold tracking-tight text-stone-900">My Documents</h1>
        <p className="text-stone-500 mt-2 text-lg">Upload documents for 3D printing or processing.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-200">
            <h2 className="text-xl font-semibold text-stone-900 mb-6 flex items-center">
              <Upload className="mr-2" size={24} />
              Upload New
            </h2>

            {checkingDrive ? (
              <div className="flex items-center justify-center py-12 bg-stone-50 rounded-2xl border border-dashed border-stone-200">
                <Loader2 size={32} className="animate-spin text-stone-400" />
              </div>
            ) : !isDriveConnected ? (
              <div className="p-6 bg-stone-50 rounded-2xl border border-dashed border-stone-200 text-center space-y-4">
                <div className="p-3 bg-white rounded-full w-fit mx-auto shadow-sm">
                  <ExternalLink className="text-stone-400" size={24} />
                </div>
                <div>
                  <h3 className="font-medium text-stone-900">
                    {isAdmin ? 'Connect Google Drive' : 'Drive Not Connected'}
                  </h3>
                  <p className="text-sm text-stone-500 mt-1">
                    {isAdmin 
                      ? 'Connect your Google Drive to store user uploads securely.' 
                      : 'The Makerspace Google Drive is not connected. Please contact an administrator.'}
                  </p>
                </div>
                {isAdmin && (
                  <button
                    onClick={handleConnectDrive}
                    className="w-full py-2 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors font-medium"
                  >
                    Connect Now
                  </button>
                )}
              </div>
            ) : (
              <>
                {isAdmin && (
                  <div className="flex items-center justify-between mb-6 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                    <div className="flex items-center text-emerald-700 text-sm font-medium">
                      <CheckCircle size={16} className="mr-2" />
                      {connectionMethod === 'service_account' ? 'Admin Drive Hard-wired' : 'Admin Drive Connected'}
                    </div>
                    {connectionMethod === 'oauth' && (
                      <button 
                        onClick={handleDisconnectDrive}
                        className="text-xs text-stone-400 hover:text-stone-600 underline"
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                )}

                {isAdmin && debugInfo && (
                  <div className="mb-6 p-4 bg-stone-50 rounded-xl text-[10px] font-mono text-stone-500 overflow-auto max-h-32">
                    <p className="font-bold mb-1">Debug Info (Admin Only):</p>
                    <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
                  </div>
                )}

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
                    <label className="block text-sm font-medium text-stone-700 mb-1">Filament Color (Optional)</label>
                    <input
                      type="text"
                      value={filamentColor}
                      onChange={(e) => setFilamentColor(e.target.value)}
                      placeholder="e.g., PLA Black"
                      className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Additional Notes (Optional)</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Any specific instructions?"
                      rows={3}
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
                          <><Loader2 size={20} className="mr-2 animate-spin" /> {uploadStep}</>
                        ) : (
                          <><Upload size={20} className="mr-2" /> Upload to Drive</>
                        )}
                      </span>
                    </span>
                  </button>
                </form>
              </>
            )}
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
                        {(job.filamentColor || job.notes) && (
                          <div className="mt-2 text-sm text-stone-600 bg-white p-2 rounded-lg border border-stone-100">
                            {job.filamentColor && <p><span className="font-medium">Color:</span> {job.filamentColor}</p>}
                            {job.notes && <p><span className="font-medium">Notes:</span> {job.notes}</p>}
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
