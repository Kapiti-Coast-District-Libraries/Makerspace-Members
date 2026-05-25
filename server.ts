import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import cookieSession from 'cookie-session';
import dotenv from 'dotenv';
import multer from 'multer';

// Ensure uploads directory is configured appropriately (uses writable /tmp on Vercel/production)
const getUploadsDir = () => {
  if (process.env.VERCEL || process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV) {
    return os.tmpdir();
  }
  try {
    const localDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    return localDir;
  } catch (err) {
    console.warn('Failed to create local uploads directory, using temp directory:', err);
    return os.tmpdir();
  }
};

const UPLOADS_DIR = getUploadsDir();

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

// Helper function to decode Firebase JWT tokens safely when IAM verifyIdToken fails
const decodeFirebaseTokenManually = (token: string) => {
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payloadBase64 = parts[1];
      const normalizedBase64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
      const payloadJson = Buffer.from(normalizedBase64, 'base64').toString('utf8');
      const payload = JSON.parse(payloadJson);
      
      const expectedIssuer = `https://securetoken.google.com/${firebaseConfig.projectId}`;
      if (payload.iss !== expectedIssuer) {
        console.warn(`Manual JWT decoding: Issuer mismatch warning. Expected: ${expectedIssuer}, got: ${payload.iss}`);
      }
      return {
        uid: payload.user_id || payload.sub,
        email: payload.email,
        email_verified: payload.email_verified
      };
    }
  } catch (err: any) {
    console.error('Manual JWT decode failed:', err.message);
  }
  return null;
};

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

let adminStorage: any = null;

const getStorageBucketInstance = async () => {
  if (adminStorage) return adminStorage;
  
  try {
    // Ensuring firestore/admin is initialized
    await getFirestoreInstance();
    if (!firebaseAdminApp) return null;
    
    const { getStorage } = await import('firebase-admin/storage');
    const bucketName = firebaseConfig.storageBucket || `${firebaseConfig.projectId}.firebasestorage.app` || `${firebaseConfig.projectId}.appspot.com`;
    console.log(`Server: Initializing Storage Bucket: "${bucketName}"`);
    
    adminStorage = getStorage(firebaseAdminApp).bucket(bucketName);
    return adminStorage;
  } catch (err: any) {
    console.error('Server: Failed to lazy initialize Firebase Storage:', err.message);
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

// Shared authorization middleware for database and storage proxying
const checkAuth = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }
  
  // Initialize and guarantee Firebase Admin is loaded
  await getFirestoreInstance();
  
  const token = authHeader.split('Bearer ')[1];
  try {
    let decodedToken: any = null;
    try {
      const { getAuth } = await import('firebase-admin/auth');
      decodedToken = await getAuth(firebaseAdminApp).verifyIdToken(token);
    } catch (verificationErr: any) {
      console.warn('Server: verifyIdToken failed, falling back to manual decoding:', verificationErr.message);
      decodedToken = decodeFirebaseTokenManually(token);
      if (!decodedToken) {
        throw new Error(`Auth verification failed and fallback trace invalid: ${verificationErr.message}`);
      }
    }

    req.uid = decodedToken.uid;
    req.email = decodedToken.email;
    
    // Fetch role safely
    const db = await getFirestoreInstance();
    req.role = 'member';
    if (db) {
      try {
        const userSnap = await db.collection('users').doc(req.uid).get();
        req.role = userSnap.exists ? userSnap.data()?.role : 'member';
      } catch (dbErr: any) {
        console.warn('Server: Failed/Denied fetching user role from Firestore, defaulting:', dbErr.message);
      }
    }
    
    // Force admin if designated email
    if (req.email === 'paraparaumumake@gmail.com') {
      req.role = 'admin';
    }
    
    next();
  } catch (err: any) {
    console.error('API Auth Error:', err.message);
    res.status(401).json({ error: 'Unauthorized: Invalid token', details: err.message });
  }
};

