import React, { useState, useEffect } from 'react';
import { 
  collection, 
  getDocs, 
  deleteDoc, 
  doc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  setDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { ref as storageRef, deleteObject } from 'firebase/storage';
import { db, auth, storage } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  UploadCloud, FileText, CheckCircle, AlertCircle, Trash2, 
  Download, User, Mail, Search, Loader2, 
  ExternalLink, ShieldCheck, Inbox, File, FileImage, 
  FileSpreadsheet, FileArchive, CheckSquare, Settings, Link2,
  Info, Eye, EyeOff, FileCode, Check, RefreshCw, Copy, ListFilter
} from 'lucide-react';

// Error handling helper conforming to Firebase guidelines
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

// Interface for Legacy Files Info
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

// Interface for live Google Sheets submissions
interface LiveSheetRow {
  timestamp: string;
  senderName: string;
  senderEmail: string;
  fileName: string;
  note: string;
  fileUrl: string;
  rawRow: string[];
}

export function SendFiles() {
  const { user, userRole, loading } = useAuth();
  
  // Tabs: 'upload' for Google Forms; 'inbox' for admins; 'my-uploads' for logged-in history
  const [activeTab, setActiveTab] = useState<'upload' | 'inbox' | 'my-uploads'>('upload');
  
  // Dynamic Google Forms Configuration
  const defaultFormUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSfD_wS1-E9cW3h5bVFR1kG79qC76mF9Yc0Bf55W7q_uO3nCcQ/viewform';
  const [googleFormUrl, setGoogleFormUrl] = useState(defaultFormUrl);
  const [tempFormUrl, setTempFormUrl] = useState(defaultFormUrl);
  
  // Published Google Sheet CSV configuration
  const [sheetCsvUrl, setSheetCsvUrl] = useState('');
  const [tempSheetCsvUrl, setTempSheetCsvUrl] = useState('');
  
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configSuccessMsg, setConfigSuccessMsg] = useState<string | null>(null);
  const [configErrorMsg, setConfigErrorMsg] = useState<string | null>(null);
  
  // Controls whether the iframe preview is rendered
  const [showEmbeddedForm, setShowEmbeddedForm] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Legacy files list database state
  const [filesList, setFilesList] = useState<StaffFile[]>([]);
  const [userFilesList, setUserFilesList] = useState<StaffFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  
  // Google Sheets Feed states
  const [sheetRows, setSheetRows] = useState<LiveSheetRow[]>([]);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [inboxSource, setInboxSource] = useState<'google-form' | 'direct'>('google-form');
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Filter/Search states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'read' | 'archived'>('all');
  
  // Deleting and updating states
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

  // Auto-processes standard link to embedded format (appends query parameters) if possible
  const getEmbedUrl = (url: string): string => {
    if (!url) return '';
    let cleanUrl = url.trim();
    
    // Check if edit link is provided, convert to public view link
    if (cleanUrl.includes('/edit')) {
      cleanUrl = cleanUrl.replace(/\/edit(\?.*)?$/, '/viewform');
    }
    
    // Ensure viewform has embedded param
    if (cleanUrl.includes('/viewform')) {
      if (!cleanUrl.includes('embedded=true')) {
        const separator = cleanUrl.includes('?') ? '&' : '?';
        cleanUrl = `${cleanUrl}${separator}embedded=true`;
      }
    }
    return cleanUrl;
  };

  // Auto-processes embedded links to standard native view for standalone tabs
  const getNativeUrl = (url: string): string => {
    if (!url) return '';
    let cleanUrl = url.trim();
    
    // Strip embedding flag to provide normal full-screen layout
    cleanUrl = cleanUrl.replace(/[?&]embedded=true/, '');
    cleanUrl = cleanUrl.replace(/\?&/, '?');
    if (cleanUrl.endsWith('?') || cleanUrl.endsWith('&')) {
      cleanUrl = cleanUrl.slice(0, -1);
    }
    return cleanUrl;
  };

  // Sync the configured Google Form URL & Live Responses CSV from Firestore
  useEffect(() => {
    const docRef = doc(db, 'app_config', 'google_form');
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data) {
          if (data.url) {
            setGoogleFormUrl(data.url);
            setTempFormUrl(data.url);
          }
          if (data.sheetCsvUrl) {
            setSheetCsvUrl(data.sheetCsvUrl);
            setTempSheetCsvUrl(data.sheetCsvUrl);
            setInboxSource('google-form');
          } else {
            setInboxSource('direct');
          }
        }
      }
    }, (err) => {
      console.warn('Config snapshot fallback used. Using default form URL.', err);
    });
    return () => unsub();
  }, []);

  // Sync tab focus when roles change
  useEffect(() => {
    if (userRole === 'admin') {
      setActiveTab('inbox');
    }
  }, [userRole]);

  // Read historical file logs
  const fetchFilesList = async () => {
    if (loading) return;
    setLoadingFiles(true);
    try {
      let q;
      if (userRole === 'admin') {
        q = query(collection(db, 'staff_files'), orderBy('createdAt', 'desc'));
      } else if (user) {
        q = query(collection(db, 'staff_files'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
      } else {
        q = query(collection(db, 'staff_files'), where('userId', '==', 'anonymous'), orderBy('createdAt', 'desc'));
      }
      
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(docSnap => {
        const docData = docSnap.data() as any;
        return {
          id: docSnap.id,
          ...docData,
          createdAt: docData.createdAt || null
        } as StaffFile;
      });
      
      if (userRole === 'admin') {
        setFilesList(data);
      } else if (user) {
        setUserFilesList(data);
      }
    } catch (err: any) {
      console.error('Failed to load legacy files:', err);
    } finally {
      setLoadingFiles(false);
    }
  };

  // Robust CSV Parser correctly managing quote contexts and commas
  const parseCSV = (text: string): string[][] => {
    const lines = text.split(/\r?\n/);
    const result: string[][] = [];
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      const row: string[] = [];
      let currentVal = '';
      let insideQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
          if (insideQuotes && nextChar === '"') {
            currentVal += '"';
            i++; 
          } else {
            insideQuotes = !insideQuotes;
          }
        } else if (char === ',' && !insideQuotes) {
          row.push(currentVal.trim());
          currentVal = '';
        } else {
          currentVal += char;
        }
      }
      row.push(currentVal.trim());
      result.push(row);
    }
    return result;
  };

  // Fetch responses from the public/published Google Spreadsheet CSV URL feed
  const fetchLiveSheetResponses = async () => {
    if (!sheetCsvUrl) return;
    setLoadingSheet(true);
    setSheetError(null);
    try {
      const response = await fetch(sheetCsvUrl);
      if (!response.ok) {
        throw new Error(`Failed to load Google Sheet feed: HTTP ${response.status}`);
      }
      const csvText = await response.text();
      const parsed = parseCSV(csvText);
      if (parsed.length === 0) {
        setSheetRows([]);
        return;
      }

      const headers = parsed[0].map(h => h.toLowerCase());
      const dataRows = parsed.slice(1);

      // Automatic heuristic-based Column Detection
      let timestampColIndex = 0;
      let nameColIndex = -1;
      let emailColIndex = -1;
      let filenameColIndex = -1;
      let noteColIndex = -1;
      let fileUrlColIndex = -1;

      headers.forEach((hdr, idx) => {
        if (hdr.includes('timestamp') || hdr.includes('date') || hdr.includes('time')) {
          if (timestampColIndex === 0) timestampColIndex = idx;
        }
        else if (hdr.includes('name') || hdr.includes('who') || hdr.includes('student') || hdr.includes('user') || hdr.includes('sender')) {
          if (nameColIndex === -1) nameColIndex = idx;
        }
        else if (hdr.includes('email') || hdr.includes('mail') || hdr.includes('contact')) {
          if (emailColIndex === -1) emailColIndex = idx;
        }
        else if (hdr.includes('filename') || hdr.includes('model') || hdr.includes('title') || hdr.includes('project') || hdr.includes('file name') || hdr.includes('upload')) {
          if (filenameColIndex === -1) filenameColIndex = idx;
        }
        else if (hdr.includes('note') || hdr.includes('instruction') || hdr.includes('comment') || hdr.includes('desc') || hdr.includes('message') || hdr.includes('details')) {
          if (noteColIndex === -1) noteColIndex = idx;
        }
        else if (hdr.includes('drive') || hdr.includes('link') || hdr.includes('url') || hdr.includes('attachment') || hdr.includes('folder')) {
          if (fileUrlColIndex === -1) fileUrlColIndex = idx;
        }
      });

      // Sensible column placement offsets fallback
      if (nameColIndex === -1) nameColIndex = Math.min(1, headers.length - 1);
      if (emailColIndex === -1) emailColIndex = Math.min(2, headers.length - 1);
      if (filenameColIndex === -1) filenameColIndex = Math.min(3, headers.length - 1);
      if (noteColIndex === -1) noteColIndex = Math.min(4, headers.length - 1);
      if (fileUrlColIndex === -1) fileUrlColIndex = Math.min(5, headers.length - 1);

      const items: LiveSheetRow[] = dataRows.map((row, rIdx) => {
        const timestamp = row[timestampColIndex] || 'N/A';
        const senderName = row[nameColIndex] || `Student #${rIdx + 1}`;
        const senderEmail = row[emailColIndex] || '';
        const rawFileName = row[filenameColIndex] || 'Submited Model Design';
        const note = row[noteColIndex] || '';
        
        // Scan line dynamically to find standard Google Drive upload links
        let fileUrl = row[fileUrlColIndex] || '';
        if (!fileUrl.startsWith('http')) {
          const driveLink = row.find(cell => cell.startsWith('https://drive.google.com') || cell.includes('google.com/open') || cell.includes('drive.google.com'));
          if (driveLink) fileUrl = driveLink;
        }

        // Clean up Google Drive link format or filename lists
        let fileName = rawFileName;
        if (fileName.startsWith('https://')) {
          fileName = 'Uploaded Design Content';
        }

        return {
          timestamp,
          senderName,
          senderEmail,
          fileName,
          note,
          fileUrl,
          rawRow: row
        };
      }).reverse(); // Most recent entries first

      setSheetRows(items);
    } catch (err: any) {
      console.error('Failed to parse sheet data:', err);
      setSheetError(err.message || String(err));
    } finally {
      setLoadingSheet(false);
    }
  };

  useEffect(() => {
    fetchFilesList();
  }, [user, userRole, loading]);

  useEffect(() => {
    if (activeTab === 'inbox' && sheetCsvUrl && inboxSource === 'google-form') {
      fetchLiveSheetResponses();
    }
  }, [activeTab, sheetCsvUrl, inboxSource]);

  // Admin configuration update function saves both parameters permanently to the cloud
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole !== 'admin') return;
    
    setIsSavingConfig(true);
    setConfigSuccessMsg(null);
    setConfigErrorMsg(null);
    
    try {
      let urlInput = tempFormUrl.trim();
      let sheetInput = tempSheetCsvUrl.trim();

      if (!urlInput) {
        throw new Error('Please fill in a valid Google Form address.');
      }
      
      // Enforce protocol prefixing
      if (!urlInput.startsWith('http://') && !urlInput.startsWith('https://')) {
        urlInput = 'https://' + urlInput;
      }
      if (sheetInput && !sheetInput.startsWith('http://') && !sheetInput.startsWith('https://')) {
        sheetInput = 'https://' + sheetInput;
      }
      
      const docRef = doc(db, 'app_config', 'google_form');
      await setDoc(docRef, {
        url: urlInput,
        sheetCsvUrl: sheetInput,
        updatedAt: serverTimestamp(),
        configuredBy: user?.email || 'admin'
      });
      
      setGoogleFormUrl(urlInput);
      setSheetCsvUrl(sheetInput);
      if (sheetInput) {
        setInboxSource('google-form');
      }
      setConfigSuccessMsg('Makerspace core settings and Google Sheets sync properties published live!');
    } catch (err: any) {
      console.error('Failed to publish system configuration:', err);
      setConfigErrorMsg(err.message || String(err));
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Legacy file cleanups
  const handleDeleteFile = async (fileItem: StaffFile) => {
    if (!window.confirm(`Are you sure you want to delete historical record "${fileItem.fileName}"? This operation cannot be undone.`)) return;

    setDeletingId(fileItem.id);
    try {
      if (fileItem.storagePath && fileItem.storagePath !== 'external-link') {
        try {
          const sRef = storageRef(storage, fileItem.storagePath);
          await deleteObject(sRef);
        } catch (storageErr) {
          console.warn('Storage object deletion skipped or failed:', storageErr);
        }
      }
      
      const docPath = `staff_files/${fileItem.id}`;
      try {
        await deleteDoc(doc(db, 'staff_files', fileItem.id));
      } catch (dbErr: any) {
        console.error('Failed direct delete of document:', dbErr);
        handleFirestoreError(dbErr, OperationType.DELETE, docPath);
      }
      
      setFeedbackMsg({ type: 'success', text: 'Legacy file worklog reference deleted successfully.' });
      fetchFilesList();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: `Failed to remove legacy files: ${err.message || err}` });
    } finally {
      setDeletingId(null);
    }
  };

  // Status updates
  const handleUpdateStatus = async (id: string, newStatus: 'pending' | 'read' | 'archived') => {
    setStatusUpdatingId(id);
    const docPath = `staff_files/${id}`;
    try {
      await updateDoc(doc(db, 'staff_files', id), {
        status: newStatus
      });
      setFeedbackMsg({ type: 'success', text: `Status updated successfully to: ${newStatus}` });
      fetchFilesList();
    } catch (dbErr: any) {
      console.error('Failed to update file status:', dbErr);
      setFeedbackMsg({ type: 'error', text: `Failed to change state: ${dbErr.message || dbErr}` });
      handleFirestoreError(dbErr, OperationType.UPDATE, docPath);
    } finally {
      setStatusUpdatingId(null);
    }
  };

  // Custom Icon getters
  const getFileIcon = (fileName: string) => {
    if (!fileName) return <File className="text-stone-500" size={20} />;
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'xlsx':
      case 'xls':
      case 'csv':
        return <FileSpreadsheet className="text-emerald-600" size={20} />;
      case 'pdf':
        return <FileText className="text-rose-600" size={20} />;
      case 'zip':
      case 'rar':
      case '7z':
      case 'tar':
        return <FileArchive className="text-amber-600" size={20} />;
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'webp':
      case 'svg':
        return <FileImage className="text-blue-600" size={20} />;
      case 'stl':
      case 'obj':
      case 'f3d':
      case 'step':
      case 'stp':
        return <FileCode className="text-indigo-600" size={20} />;
      default:
        return <File className="text-stone-500" size={20} />;
    }
  };

  const getStatusColor = (status: 'pending' | 'read' | 'archived') => {
    switch (status) {
      case 'pending':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'read':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'archived':
        return 'bg-stone-50 text-stone-600 border-stone-200';
    }
  };

  // Copy row columns utility
  const copyRowToClipboard = (row: string[], idx: number) => {
    const formatted = row.join(' | ');
    navigator.clipboard.writeText(formatted);
    setCopiedId(idx);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Live responses search filtering
  const filteredSheetRows = sheetRows.filter(row => {
    const term = searchTerm.toLowerCase();
    return (
      row.fileName.toLowerCase().includes(term) ||
      row.senderName.toLowerCase().includes(term) ||
      row.senderEmail.toLowerCase().includes(term) ||
      row.note.toLowerCase().includes(term) ||
      row.timestamp.toLowerCase().includes(term)
    );
  });

  const filteredFiles = filesList.filter(file => {
    const matchesSearch = 
      file.fileName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      file.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      file.userEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (file.note && file.note.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = statusFilter === 'all' || file.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-8 animate-fadeIn max-w-6xl mx-auto">
      {/* Title & Description */}
      <header className="mb-8">
        <h1 className="text-4xl font-extrabold tracking-tight text-stone-900 font-sans">Makerspace File Submission</h1>
        <p className="text-stone-500 mt-2 text-lg leading-relaxed max-w-3xl font-sans">
          Submit design documents, 3D printing STL models, laser cutting vectors, or reference formats directly to the Makerspace team.
        </p>
      </header>

      {/* Tabs list */}
      <div className="flex border-b border-stone-200 pb-px gap-2">
        <button
          onClick={() => { setActiveTab('upload'); setFeedbackMsg(null); }}
          className={`px-5 py-3 font-semibold text-sm transition-all border-b-2 rounded-t-xl hover:bg-stone-50 ${
            activeTab === 'upload' 
              ? 'border-stone-900 text-stone-900 bg-white font-bold' 
              : 'border-transparent text-stone-500'
          }`}
        >
          <span className="flex items-center gap-2">
            <UploadCloud size={16} />
            File Submission Form
          </span>
        </button>

        {user && userRole !== 'admin' && (
          <button
            onClick={() => { setActiveTab('my-uploads'); setFeedbackMsg(null); }}
            className={`px-5 py-3 font-semibold text-sm transition-all border-b-2 rounded-t-xl hover:bg-stone-50 ${
              activeTab === 'my-uploads' 
                ? 'border-stone-900 text-stone-900 bg-white font-bold' 
                : 'border-transparent text-stone-500'
            }`}
          >
            <span className="flex items-center gap-2">
              <Inbox size={16} />
              Legacy Sent History ({userFilesList.length})
            </span>
          </button>
        )}

        {userRole === 'admin' && (
          <button
            onClick={() => { setActiveTab('inbox'); setFeedbackMsg(null); }}
            className={`px-5 py-3 font-semibold text-sm transition-all border-b-2 rounded-t-xl hover:bg-stone-50 ${
              activeTab === 'inbox' 
                ? 'border-stone-900 text-stone-900 bg-white font-bold' 
                : 'border-transparent text-stone-500'
            }`}
          >
            <span className="flex items-center gap-2">
              <ShieldCheck className="text-emerald-600" size={16} />
              Admin Submission Inbox ({sheetCsvUrl ? sheetRows.length : filesList.length})
            </span>
          </button>
        )}
      </div>

      {feedbackMsg && (
        <div className={`p-4 rounded-xl flex items-center gap-3 border transition-all ${
          feedbackMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
        }`}>
          {feedbackMsg.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span className="text-sm font-medium">{feedbackMsg.text}</span>
        </div>
      )}

      {/* Render Portal Active View */}
      <AnimatePresence mode="wait">
        {activeTab === 'upload' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            {/* Admin Real-Time Configuration Card */}
            {userRole === 'admin' && (
              <div className="bg-amber-50 border border-amber-200 p-6 rounded-3xl shadow-sm space-y-5">
                <div className="flex items-center gap-2 text-amber-900">
                  <Settings size={20} className="text-amber-700" />
                  <h3 className="font-bold text-base">Google Forms & Response Sheet Configuration</h3>
                </div>
                
                <p className="text-amber-800 text-xs leading-relaxed max-w-4xl">
                  Configure the core workspace URL mappings below. Since Google Forms registersSTL/OBJ coordinates directly into your Google Drive, linking the **Response Spreadsheet** maps submitted items live straight into your Admin Inbox securely!
                </p>

                <form onSubmit={handleSaveConfig} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Google Form Link */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-amber-900 uppercase">1. Google Form Public Link</label>
                      <div className="relative">
                        <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-600" size={16} />
                        <input
                          type="url"
                          required
                          placeholder="https://docs.google.com/forms/d/e/.../viewform"
                          value={tempFormUrl}
                          onChange={(e) => setTempFormUrl(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-amber-250 bg-white outline-none focus:ring-2 focus:ring-stone-900 transition-all font-medium text-xs text-stone-900"
                        />
                      </div>
                    </div>

                    {/* Google Sheet Direct CSV Sync Feed */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-amber-900 uppercase">2. Published Sheet CSV Sync URL (Optional)</label>
                      <div className="relative">
                        <FileSpreadsheet className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-600" size={16} />
                        <input
                          type="url"
                          placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
                          value={tempSheetCsvUrl}
                          onChange={(e) => setTempSheetCsvUrl(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-amber-250 bg-white outline-none focus:ring-2 focus:ring-stone-900 transition-all font-medium text-xs text-stone-900"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-amber-200/50">
                    <div className="p-3 bg-white/70 rounded-xl text-[11px] text-amber-800 flex items-start gap-2 max-w-xl">
                      <Info size={14} className="text-amber-650 shrink-0 mt-0.5" />
                      <span>
                        <strong>How to publish sheet:</strong> In the responses spreadsheet: click <em>File &gt; Share &gt; Publish to web</em>. Select <em>"Form Responses 1"</em> and format <em>"Comma-separated values (.csv)"</em>, then copy/paste the link here.
                      </span>
                    </div>

                    <button
                      type="submit"
                      disabled={isSavingConfig}
                      className="bg-stone-900 text-white hover:bg-stone-850 px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
                    >
                      {isSavingConfig ? <Loader2 className="animate-spin" size={16} /> : null}
                      Update Portal Settings
                    </button>
                  </div>
                </form>

                {configSuccessMsg && (
                  <p className="text-emerald-750 text-xs font-semibold flex items-center gap-1.5 animate-fadeIn">
                    <CheckCircle size={14} />
                    {configSuccessMsg}
                  </p>
                )}
                {configErrorMsg && (
                  <p className="text-rose-750 text-xs font-semibold flex items-center gap-1.5 animate-fadeIn">
                    <AlertCircle size={14} />
                    {configErrorMsg}
                  </p>
                )}
              </div>
            )}

            {/* Core Google Forms Submission View */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Submission Card Left Side - Action Center */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-8">
                  <div className="space-y-3">
                    <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-150 text-indigo-800 px-3 py-1 rounded-full text-xs font-bold font-sans">
                      <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></span>
                      Google Forms Cloud
                    </div>
                    <h2 className="text-2xl font-extrabold text-stone-900 flex items-center gap-2 tracking-tight">
                      <UploadCloud className="text-indigo-600" size={26} />
                      Submit New Design Files
                    </h2>
                    <p className="text-stone-500 text-sm leading-relaxed font-sans">
                      All design files, 3D printing STL coordinate configurations, and laser vectors are submitted securely using our external Google Form. Google handles massive files, multi-gigabyte uploads, and credentials effortlessly!
                    </p>
                  </div>

                  {/* HIGH-CONTRAST PRIMARY FOCUS CARD FOR 100% RELIABILITY */}
                  <div className="p-8 bg-stone-900 text-white rounded-3xl shadow-md space-y-6 relative overflow-hidden">
                    <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-48 h-48 bg-stone-800 circle rounded-full opacity-30 pointer-events-none"></div>
                    
                    <div className="space-y-2">
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <CheckCircle className="text-emerald-400" size={20} />
                        Recommended Direct Action
                      </h3>
                      <p className="text-stone-300 text-xs leading-relaxed max-w-xl font-sans">
                        Because Google Forms requires direct account sign-in to permit secure file uploads, web browsers block rendering inside nested site iframes. Opening the form in a standalone tab is 100% reliable, works on all devices, and syncs instantly with staff folders!
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
                      <a
                        href={getNativeUrl(googleFormUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-white text-stone-950 font-bold px-8 py-4 rounded-xl hover:bg-stone-100 transition-all text-sm flex items-center justify-center gap-2 shadow-lg hover:scale-[1.01]"
                      >
                        <ExternalLink size={18} />
                        Open Official Submission Form
                      </a>
                      <span className="text-stone-400 text-xs text-center sm:text-left font-sans">
                        Opens in a secure new tab
                      </span>
                    </div>
                  </div>

                  {/* Toggle Embedded Section with explicit explanations */}
                  <div className="pt-4 border-t border-stone-200 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                          <Info size={14} className="text-stone-400" />
                          Embedded Window Options
                        </p>
                        <p className="text-[11px] text-stone-400 font-sans">
                          Try loading the secure Google Form in-situ directly on this page instead.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowEmbeddedForm(!showEmbeddedForm)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-lg transition-colors border border-stone-200"
                      >
                        {showEmbeddedForm ? (
                          <>
                            <EyeOff size={13} />
                            Hide Embedded Window
                          </>
                        ) : (
                          <>
                            <Eye size={13} />
                            Show Embedded Window
                          </>
                        )}
                      </button>
                    </div>

                    {/* Conditional rendering of Embedded Frame with detailed help panel */}
                    {showEmbeddedForm ? (
                      <div className="space-y-4 animate-fadeIn">
                        {/* Clear user help banner if frame fails to connect */}
                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 leading-normal space-y-1.5 font-sans">
                          <p className="font-bold flex items-center gap-1">
                            <AlertCircle size={14} className="text-amber-700 shrink-0" />
                            Is the embedded window displaying a "Refused to connect" or blank layout?
                          </p>
                          <p className="text-amber-800">
                            This is standard secure browser behavior! Since our Makerspace Form is configured with a <strong>"File Upload"</strong> field to receive your design documents, Google must verify your account context. Browser security prevents Google sign-in screens from appearing nested inside frames.
                          </p>
                          <p className="font-semibold text-amber-950">
                            👉 Simply click the "Open Official Submission Form" button above to bypass this block immediately in 1 second!
                          </p>
                        </div>

                        <div className="w-full h-[650px] bg-stone-50 rounded-2xl overflow-hidden border border-stone-250 shadow-inner relative">
                          <iframe
                            src={getEmbedUrl(googleFormUrl)}
                            width="100%"
                            height="100%"
                            frameBorder="0"
                            marginHeight={0}
                            marginWidth={0}
                            title="Google Form Secure Embed"
                            className="w-full h-full bg-white"
                          >
                            Loading submission form...
                          </iframe>
                        </div>
                      </div>
                    ) : null}
                  </div>

                </div>
              </div>

              {/* Guidelines Sidebar */}
              <div className="space-y-6">
                {/* Visual Step checklist */}
                <div className="bg-stone-50 border border-stone-200 p-6 rounded-3xl space-y-4">
                  <h4 className="font-bold text-stone-900 text-sm">How to Submit Your Files:</h4>
                  <div className="space-y-3.5">
                    <div className="flex gap-3">
                      <div className="w-5 h-5 rounded-full bg-indigo-105 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">1</div>
                      <p className="text-xs text-stone-600 leading-relaxed font-sans">
                        Click the high-contrast <strong>Open Official Form</strong> button to navigate safely to our Google workspace bucket.
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-5 h-5 rounded-full bg-indigo-105 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">2</div>
                      <p className="text-xs text-stone-600 leading-relaxed font-sans">
                        Log in with your academic or Google account if prompted (required for cloud storage file safety).
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-5 h-5 rounded-full bg-indigo-105 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">3</div>
                      <p className="text-xs text-stone-600 leading-relaxed font-sans">
                        Select and transfer your design files (PDF vectors, STL meshes, CAD references up to 10 GB).
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-5 h-5 rounded-full bg-indigo-105 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">4</div>
                      <p className="text-xs text-stone-600 leading-relaxed font-sans">
                        Our on-duty staff will parse coordinates, queue machinery, and notify you when execution starts!
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-stone-950 text-white p-7 rounded-3xl shadow-md relative overflow-hidden">
                  <h3 className="text-base font-bold mb-3 flex items-center gap-2 border-b border-stone-800 pb-1.5 font-sans">
                    <CheckSquare size={16} className="text-indigo-400" />
                    Allowed Formats
                  </h3>
                  <ul className="space-y-2 text-stone-300 text-xs leading-relaxed font-sans">
                    <li>&#8226; <strong>3D Printing:</strong> .STL, .OBJ, .3MF, .F3D</li>
                    <li>&#8226; <strong>Laser Cutting:</strong> .DXF, .SVG, .PDF (vectors only)</li>
                    <li>&#8226; <strong>General:</strong> .ZIP, .DOCX, image drafts, blueprints</li>
                    <li>&#8226; <strong>Scale Limit:</strong> Up to 10 GB transfer per document</li>
                  </ul>
                </div>
              </div>

            </div>

          </motion.div>
        )}

        {/* Member legacy upload history tab */}
        {activeTab === 'my-uploads' && user && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm animate-fadeIn"
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-stone-900 flex items-center gap-2 font-sans">
                <Inbox size={22} className="text-stone-400" />
                Legacy Sent Documents History
              </h2>
              <span className="text-xs font-semibold bg-stone-105 text-stone-600 px-3 py-1 rounded-full border border-stone-200">
                {userFilesList.length} legacy logs
              </span>
            </div>

            <p className="text-xs text-stone-500 mb-6 bg-stone-50 p-4 rounded-2xl border border-stone-200 leading-normal font-sans">
              <strong>Notice:</strong> This grid tracks file records submitted through previous localized databases. New creations entered on the Google Form upload models straight to physical Drive locations.
            </p>

            {loadingFiles ? (
              <div className="py-20 flex flex-col items-center justify-center text-stone-405 space-y-2">
                <Loader2 className="animate-spin text-stone-400" size={32} />
                <span className="text-sm font-semibold">Loading legacy index...</span>
              </div>
            ) : userFilesList.length === 0 ? (
              <div className="py-16 text-center text-stone-400 bg-stone-50 rounded-2xl border border-stone-150">
                <File className="mx-auto mb-3 text-stone-300" size={36} />
                <p className="font-bold text-stone-950">No Legacy File Records Found.</p>
                <p className="text-xs text-stone-505 mt-1">If you need to submit models, utilize the 'File Submission Form' tab above.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-stone-650">
                  <thead className="bg-stone-50 text-stone-755 text-xs font-bold uppercase tracking-wider border-b border-stone-200">
                    <tr>
                      <th className="px-6 py-4">File Name</th>
                      <th className="px-6 py-4">Uploaded Date</th>
                      <th className="px-6 py-4">Staff Note</th>
                      <th className="px-6 py-4">Review Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 font-medium whitespace-nowrap">
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
                        <td className="px-6 py-4 text-xs text-stone-500">
                          {file.createdAt?.toDate ? file.createdAt.toDate().toLocaleString() : 'Saving...'}
                        </td>
                        <td className="px-6 py-4 max-w-sm truncate text-stone-500 italic text-xs whitespace-normal" title={file.note}>
                          {file.note || <span className="text-stone-300">No instructions left</span>}
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
                            className="inline-flex items-center gap-1 bg-stone-100 hover:bg-stone-200 text-stone-850 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all border border-stone-200"
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

        {/* Staff/Admin Portal Sync workspace logs */}
        {activeTab === 'inbox' && userRole === 'admin' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6 animate-fadeIn"
          >
            {/* Integrated Sync State Indicator */}
            {sheetCsvUrl ? (
              <div className="bg-emerald-50 border border-emerald-150 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-950 font-sans">
                <div className="flex items-start gap-2.5">
                  <div className="p-1.5 bg-emerald-100 rounded-lg shrink-0 mt-0.5">
                    <RefreshCw className="animate-spin text-emerald-700" size={14} />
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-bold flex items-center gap-1.5">
                      <span>Google Sheet Responses Active Sync Feed</span>
                      <span className="bg-emerald-600 text-white text-[9px] uppercase px-1.5 py-0.2 rounded font-mono font-bold tracking-wider">Live</span>
                    </p>
                    <p className="text-emerald-800 text-[11px]">
                      Fetching row records directly from Google Drive spreadsheet. Completely displays real-time items seamlessly!
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchLiveSheetResponses}
                    disabled={loadingSheet}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition-colors shadow-sm disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={loadingSheet ? 'animate-spin' : ''} />
                    Sync Now
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-150 p-4 rounded-2xl text-xs text-amber-950 font-sans space-y-1">
                <p className="font-bold flex items-center gap-1">
                  <AlertCircle size={14} className="text-amber-700" />
                  Live Google Forms response sync is currently pending setup
                </p>
                <p className="text-amber-800">
                  This panel defaults to list legacy DB fallback records. You can link your <strong>Form Responses Spreadsheet</strong> in the config settings above to sync and audit submissions completely in real-time!
                </p>
              </div>
            )}

            {/* Selector Tab bar if Sheet sync link is available */}
            {sheetCsvUrl && (
              <div className="flex border-b border-stone-200 gap-1.5">
                <button
                  type="button"
                  onClick={() => { setInboxSource('google-form'); setSearchTerm(''); }}
                  className={`px-4 py-2 text-xs font-bold transition-all border-b-2 ${
                    inboxSource === 'google-form' 
                      ? 'border-indigo-600 text-indigo-700' 
                      : 'border-transparent text-stone-500 hover:text-stone-850'
                  }`}
                >
                  📥 Google Form Responses ({filteredSheetRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => { setInboxSource('direct'); setSearchTerm(''); }}
                  className={`px-4 py-2 text-xs font-bold transition-all border-b-2 ${
                    inboxSource === 'direct' 
                      ? 'border-indigo-600 text-indigo-700' 
                      : 'border-transparent text-stone-500 hover:text-stone-850'
                  }`}
                >
                  📁 Fallback Database Logs ({filteredFiles.length})
                </button>
              </div>
            )}

            {/* Search, Filter, Stats Row */}
            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="relative w-full md:w-96">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                <input
                  type="text"
                  placeholder={
                    inboxSource === 'google-form' 
                      ? "Search students, file names, or form comments..." 
                      : "Search fallback records..."
                  }
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-stone-200 text-sm outline-none focus:ring-2 focus:ring-stone-900 focus:border-stone-950 bg-stone-50 font-sans"
                />
              </div>

              {/* Status Filters - Displayed only for Firestore documents */}
              {inboxSource === 'direct' && (
                <div className="flex gap-1 bg-stone-100 p-1.5 rounded-2xl w-full md:w-auto overflow-x-auto">
                  {(['all', 'pending', 'read', 'archived'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setStatusFilter(f)}
                      className={`px-4 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all ${
                        statusFilter === f 
                          ? 'bg-white text-stone-900 shadow-sm font-bold' 
                          : 'text-stone-500 hover:text-stone-800'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* RENDERING OPTION 1: GOOGLE FORM SHEET SYNCED RESPONSES */}
            {inboxSource === 'google-form' && sheetCsvUrl ? (
              <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden animate-fadeIn">
                <div className="p-6 border-b border-stone-150 flex justify-between items-center bg-stone-50/50">
                  <div className="space-y-1">
                    <h2 className="text-xl font-bold text-stone-900 flex items-center gap-2 font-sans">
                      <Inbox className="text-indigo-650 animate-pulse" size={22} />
                      Google Form Response Submissions
                    </h2>
                    <p className="text-[11px] text-stone-400 font-sans">Parsed live through public cloud CSV response schemas.</p>
                  </div>
                  <span className="text-xs font-bold text-stone-500 bg-stone-100 px-3 py-1 rounded-full border border-stone-200 font-sans">
                    Showing {filteredSheetRows.length} total entries
                  </span>
                </div>

                {loadingSheet ? (
                  <div className="py-24 flex flex-col items-center justify-center text-stone-400 space-y-3">
                    <Loader2 className="animate-spin text-stone-500" size={36} />
                    <span className="text-sm font-semibold font-sans">Synchronizing spreadsheet entries...</span>
                  </div>
                ) : sheetError ? (
                  <div className="p-8 text-center space-y-3 bg-rose-50/50 border-t border-rose-200">
                    <AlertCircle className="mx-auto text-rose-500" size={36} />
                    <p className="font-bold text-rose-950 font-sans">Sync Connectivity Blocked</p>
                    <p className="text-xs text-rose-700 max-w-xl mx-auto leading-relaxed font-sans">
                      The sheet feed could not be verified. Usually, this means the spreadsheet has not yet been published as a <strong>CSV</strong>. Make sure you went to "File &gt; Share &gt; Publish to web", selected "Form Responses 1" tab and chose "Comma-separated values (.csv)", and copied that direct result link!
                    </p>
                    <p className="text-[10px] text-rose-500 font-mono select-all bg-white py-1 px-2 border border-rose-100 rounded inline-block max-w-lg truncate">
                      {sheetError}
                    </p>
                  </div>
                ) : filteredSheetRows.length === 0 ? (
                  <div className="py-20 text-center text-stone-400 bg-stone-50 border-t border-stone-100">
                    <File className="mx-auto text-stone-300 mb-3" size={44} />
                    <p className="font-bold text-stone-950 mb-1 font-sans">No submissions matched your criteria.</p>
                    <p className="text-xs text-stone-500 font-sans">Try expanding your search parameters.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-stone-600">
                      <thead className="bg-stone-50 text-stone-700 text-xs font-bold uppercase tracking-wider border-b border-stone-200 select-none">
                        <tr>
                          <th className="px-6 py-4 font-sans">Timestamp / Date</th>
                          <th className="px-6 py-4 font-sans">Student Metadata</th>
                          <th className="px-6 py-4 font-sans">Uploaded Model Files</th>
                          <th className="px-6 py-4 font-sans">Submission notes</th>
                          <th className="px-6 py-4 text-center font-sans">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 font-medium">
                        {filteredSheetRows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-stone-50/40 transition-colors">
                            {/* Timestamp */}
                            <td className="px-6 py-4 whitespace-nowrap text-xs text-stone-500">
                              <div className="flex items-center gap-2 font-mono">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                {row.timestamp}
                              </div>
                            </td>

                            {/* Student Metadata */}
                            <td className="px-6 py-4 space-y-1">
                              <div className="flex items-center gap-1.5 text-stone-900 font-bold text-sm">
                                <User size={13} className="text-stone-450" />
                                {row.senderName}
                              </div>
                              {row.senderEmail && (
                                <div className="flex items-center gap-1.5 text-xs text-stone-500 font-medium select-all">
                                  <Mail size={12} className="text-stone-350" />
                                  {row.senderEmail}
                                </div>
                              )}
                            </td>

                            {/* File Document */}
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                {getFileIcon(row.fileName)}
                                <div className="space-y-0.5">
                                  <p className="font-bold text-stone-950 max-w-[220px] truncate" title={row.fileName}>
                                    {row.fileName}
                                  </p>
                                  {row.fileUrl ? (
                                    <span className="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-1 py-0.2 font-mono" title={row.fileUrl}>
                                      Google Drive Bucket
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-stone-400 italic">No storage link</span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Instructions note */}
                            <td className="px-6 py-4 max-w-[280px]">
                              {row.note ? (
                                <p className="text-stone-700 text-xs italic bg-stone-50 p-2.5 rounded-xl border border-stone-200 leading-normal max-h-20 overflow-y-auto font-sans">
                                  {row.note}
                                </p>
                              ) : (
                                <span className="text-stone-400 italic text-xs">No specifications left</span>
                              )}
                            </td>

                            {/* Action Options */}
                            <td className="px-6 py-4 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-2">
                                {row.fileUrl ? (
                                  <a
                                    href={row.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Open file in Google Drive space"
                                    className="flex items-center gap-1 bg-indigo-600 text-white hover:bg-indigo-700 font-bold text-xs px-3.5 py-2 rounded-xl transition-all shadow-sm"
                                  >
                                    <ExternalLink size={12} />
                                    Launch Drive File
                                  </a>
                                ) : (
                                  <span className="text-xs text-stone-400 italic">No URL</span>
                                )}

                                <button
                                  type="button"
                                  onClick={() => copyRowToClipboard(row.rawRow, idx)}
                                  title="Copy raw CSV columns"
                                  className="p-2 text-stone-500 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-xl transition-all border border-stone-200"
                                >
                                  {copiedId === idx ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
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
            ) : (
              /* RENDERING OPTION 2: FIRESTORE DIRECT DATABASE LOGS (existing code fallback) */
              <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden animate-fadeIn">
                <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50/50">
                  <div>
                    <h2 className="text-xl font-bold text-stone-900 flex items-center gap-2 font-sans">
                      <Inbox className="text-emerald-600" size={22} />
                      Direct Database Submission logs
                    </h2>
                    <p className="text-[11px] text-stone-400 font-sans font-medium">Historical Direct Storage Fallbacks</p>
                  </div>
                  <span className="text-xs font-bold text-stone-500 bg-stone-100 px-3 py-1 rounded-full border border-stone-200 font-sans">
                    Showing {filteredFiles.length} of {filesList.length} files
                  </span>
                </div>

                {loadingFiles ? (
                  <div className="py-24 flex flex-col items-center justify-center text-stone-400 space-y-2">
                    <Loader2 className="animate-spin text-stone-400" size={36} />
                    <span className="text-sm font-sans">Loading database records...</span>
                  </div>
                ) : filteredFiles.length === 0 ? (
                  <div className="py-20 text-center text-stone-400 bg-stone-50 border-t border-stone-100">
                    <File className="mx-auto text-stone-300 mb-3" size={44} />
                    <p className="font-bold text-stone-950 mb-1 font-sans">No matching records found.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-stone-600">
                      <thead className="bg-stone-50 text-stone-700 text-xs font-bold uppercase tracking-wider border-b border-stone-200">
                        <tr>
                          <th className="px-6 py-4 font-sans block md:table-cell">Document / Metadata</th>
                          <th className="px-6 py-4 font-sans">Sender Details</th>
                          <th className="px-6 py-4 font-sans">Date Uploaded</th>
                          <th className="px-6 py-4 font-sans">Instructions Note</th>
                          <th className="px-6 py-4 font-sans">Review Status</th>
                          <th className="px-6 py-4 text-center font-sans">Action Options</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 font-medium whitespace-nowrap">
                        {filteredFiles.map(file => (
                          <tr key={file.id} className="hover:bg-stone-50/50 transition-colors">
                            
                            {/* File metadata */}
                            <td className="px-6 py-4">
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5 p-2 bg-stone-105 rounded-lg shrink-0">
                                  {getFileIcon(file.fileName)}
                                </div>
                                <div className="space-y-1">
                                  <p className="font-bold text-stone-950 break-all max-w-[200px] truncate" title={file.fileName}>{file.fileName}</p>
                                  <p className="text-[10px] text-stone-400 font-mono">Type: Legacy DB Record</p>
                                </div>
                              </div>
                            </td>

                            {/* Sender details */}
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
                                  Guest Record
                                </span>
                              ) : (
                                <span className="inline-block text-[10px] uppercase font-bold text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5 mt-1 border border-emerald-200" title={`UID: ${file.userId}`}>
                                  Verified member
                                </span>
                              )}
                            </td>

                            {/* Upload date */}
                            <td className="px-6 py-4 text-xs text-stone-505 whitespace-nowrap">
                              {file.createdAt?.toDate ? (
                                <div className="space-y-0.5 font-semibold">
                                  <p className="text-stone-800">{file.createdAt.toDate().toLocaleDateString()}</p>
                                  <p className="text-stone-400 font-mono text-[10px]">{file.createdAt.toDate().toLocaleTimeString()}</p>
                                </div>
                              ) : (
                                <span className="text-stone-400 italic">Saving...</span>
                              )}
                            </td>

                            {/* Legacy staff note */}
                            <td className="px-6 py-4 max-w-[280px] whitespace-normal">
                              {file.note ? (
                                <p className="text-stone-700 text-xs italic bg-stone-50 p-2.5 rounded-xl border border-stone-200 leading-normal max-h-20 overflow-y-auto">
                                  {file.note}
                                </p>
                              ) : (
                                <span className="text-stone-400 italic text-xs">No instructions left</span>
                              )}
                            </td>

                            {/* Review status drop-down */}
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

                            {/* Actions */}
                            <td className="px-6 py-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                
                                <a
                                  href={file.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Open or download historical document"
                                  className="p-2 text-stone-500 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-xl transition-all border border-stone-200"
                                >
                                  <Download size={16} />
                                </a>

                                <button
                                  onClick={() => handleDeleteFile(file)}
                                  disabled={deletingId === file.id}
                                  title="Delete record permanently"
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
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
