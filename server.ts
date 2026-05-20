import express from 'express';
import path from 'path';
import fs from 'fs';
import cookieSession from 'cookie-session';
import dotenv from 'dotenv';
import multer from 'multer';

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer storage engine configuration
const storageEngine = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, `${timestamp}_${sanitizedName}`);
  }
});

const upload = multer({
  storage: storageEngine,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB file size limit
  }
});

dotenv.config();

console.log('Server: Module loading...');

const getAppUrl = () => {
  let url = '';
  if (process.env.APP_URL) url = process.env.APP_URL;
  else if (process.env.VERCEL_URL) url = `https://${process.env.VERCEL_URL}`;
  else url = 'http://localhost:3000';
  
  // Remove trailing slash if present
  return url.replace(/\/$/, '');
};

const APP_URL = getAppUrl();

// Improved Firebase config loading
let firebaseConfig: any = {};
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    console.log(`Server: Loaded config from JSON. Project: ${firebaseConfig.projectId}, DB: ${firebaseConfig.firestoreDatabaseId}`);
  } else {
    console.warn('Server: firebase-applet-config.json not found, using environment variables.');
  }
} catch (err) {
  console.error('Server: Failed to read firebase-applet-config.json:', err);
}

// Fallback to environment variables if JSON is missing or incomplete
firebaseConfig.projectId = firebaseConfig.projectId || process.env.VITE_FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
firebaseConfig.firestoreDatabaseId = firebaseConfig.firestoreDatabaseId || process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID;

// Define Admin SDK imports at top level for reliability
import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Global variables for lazy initialization
let firestore: any = null;
let firebaseAdminApp: any = null;

const getFirestoreInstance = async () => {
  if (firestore) return firestore;

  try {
    const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
    const projectId = firebaseConfig.projectId;
    
    if (!getApps().length) {
      console.log('Server: Initializing Firebase Admin...');
      let serviceAccount: any = undefined;
      
      if (serviceAccountStr) {
        try {
          serviceAccount = JSON.parse(serviceAccountStr);
          console.log('Server: Found FIREBASE_SERVICE_ACCOUNT env var.');
        } catch (e) {
          console.error('Server: Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', e);
        }
      }

      console.log(`Server: Using Project ID: ${projectId || 'unknown'}`);

      const options: any = {
        projectId: projectId
      };

      if (serviceAccount) {
        options.credential = cert(serviceAccount);
      } else {
        console.log('Server: No service account provided, attempting to use applicationDefault()');
        try {
          options.credential = applicationDefault();
        } catch (authErr: any) {
          console.warn('Server: applicationDefault() failed, proceeding with project ID only:', authErr.message);
        }
      }

      firebaseAdminApp = initializeApp(options);
      console.log('Server: Firebase Admin initialized successfully.');
    } else {
      firebaseAdminApp = getApps()[0];
      console.log('Server: Using existing Firebase Admin app.');
    }
    
    // Explicitly pass the app to getFirestore
    try {
      const dbId = firebaseConfig.firestoreDatabaseId;
      if (dbId && dbId !== '(default)' && dbId !== '') {
        console.log(`Server: Connecting to Firestore database: "${dbId}"`);
        firestore = getFirestore(firebaseAdminApp, dbId);
      } else {
        console.log('Server: Connecting to default Firestore database.');
        firestore = getFirestore(firebaseAdminApp);
      }
      
      console.log('Server: Firestore instance acquired.');
    } catch (fsErr: any) {
      console.error('Server: Error explicitly getting Firestore instance:', fsErr.message);
      firestore = getFirestore(firebaseAdminApp);
    }
    
    return firestore;
  } catch (err: any) {
    console.error('Server: Critical failure initializing Firebase Admin or Firestore:', err.message);
    if (err.stack) console.error(err.stack);
    return null;
  }
};

const getConfigCollection = async () => {
  const db = await getFirestoreInstance();
  if (!db) return null;
  return db.collection('server_config');
};

export const expressApp = express();

expressApp.use(express.json());
expressApp.use(cookieSession({
  name: 'session',
  keys: [process.env.SESSION_SECRET || 'makerspace-secret'],
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  secure: true, // Required for sameSite: 'none'
  sameSite: 'none', // Required for iframes
}));

// Global error handler
expressApp.use((err: any, req: any, res: any, next: any) => {
  console.error('Global Error Handler:', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

expressApp.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      hasFirebaseAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT,
      projectId: firebaseConfig.projectId,
      nodeEnv: process.env.NODE_ENV || 'development'
    }
  });
});

// Multipart file upload endpoint
expressApp.post('/api/upload-file', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  res.json({
    success: true,
    fileName: req.file.originalname,
    storagePath: req.file.filename,
    fileUrl: `/api/files/download/${encodeURIComponent(req.file.filename)}`
  });
});

// File download streaming endpoint
expressApp.get('/api/files/download/:filename', (req, res) => {
  const filename = req.params.filename;
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  
  const filePath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  const originalName = (req.query.name as string) || filename.split('_').slice(1).join('_') || filename;
  
  res.download(filePath, originalName, (err) => {
    if (err) {
      console.error('File download error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download file' });
      }
    }
  });
});

// File deletion endpoint
expressApp.delete('/api/files/delete/:filename', (req, res) => {
  const filename = req.params.filename;
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  
  const filePath = path.join(UPLOADS_DIR, filename);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      res.json({ success: true, message: 'File deleted from disk' });
    } catch (err: any) {
      console.error('Error deleting file from disk:', err);
      res.status(500).json({ error: 'Could not delete file from disk', details: err.message });
    }
  } else {
    res.json({ success: true, message: 'File was already missing from disk' });
  }
});

async function startServer() {
  const PORT = 3000;

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    expressApp.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    expressApp.use(express.static(distPath));
    expressApp.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (!process.env.VERCEL) {
    expressApp.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Detected App URL: ${APP_URL}`);
    });
  }
}

if (!process.env.VERCEL) {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
  });
} else {
  console.log('Server: Running in Vercel environment, skipping startServer()');
}

console.log('Server: Module loading complete.');