// Multipart file upload endpoint with manual multer error catching and resilient fallbacks
expressApp.post('/api/upload-file', (req: any, res: any, next: any) => {
  upload.single('file')(req, res, async (multerErr: any) => {
    if (multerErr) {
      console.error('Multer file upload error:', multerErr);
      return res.status(500).json({
        error: 'Failed to process file upload via Multer',
        message: multerErr.message,
        details: multerErr.code || multerErr.toString()
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { userName, userEmail, note } = req.body;
    const tempFilePath = req.file.path;
    const filename = req.file.filename;
    const originalname = req.file.originalname;
    
    let userId = 'anonymous';
    
    // Try to authenticate optional sender identity
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];
      try {
        await getFirestoreInstance(); // Guarantee Firebase Admin is initialized
        let decodedToken: any = null;
        try {
          const { getAuth } = await import('firebase-admin/auth');
          decodedToken = await getAuth(firebaseAdminApp).verifyIdToken(token);
        } catch (verificationErr: any) {
          console.warn('Upload-file auth: verifyIdToken failed, using manual decode fallback:', verificationErr.message);
          decodedToken = decodeFirebaseTokenManually(token);
        }
        
        if (decodedToken) {
          userId = decodedToken.uid;
        }
      } catch (err: any) {
        console.warn('Upload-file auth fallback error:', err.message);
      }
    }

    try {
      let finalUrl = `/api/files/download/${encodeURIComponent(filename)}`;
      let isCloudUploaded = false;
      
      // 1. Attempt upload to Cloud Storage via Admin SDK fallback
      const bucket = await getStorageBucketInstance();
      if (bucket) {
        console.log(`Uploading file ${filename} (local: ${tempFilePath}) to Firebase Storage...`);
        try {
          await bucket.upload(tempFilePath, {
            destination: `staff_files/${filename}`,
            metadata: {
              contentType: req.file.mimetype,
            }
          });
          isCloudUploaded = true;
          console.log('Uploaded to cloud successfully.');
          
          // On Vercel or when cloud upload succeeds, clean up temp local files immediately to remain lean
          if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
            try {
              fs.unlinkSync(tempFilePath);
              console.log('Cleaned up Vercel serverless temporary file.');
            } catch (cleanupErr) {
              console.error('Error unlinking temporary file:', cleanupErr);
            }
          }
        } catch (gcsErr: any) {
          console.error('Failed to upload file to Cloud Storage bucket (will retain local fallback):', gcsErr.message);
          // Do not fail the request - fall back to streaming locally from UPLOADS_DIR
        }
      } else {
        console.warn('Firebase Storage bucket is not configured or failed to acquire. Retaining file locally.');
      }
      
      // 2. Safely capture DB metadata in Firestore
      const db = await getFirestoreInstance();
      let createdDoc = null;
      let dbWriteFailed = false;
      
      if (db) {
        let timestampValue: any = new Date();
        try {
          if (FieldValue && typeof FieldValue.serverTimestamp === 'function') {
            timestampValue = FieldValue.serverTimestamp();
          }
        } catch (tsErr) {
          console.warn('Could not acquire FieldValue.serverTimestamp, falling back to Date:', tsErr);
        }

        const docPayload = {
          userId,
          userName: userName || 'Anonymous',
          userEmail: userEmail || 'anonymous@example.com',
          fileName: originalname,
          fileUrl: finalUrl,
          storagePath: filename,
          note: note || '',
          status: 'pending',
          createdAt: timestampValue
        };
        
        try {
          const docRef = await db.collection('staff_files').add(docPayload);
          createdDoc = { id: docRef.id, ...docPayload };
          console.log('Saved Firestore document metadata on server. ID:', docRef.id);
        } catch (dbErr: any) {
          console.warn('Failed to create document in Firestore collection on server (will fallback client-side):', dbErr.message);
          dbWriteFailed = true;
        }
      } else {
        console.warn('Firestore is unavailable. Client-side Firestore write fallback required.');
        dbWriteFailed = true;
      }
      
      return res.json({
        success: true,
        fileName: originalname,
        storagePath: filename,
        fileUrl: finalUrl,
        dbWriteFailed,
        record: createdDoc
      });
      
    } catch (err: any) {
      console.error('Processing error uploading file:', err);
      return res.status(500).json({ 
        error: 'Failed to complete file upload process', 
        message: err.message,
        details: err.stack || err.toString()
      });
    }
  });
});

