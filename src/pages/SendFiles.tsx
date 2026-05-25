import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, where, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  UploadCloud, FileText, CheckCircle, AlertCircle, Trash2, 
  Download, User, Mail, Search, Clock, Loader2, Paperclip, 
  ExternalLink, ShieldCheck, Inbox, File, RefreshCw, FileImage, 
  FileSpreadsheet, FileArchive, CheckSquare
} from 'lucide-react';

// Error handling helpers conforming to Firebase guidelines
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
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Interface for File Info
interface StaffFile {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  fileName: string;
  fileUrl: string;
  storagePath: string;
  note: string;
  status: 'pending' | 'read' | 'archived';
  createdAt: any;
}

export function SendFiles() {
  const { user, userRole, loading } = useAuth();
  
  // Tabs: 'upload' for everyone; 'inbox' for admins; 'my-uploads' for logged-in members
  const [activeTab, setActiveTab] = useState<'upload' | 'inbox' | 'my-uploads'>('upload');
  
  // Form states
  const [senderName, setSenderName] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [fileNote, setFileNote] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Upload progress states
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Database state
  const [filesList, setFilesList] = useState<StaffFile[]>([]);
  const [userFilesList, setUserFilesList] = useState<StaffFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  
  // Filter/Search states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'read' | 'archived'>('all');
  
  // Delete action state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

  // Prefill authenticated user identity
  useEffect(() => {
    if (user) {
      setSenderName(user.displayName || '');
      setSenderEmail(user.email || '');
    } else {
      setSenderName('');
      setSenderEmail('');
    }
  }, [user]);

  // Set default active tab when role loads
  useEffect(() => {
    if (userRole === 'admin') {
      setActiveTab('inbox');
    }
  }, [userRole]);

  // Unified function to fetch files from proxy API endpoint with direct client-side fallback
  const fetchFilesList = async () => {
    if (loading) return;
    setLoadingFiles(true);
    try {
      let data: any[] = [];
      let success = false;
      
      // 1. First attempt to fetch via Proxy API (handles physical server files)
      try {
        const headers: HeadersInit = {};
        if (user) {
          const token = await user.getIdToken();
          headers['Authorization'] = `Bearer ${token}`;
        }
        
        const response = await fetch('/api/staff-files', { headers });
        if (response.ok) {
          const jsonVal = await response.json();
          data = jsonVal.map((item: any) => ({
            ...item,
            createdAt: item.createdAt ? { toDate: () => new Date(item.createdAt) } : null
          }));
          success = true;
        } else {
          console.warn(`Proxy fetch returned non-ok status: ${response.status}`);
        }
      } catch (proxyErr) {
        console.warn('Failed/Forbidden loading files from API proxy, falling back to direct Firestore:', proxyErr);
      }
      
      // 2. If proxy fails or returns error (such as PERMISSION_DENIED), query Firestore directly
      if (!success) {
        console.log('Querying Firestore directly using client Web SDK...');
        let q;
        if (userRole === 'admin') {
          q = query(collection(db, 'staff_files'), orderBy('createdAt', 'desc'));
        } else if (user) {
          q = query(collection(db, 'staff_files'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
        } else {
          q = query(collection(db, 'staff_files'), where('userId', '==', 'anonymous'), orderBy('createdAt', 'desc'));
        }
        
        const querySnapshot = await getDocs(q);
        data = querySnapshot.docs.map(docSnap => {
          const docData = docSnap.data() as any;
          return {
            id: docSnap.id,
            ...docData,
            // If createdAt is a timestamp, it already has the .toDate() method
            createdAt: docData.createdAt || null
          };
        });
      }
      
      if (userRole === 'admin') {
        setFilesList(data);
      } else if (user) {
        setUserFilesList(data);
      }
    } catch (err: any) {
      console.error('Failed to load files from both API proxy and direct Firestore:', err);
    } finally {
      setLoadingFiles(false);
    }
  };

  // Re-fetch files list when user role or auth loading changes
  useEffect(() => {
    fetchFilesList();
  }, [user, userRole, loading]);

  // Drag & drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  // Upload actions
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setFeedbackMsg({ type: 'error', text: 'Please select a file to submit.' });
      return;
    }
    if (!senderName.trim() || !senderEmail.trim()) {
      setFeedbackMsg({ type: 'error', text: 'Please fill in your name and email.' });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setFeedbackMsg(null);

    // Save using standard multi-part xhr upload with progress tracking
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('userName', senderName);
    formData.append('userEmail', senderEmail);
    formData.append('note', fileNote);

    xhr.upload.addEventListener('progress', (progressEvent) => {
      if (progressEvent.lengthComputable) {
        const progress = Math.round((progressEvent.loaded / progressEvent.total) * 100);
        setUploadProgress(progress);
      }
    });

    xhr.addEventListener('load', async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);

          // If server reported that Firestore update failed on server-side (due to permissions),
          // handle fallback writing of document metadata client-side
          if (response.dbWriteFailed) {
            console.log('Server file saved, but Firestore write failed. Initiating client-side database write fallback...');
            const payload = {
              userId: user?.uid || 'anonymous',
              userName: senderName,
              userEmail: senderEmail,
              fileName: response.fileName,
              fileUrl: response.fileUrl,
              storagePath: response.storagePath,
              note: fileNote,
              status: 'pending' as const,
              createdAt: serverTimestamp()
            };
            
            try {
              await addDoc(collection(db, 'staff_files'), payload);
              console.log('Resilient client-side Firestore document metadata write successful.');
            } catch (writeErr: any) {
              console.error('Failed fallback client metadata write:', writeErr);
              handleFirestoreError(writeErr, OperationType.WRITE, 'staff_files');
            }
          }

          setFeedbackMsg({ type: 'success', text: 'Your file has been sent to the staff successfully!' });
          setSelectedFile(null);
          setFileNote('');
          if (!user) {
            setSenderName('');
            setSenderEmail('');
          }
          
          // Refresh list immediately
          fetchFilesList();
        } catch (err: any) {
          console.error('Error parsing file upload details:', err);
          setFeedbackMsg({ type: 'error', text: `Error finalizing upload: ${err.message || err}` });
        } finally {
          setIsUploading(false);
          setUploadProgress(null);
        }
      } else {
        let errorMsg = 'Upload failed';
        try {
          const response = JSON.parse(xhr.responseText);
          errorMsg = response.error || errorMsg;
        } catch (e) {}
        setFeedbackMsg({ type: 'error', text: `Upload failed: ${errorMsg}` });
        setIsUploading(false);
        setUploadProgress(null);
      }
    });

    xhr.addEventListener('error', () => {
      setFeedbackMsg({ type: 'error', text: 'Upload failed: network error. Please try again.' });
      setIsUploading(false);
      setUploadProgress(null);
    });

    xhr.open('POST', '/api/upload-file');
    
    // Pass Bearer idToken so backend matches owner details correctly
    if (user) {
      try {
        const idToken = await user.getIdToken();
        xhr.setRequestHeader('Authorization', `Bearer ${idToken}`);
      } catch (tokenErr) {
        console.warn('Could not acquire current token:', tokenErr);
      }
    }
    
    xhr.send(formData);
  };

  // Admin/User delete function (cleans up physical files AND db entries resiliently)
  const handleDeleteFile = async (fileItem: StaffFile) => {
    if (!window.confirm(`Are you sure you want to delete "${fileItem.fileName}"? This cannot be undone.`)) return;

    setDeletingId(fileItem.id);
    try {
      // 1. Attempt server-side delete first (to remove physical file from disk or storage bucket)
      try {
        const headers: HeadersInit = {
          'Content-Type': 'application/json'
        };
        if (user) {
          const token = await user.getIdToken();
          headers['Authorization'] = `Bearer ${token}`;
        }
        await fetch(`/api/staff-files/${fileItem.id}`, {
          method: 'DELETE',
          headers
        });
      } catch (proxyErr) {
        console.warn('Backend file deletion proxy failed, proceeding with direct DB delete:', proxyErr);
      }
      
      // 2. Guarantee Firestore document deletion using Client-side Web SDK directly
      const docPath = `staff_files/${fileItem.id}`;
      try {
        await deleteDoc(doc(db, 'staff_files', fileItem.id));
      } catch (dbErr: any) {
        console.error('Failed client-side delete document fallback:', dbErr);
        handleFirestoreError(dbErr, OperationType.DELETE, docPath);
      }
      
      setFeedbackMsg({ type: 'success', text: 'File deleted successfully.' });
      setTimeout(() => setFeedbackMsg(null), 3000);
      
      fetchFilesList();
    } catch (err: any) {
      console.error('Failed to complete file deletion:', err);
      alert(`Deletion failed: ${err.message || err}`);
    } finally {
      setDeletingId(null);
    }
  };

  // Admin status update action with direct Client-side Database sync guarantee
  const handleUpdateStatus = async (id: string, newStatus: 'pending' | 'read' | 'archived') => {
    setStatusUpdatingId(id);
    try {
      // 1. Attempt server-side status update first
      try {
        const headers: HeadersInit = {
          'Content-Type': 'application/json'
        };
        if (user) {
          const token = await user.getIdToken();
          headers['Authorization'] = `Bearer ${token}`;
        }
        await fetch(`/api/staff-files/${id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ status: newStatus })
        });
      } catch (proxyErr) {
        console.warn('Backend update query failed, proceeding with direct DB update:', proxyErr);
      }
      
      // 2. Direct client-side update fallback to ensure UI state syncs correctly
      const docPath = `staff_files/${id}`;
      try {
        await updateDoc(doc(db, 'staff_files', id), {
          status: newStatus
        });
      } catch (dbErr: any) {
        console.error('Direct client DB status update failed:', dbErr);
        handleFirestoreError(dbErr, OperationType.UPDATE, docPath);
      }
      
      fetchFilesList();
    } catch (err: any) {
      console.error('Failed to update status:', err);
      alert(`Status update failed: ${err.message || err}`);
    } finally {
      setStatusUpdatingId(null);
    }
  };

  // Inline styling / icons lookup based on file suffix
  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'xlsx':
      case 'xls':
      case 'csv':
        return <FileSpreadsheet className="text-emerald-500" size={24} />;
      case 'pdf':
        return <FileText className="text-rose-500" size={24} />;
      case 'zip':
      case 'rar':
      case '7z':
      case 'tar':
      case 'gz':
        return <FileArchive className="text-amber-500" size={24} />;
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'webp':
      case 'svg':
        return <FileImage className="text-blue-500" size={24} />;
      default:
        return <File className="text-stone-500" size={24} />;
    }
  };

  const getStatusColor = (status: 'pending' | 'read' | 'archived') => {
    switch (status) {
      case 'pending':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'read':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'archived':
        return 'bg-stone-100 text-stone-600 border-stone-200';
    }
  };

  // Helper format file sizes beautifully
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const filteredFiles = filesList.filter(file => {
    const matchesSearch = 
      file.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      file.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      file.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (file.note && file.note.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = statusFilter === 'all' || file.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-8">
      {/* Title & Description */}
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-stone-900">Send Files to Staff</h1>
        <p className="text-stone-500 mt-2 text-lg">
          Upload reference sheets, 3D design files (STL/gcode), laser cutter vector templates, or project summaries.
        </p>
      </header>

      {/* Tabs Row (Responsive design) */}
      <div className="flex border-b border-stone-200 pb-px gap-2">
        <button
          onClick={() => { setActiveTab('upload'); setFeedbackMsg(null); }}
          className={`px-5 py-3 font-semibold text-sm transition-all border-b-2 rounded-t-xl hover:bg-stone-100 ${
            activeTab === 'upload' 
              ? 'border-stone-900 text-stone-900 bg-white shadow-sm' 
              : 'border-transparent text-stone-500'
          }`}
        >
          <span className="flex items-center gap-2">
            <UploadCloud size={16} />
            Upload File
          </span>
        </button>

        {user && userRole !== 'admin' && (
          <button
            onClick={() => { setActiveTab('my-uploads'); setFeedbackMsg(null); }}
            className={`px-5 py-3 font-semibold text-sm transition-all border-b-2 rounded-t-xl hover:bg-stone-100 ${
              activeTab === 'my-uploads' 
                ? 'border-stone-900 text-stone-900 bg-white shadow-sm' 
                : 'border-transparent text-stone-500'
            }`}
          >
            <span className="flex items-center gap-2">
              <Inbox size={16} />
              My Uploads ({userFilesList.length})
            </span>
          </button>
        )}

        {userRole === 'admin' && (
          <button
            onClick={() => { setActiveTab('inbox'); setFeedbackMsg(null); }}
            className={`px-5 py-3 font-semibold text-sm transition-all border-b-2 rounded-t-xl hover:bg-stone-100 ${
              activeTab === 'inbox' 
                ? 'border-stone-900 text-stone-900 bg-white shadow-sm' 
                : 'border-transparent text-stone-500'
            }`}
          >
            <span className="flex items-center gap-2">
              <ShieldCheck className="text-emerald-600" size={16} />
              Staff Inbox ({filesList.length})
            </span>
          </button>
        )}
      </div>

      {feedbackMsg && (
        <div className={`p-4 rounded-xl flex items-center gap-3 border ${
          feedbackMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
        }`}>
          {feedbackMsg.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span className="text-sm font-medium">{feedbackMsg.text}</span>
        </div>
      )}

      {/* Render Main Tab Contents */}
      <AnimatePresence mode="wait">
        {activeTab === 'upload' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            {/* Form Left/Middle Column (Upload Card) */}
            <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-6">
              <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
                <Paperclip className="text-stone-400" size={24} />
                Submit New Document
              </h2>

              <form onSubmit={handleUploadSubmit} className="space-y-6">
                
                {/* Drag and Drop Zone */}
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">Upload Document</label>
                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                      isDragActive 
                        ? 'border-stone-900 bg-stone-50 scale-[0.99] shadow-inner' 
                        : 'border-stone-300 hover:bg-stone-50 hover:border-stone-400'
                    }`}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      className="hidden"
                      disabled={isUploading}
                    />

                    {selectedFile ? (
                      <div className="flex flex-col items-center space-y-3">
                        <div className="p-4 bg-stone-100 rounded-2xl">
                          {getFileIcon(selectedFile.name)}
                        </div>
                        <p className="text-stone-950 font-semibold text-lg max-w-xs truncate">{selectedFile.name}</p>
                        <p className="text-sm text-stone-500">{formatFileSize(selectedFile.size)}</p>
                        <span className="text-xs text-stone-400 bg-stone-100 px-3 py-1.5 rounded-full font-medium">Click to replace file</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center text-stone-600">
                          <UploadCloud size={28} />
                        </div>
                        <p className="text-stone-900 font-semibold">Drop your file here, or <span className="text-stone-600 underline">browse</span></p>
                        <p className="text-xs text-stone-500">Supports PDF, DOCX, ZIP, STL, JPG, STL, DXF, image files (Max 50MB)</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress bar state */}
                {isUploading && uploadProgress !== null && (
                  <div className="space-y-2 p-4 bg-stone-50 rounded-2xl border border-stone-200">
                    <div className="flex justify-between items-center text-xs font-semibold text-stone-700">
                      <span className="flex items-center gap-1.5">
                        <Loader2 size={14} className="animate-spin text-stone-600" />
                        Uploading file to secure storage...
                      </span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-stone-200 rounded-full h-2.5 overflow-hidden">
                      <div 
                        className="bg-stone-900 h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {/* Sender Identity Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1.5 flex items-center gap-1.5">
                      <User size={14} className="text-stone-400" />
                      Your Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Charlie Brown"
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      disabled={isUploading || !!user}
                      className="w-full px-4 py-2.5 rounded-xl border border-stone-200 outline-none focus:ring-2 focus:ring-stone-900 transition-all bg-stone-50 disabled:bg-stone-100 disabled:text-stone-500 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1.5 flex items-center gap-1.5">
                      <Mail size={14} className="text-stone-400" />
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="charlie@email.com"
                      value={senderEmail}
                      onChange={(e) => setSenderEmail(e.target.value)}
                      disabled={isUploading || !!user}
                      className="w-full px-4 py-2.5 rounded-xl border border-stone-200 outline-none focus:ring-2 focus:ring-stone-900 transition-all bg-stone-50 disabled:bg-stone-100 disabled:text-stone-500 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Additional notes/context */}
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Note/Instructions for Staff (Optional)</label>
                  <textarea
                    rows={4}
                    placeholder="Describe what this file is or specify printing settings (e.g. '0.2mm layer height, 20% infill in black PLA')"
                    value={fileNote}
                    onChange={(e) => setFileNote(e.target.value)}
                    disabled={isUploading}
                    className="w-full px-4 py-3 rounded-xl border border-stone-200 outline-none focus:ring-2 focus:ring-stone-900 transition-all resize-none bg-stone-50 text-sm"
                  />
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isUploading || !selectedFile}
                  className="w-full bg-stone-900 text-white font-semibold py-3 px-6 rounded-2xl hover:bg-stone-850 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                >
                  {isUploading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="animate-spin" size={18} />
                      Sending Document...
                    </span>
                  ) : (
                    'Send File to Staff'
                  )}
                </button>

              </form>
            </div>

            {/* Explanatory Sidebar Right */}
            <div className="space-y-6">
              <div className="bg-stone-900 text-white p-6 rounded-3xl shadow-md border border-stone-800">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <CheckSquare size={18} className="text-amber-400" />
                  Staff Guidelines
                </h3>
                <ul className="space-y-3 text-stone-300 text-sm leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400 font-bold">&#8226;</span>
                    <span>Upload your file in **STL or OBJ** format if requesting a 3D printing project.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400 font-bold">&#8226;</span>
                    <span>For Laser cutting, export your files as vector formats (such as **SVG or DXF**).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400 font-bold">&#8226;</span>
                    <span>Specify crucial measurements, materials, or custom instructions in the note details.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400 font-bold">&#8226;</span>
                    <span>Makerspace staff will review your files and contact you shortly with estimates or queue details.</span>
                  </li>
                </ul>
              </div>

              {!user && (
                <div className="bg-amber-50 border border-amber-200 p-6 rounded-3xl">
                  <h4 className="font-semibold text-amber-900 text-base mb-2">Sign In to Track History</h4>
                  <p className="text-sm text-amber-700 leading-relaxed mb-4">
                    Guests can upload files anytime, but signing into your Makerspace account allows you to securely track, inspect, or manage all historical uploads in the 'My Uploads' history panel.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Member upload history panel */}
        {activeTab === 'my-uploads' && user && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
                <Inbox size={24} className="text-stone-400" />
                My Sent Documents
              </h2>
              <span className="text-xs font-semibold bg-stone-100 text-stone-600 px-3 py-1 rounded-full border border-stone-200">
                {userFilesList.length} total uploads
              </span>
            </div>

            {loadingFiles ? (
              <div className="py-20 flex flex-col items-center justify-center text-stone-400 space-y-2">
                <Loader2 className="animate-spin" size={32} />
                <span className="text-sm">Loading your upload history...</span>
              </div>
            ) : userFilesList.length === 0 ? (
              <div className="py-16 text-center text-stone-500 bg-stone-50 rounded-2xl border border-stone-100">
                <File className="mx-auto mb-3 text-stone-300" size={40} />
                <p className="font-semibold">You haven't uploaded any documents yet.</p>
                <p className="text-sm text-stone-400 mt-1">Head back to upload to send your files to the Makerspace team.</p>
                <button
                  onClick={() => setActiveTab('upload')}
                  className="mt-4 px-4 py-2 bg-stone-900 text-white rounded-xl text-sm font-medium hover:bg-stone-800"
                >
                  Upload Now
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-stone-650">
                  <thead className="bg-stone-50 text-stone-750 text-xs uppercase tracking-wider border-b border-stone-200">
                    <tr>
                      <th className="px-6 py-4 rounded-tl-xl">File Name</th>
                      <th className="px-6 py-4">Uploaded Date</th>
                      <th className="px-6 py-4">Staff Note</th>
                      <th className="px-6 py-4">Review Status</th>
                      <th className="px-6 py-4 rounded-tr-xl text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 font-medium">
                    {userFilesList.map((file) => (
                      <tr key={file.id} className="hover:bg-stone-50/50 transition-colors">
                        <td className="px-6 py-4 font-semibold text-stone-900">
                          <div className="flex items-center gap-3">
                            {getFileIcon(file.fileName)}
                            <div className="max-w-xs truncate" title={file.fileName}>
                              {file.fileName}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-stone-500">
                          {file.createdAt?.toDate ? file.createdAt.toDate().toLocaleString() : 'Saving...'}
                        </td>
                        <td className="px-6 py-4 max-w-sm truncate text-stone-500 italic" title={file.note}>
                          {file.note || <span className="text-stone-350">No note attached</span>}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusColor(file.status)}`}>
                            {file.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <a
                            href={file.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <Download size={12} />
                            Get/View
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {/* Staff/Admin Portal Workspace */}
        {activeTab === 'inbox' && userRole === 'admin' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Search, Filter, Stats Row */}
            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="relative w-full md:w-96">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                <input
                  type="text"
                  placeholder="Search by file name, uploader, or message..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-stone-200 text-sm outline-none focus:ring-2 focus:ring-stone-900 focus:border-stone-950 bg-stone-50"
                />
              </div>

              {/* Status Filters */}
              <div className="flex gap-1 bg-stone-100 p-1.5 rounded-2xl w-full md:w-auto overflow-x-auto">
                {(['all', 'pending', 'read', 'archived'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={`px-4 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all ${
                      statusFilter === f 
                        ? 'bg-white text-stone-900 shadow-sm' 
                        : 'text-stone-500 hover:text-stone-800'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* List Table Container */}
            <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-stone-100 flex justify-between items-center">
                <h2 className="text-xl font-bold text-stone-900 flex items-center gap-2">
                  <Inbox className="text-emerald-600" size={22} />
                  Staff Library Inbox
                </h2>
                <span className="text-xs font-bold text-stone-500">
                  Showing {filteredFiles.length} of {filesList.length} files
                </span>
              </div>

              {loadingFiles ? (
                <div className="py-24 flex flex-col items-center justify-center text-stone-400 space-y-2">
                  <Loader2 className="animate-spin" size={36} />
                  <span className="text-sm">Loading submissions list...</span>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="py-20 text-center text-stone-400">
                  <File className="mx-auto text-stone-300 mb-3" size={44} />
                  <p className="font-semibold text-stone-950 mb-1">No matching files found.</p>
                  <p className="text-sm">Try widening your key terms or switching filters.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-stone-600">
                    <thead className="bg-stone-50 text-stone-700 text-xs uppercase tracking-wider font-bold border-b border-stone-200">
                      <tr>
                        <th className="px-6 py-4">Document / Metadata</th>
                        <th className="px-6 py-4">Sender Details</th>
                        <th className="px-6 py-4">Date Uploaded</th>
                        <th className="px-6 py-4">Instructions Note</th>
                        <th className="px-6 py-4">Review Status</th>
                        <th className="px-6 py-4 text-center">Action Options</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 font-medium">
                      {filteredFiles.map(file => (
                        <tr key={file.id} className="hover:bg-stone-50/50 transition-colors">
                          
                          {/* Suffix/File Column */}
                          <td className="px-6 py-4">
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 p-2 bg-stone-100 rounded-lg shrink-0">
                                {getFileIcon(file.fileName)}
                              </div>
                              <div className="space-y-1">
                                <p className="font-bold text-stone-950 break-all max-w-[200px]" title={file.fileName}>{file.fileName}</p>
                                <p className="text-[10px] text-stone-400 lowercase font-mono">Location: Storage / staff_files</p>
                              </div>
                            </div>
                          </td>

                          {/* Sender Details */}
                          <td className="px-6 py-4 space-y-1">
                            <div className="flex items-center gap-1.5 text-stone-900 font-bold text-sm">
                              <User size={13} className="text-stone-400" />
                              {file.userName}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-stone-500 font-medium select-all">
                              <Mail size={12} className="text-stone-350" />
                              {file.userEmail}
                            </div>
                            {file.userId === 'anonymous' ? (
                              <span className="inline-block text-[10px] uppercase font-bold text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 mt-1 border border-amber-200">
                                Guest Upload
                              </span>
                            ) : (
                              <span className="inline-block text-[10px] uppercase font-bold text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5 mt-1 border border-emerald-200" title={`UID: ${file.userId}`}>
                                Verified member
                              </span>
                            )}
                          </td>

                          {/* Timestamp */}
                          <td className="px-6 py-4 text-xs text-stone-500 whitespace-nowrap">
                            {file.createdAt?.toDate ? (
                              <div className="space-y-0.5 font-semibold">
                                <p className="text-stone-800">{file.createdAt.toDate().toLocaleDateString()}</p>
                                <p className="text-stone-400 font-mono text-[10px]">{file.createdAt.toDate().toLocaleTimeString()}</p>
                              </div>
                            ) : (
                              'Recently'
                            )}
                          </td>

                          {/* Staff Instructions Note */}
                          <td className="px-6 py-4 max-w-[280px]">
                            {file.note ? (
                              <p className="text-stone-700 text-xs italic bg-stone-50 p-2.5 rounded-xl border border-stone-200 leading-relaxed whitespace-pre-wrap max-h-24 overflow-y-auto">
                                {file.note}
                              </p>
                            ) : (
                              <span className="text-stone-400 italic text-xs">No specifications left</span>
                            )}
                          </td>

                          {/* Status and Action dropdowns */}
                          <td className="px-6 py-4">
                            <div className="relative group/status select-none">
                              <select
                                value={file.status}
                                disabled={statusUpdatingId === file.id}
                                onChange={(e) => handleUpdateStatus(file.id, e.target.value as any)}
                                className={`px-2.5 py-1.5 font-bold text-xs rounded-xl border outline-none cursor-pointer transition-all ${getStatusColor(file.status)} ${
                                  statusUpdatingId === file.id ? 'opacity-40 animate-pulse' : 'hover:brightness-95'
                                }`}
                              >
                                <option value="pending">🟡 Pending</option>
                                <option value="read">🔵 Read</option>
                                <option value="archived">⚪ Archived</option>
                              </select>
                            </div>
                          </td>

                          {/* File control triggers */}
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              
                              {/* Open/download url */}
                              <a
                                href={file.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open or download file"
                                className="p-2 text-stone-500 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-xl transition-all"
                              >
                                <Download size={16} />
                              </a>

                              {/* Delete storage content + doc key */}
                              <button
                                onClick={() => handleDeleteFile(file)}
                                disabled={deletingId === file.id}
                                title="Delete file forever"
                                className={`p-2 text-rose-500 hover:text-white hover:bg-rose-600 bg-rose-50 rounded-xl transition-all ${
                                  deletingId === file.id ? 'opacity-50 animate-pulse' : ''
                                }`}
                              >
                                {deletingId === file.id ? (
                                  <Loader2 className="animate-spin" size={16} />
                                ) : (
                                  <Trash2 size={16} />
                                )}
                              </button>

                            </div>
                          </td>

                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