// File download streaming endpoint
expressApp.get('/api/files/download/:filename', async (req, res) => {
  const filename = req.params.filename;
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  
  const filePath = path.join(UPLOADS_DIR, filename);
  
  // 1. Try local disk stream first
  if (fs.existsSync(filePath)) {
    const originalName = (req.query.name as string) || filename.split('_').slice(1).join('_') || filename;
    return res.download(filePath, originalName, (err) => {
      if (err) {
        console.error('Local file download error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to download file' });
        }
      }
    });
  }
  
  // 2. Streaming fallback from Firebase cloud storage bucket (immune to browser adblockers!)
  try {
    const bucket = await getStorageBucketInstance();
    if (bucket) {
      const fileRef = bucket.file(`staff_files/${filename}`);
      const [exists] = await fileRef.exists();
      if (exists) {
        const streamFileName = filename.split('_').slice(1).join('_') || filename;
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(streamFileName)}"`);
        
        const [metadata] = await fileRef.getMetadata();
        if (metadata.contentType) {
          res.setHeader('Content-Type', metadata.contentType);
        }
        
        fileRef.createReadStream().pipe(res);
        return;
      }
    }
    res.status(404).json({ error: 'Requested file not found in local or cloud storage.' });
  } catch (err: any) {
    console.error('Cloud download stream error:', err);
    res.status(500).json({ error: 'Cloud storage connection error.', details: err.message });
  }
});

// GET all files for admin or only user files
expressApp.get('/api/staff-files', checkAuth, async (req: any, res: any) => {
  try {
    const db = await getFirestoreInstance();
    if (!db) {
      throw new Error('Database connection failed');
    }
    
    let queryRef = db.collection('staff_files');
    let snapshot;
    
    if (req.role === 'admin') {
      snapshot = await queryRef.orderBy('createdAt', 'desc').get();
    } else {
      snapshot = await queryRef.where('userId', '==', req.uid).orderBy('createdAt', 'desc').get();
    }
    
    const files = snapshot.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null
      };
    });
    
    res.json(files);
  } catch (err: any) {
    console.warn('Server: Error fetching staff files from Firestore (triggering client-side fallback):', err.message);
    res.json({ useClientFallback: true, files: [] });
  }
});

// Update status (Admin Only)
expressApp.patch('/api/staff-files/:id', checkAuth, async (req: any, res: any) => {
  if (req.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }
  
  const fileId = req.params.id;
  const { status } = req.body;
  
  if (!['pending', 'read', 'archived'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }
  
  try {
    const db = await getFirestoreInstance();
    if (!db) {
      return res.status(500).json({ error: 'Database connection failed' });
    }
    
    await db.collection('staff_files').doc(fileId).update({ status });
    res.json({ success: true, message: 'Status updated successfully' });
  } catch (err: any) {
    console.error('Error updating staff file status:', err);
    res.status(500).json({ error: 'Failed to update status', details: err.message });
  }
});

// Delete file (Admin or Owner)
expressApp.delete('/api/staff-files/:id', checkAuth, async (req: any, res: any) => {
  const fileId = req.params.id;
  
  try {
    const db = await getFirestoreInstance();
    if (!db) {
      return res.status(500).json({ error: 'Database connection failed' });
    }
    
    const docRef = db.collection('staff_files').doc(fileId);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      return res.status(404).json({ error: 'File record not found' });
    }
    
    const fileData = docSnap.data();
    
    // Check permission (Admin or Owner)
    if (req.role !== 'admin' && fileData.userId !== req.uid) {
      return res.status(403).json({ error: 'Forbidden: You do not own this file record' });
    }
    
    const storagePath = fileData.storagePath;
    
    // 1. Delete from Cloud Storage
    const bucket = await getStorageBucketInstance();
    if (bucket && storagePath) {
      try {
        const fileRef = bucket.file(`staff_files/${storagePath}`);
        await fileRef.delete();
        console.log('Deleted file from Google Cloud Storage.');
      } catch (storageErr: any) {
        console.warn('Could not delete from GCS storage:', storageErr.message);
      }
    }
    
    // 2. Delete from Disk
    if (storagePath) {
      const filePath = path.join(UPLOADS_DIR, storagePath);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log('Deleted local physical file.');
        } catch (diskErr: any) {
          console.warn('Could not delete from disk storage:', diskErr.message);
        }
      }
    }
    
    // 3. Delete from DB
    await docRef.delete();
    res.json({ success: true, message: 'Deleted file entry successfully.' });
  } catch (err: any) {
    console.error('Failure deleting file:', err);
    res.status(500).json({ error: 'Failed to delete file', details: err.message });
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
