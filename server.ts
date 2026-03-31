import express from 'express';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import { google } from 'googleapis';
import cookieSession from 'cookie-session';
import dotenv from 'dotenv';
// Dynamic imports for firebase-admin to avoid top-level issues on Vercel
// import { initializeApp, cert, getApps, applicationDefault } from 'firebase-admin/app';
// import { getFirestore, FieldValue } from 'firebase-admin/firestore';

dotenv.config();

console.log('Server: Module loading...');

const getAppUrl = () => {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
};

const APP_URL = getAppUrl();

// Import the Firebase configuration for project ID and database ID
let firebaseConfig: any = {};
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } else {
    console.warn('Server: firebase-applet-config.json not found, using empty config.');
  }
} catch (err) {
  console.error('Server: Failed to read firebase-applet-config.json:', err);
}

// Global variables for lazy initialization
let firestore: any = null;
let firebaseAdminApp: any = null;

const getFirestoreInstance = async () => {
  if (firestore) return firestore;

  try {
    const { getApps, initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');

    if (!getApps().length) {
      console.log('Server: Initializing Firebase Admin...');
      const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
      let serviceAccount: any = undefined;
      
      if (serviceAccountStr) {
        try {
          serviceAccount = JSON.parse(serviceAccountStr);
          console.log('Server: Found FIREBASE_SERVICE_ACCOUNT env var.');
        } catch (e) {
          console.error('Server: Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', e);
        }
      } else {
        console.warn('Server: FIREBASE_SERVICE_ACCOUNT not found, falling back to applicationDefault()');
      }

      const projectId = firebaseConfig.projectId || process.env.GOOGLE_CLOUD_PROJECT;
      console.log(`Server: Project ID: ${projectId || 'unknown'}`);

      if (!projectId && !serviceAccount) {
        throw new Error('Missing Project ID and Service Account. Firebase Admin cannot be initialized.');
      }

      firebaseAdminApp = initializeApp({
        credential: serviceAccount ? cert(serviceAccount) : applicationDefault(),
        projectId: projectId
      });
      console.log('Server: Firebase Admin initialized successfully.');
    } else {
      firebaseAdminApp = getApps()[0];
    }
    
    firestore = getFirestore(firebaseConfig.firestoreDatabaseId);
    console.log(`Server: Firestore initialized with database ID: ${firebaseConfig.firestoreDatabaseId || '(default)'}`);
    return firestore;
  } catch (err: any) {
    console.error('Server: Failed to initialize Firebase Admin or Firestore:', err.message);
    return null;
  }
};

const getConfigCollection = async () => {
  const db = await getFirestoreInstance();
  if (!db) return null;
  return db.collection('server_config');
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for Google Drive uploads
  },
});

const ADMIN_EMAIL = 'paraparaumumake@gmail.com';

const getOAuth2Client = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${APP_URL}/api/auth/google/callback`;
  
  if (!clientId || !clientSecret) {
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
  }
  
  console.log(`Server: Creating OAuth2 client with Redirect URI: ${redirectUri}`);
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

// Initialize Google Drive client cache
let driveClient: any = null;

export const expressApp = express();

// Helper to get config from Firestore
const getConfig = async (key: string) => {
  try {
    const collection = await getConfigCollection();
    if (!collection) return null;
    const doc = await collection.doc(key).get();
    return doc.exists ? doc.data() : null;
  } catch (err) {
    console.error('Error getting config from Firestore:', err);
    return null;
  }
};

// Helper to set config in Firestore
const setConfig = async (key: string, value: any) => {
  try {
    const collection = await getConfigCollection();
    if (!collection) return;
    
    const { FieldValue } = await import('firebase-admin/firestore');
    
    await collection.doc(key).set({
      ...value,
      updated_at: FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error('Error setting config in Firestore:', err);
  }
};

// Helper to delete config from Firestore
const deleteConfig = async (key: string) => {
  try {
    const collection = await getConfigCollection();
    if (!collection) return;
    await collection.doc(key).delete();
  } catch (err) {
    console.error('Error deleting config from Firestore:', err);
  }
};

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

// Google OAuth Routes
expressApp.get('/api/auth/google/url', (req, res) => {
  try {
    console.log('Server: /api/auth/google/url requested');
    const client = getOAuth2Client();

    const url = client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/userinfo.email'
      ],
      prompt: 'consent',
    });
    console.log('Server: Generated Google Auth URL successfully');
    res.json({ url });
  } catch (err: any) {
    console.error('Server: Error generating Google Auth URL:', err);
    res.status(500).json({ error: err.message || 'Failed to generate auth URL' });
  }
});

expressApp.get('/api/auth/google/callback', async (req, res) => {
  const { code, error } = req.query;
  console.log('Server: /api/auth/google/callback hit', { hasCode: !!code, error });

  if (error) {
    console.error('Server: Google OAuth error:', error);
    return res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #fef2f2;">
          <h1 style="color: #dc2626;">Authentication Failed</h1>
          <p>${error}</p>
          <p>Closing in <span id="timer">10</span> seconds...</p>
          <script>
            let count = 10;
            const timer = document.getElementById('timer');
            setInterval(() => {
              count--;
              timer.innerText = count;
              if (count <= 0) window.close();
            }, 1000);
          </script>
        </body>
      </html>
    `);
  }

  try {
    const client = getOAuth2Client();
    console.log('Server: Exchanging code for tokens...');
    const { tokens } = await client.getToken(code as string);
    
    console.log('Server: Tokens received, fetching user info...');
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const userInfo = await oauth2.userinfo.get();

    console.log(`Server: Authenticated as ${userInfo.data.email}`);

    if (userInfo.data.email !== ADMIN_EMAIL) {
      console.warn(`Server: Unauthorized connection attempt by ${userInfo.data.email}`);
      return res.status(403).send(`Unauthorized: Only the Makerspace Admin (${ADMIN_EMAIL}) can connect their Google Drive. You are logged in as ${userInfo.data.email}.`);
    }

    // Store tokens in Firestore
    console.log('Server: Storing tokens in Firestore...');
    await setConfig('google_drive_admin', { tokens, email: userInfo.data.email });
    
    driveClient = google.drive({ version: 'v3', auth: client });
    console.log('Server: Drive client updated with new tokens');

    res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #f0fdf4;">
          <h1 style="color: #16a34a;">Success!</h1>
          <p>Google Drive connected successfully.</p>
          <p>Closing in <span id="timer">5</span> seconds...</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
            }
            let count = 5;
            const timer = document.getElementById('timer');
            setInterval(() => {
              count--;
              timer.innerText = count;
              if (count <= 0) window.close();
            }, 1000);
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error('Server: OAuth Callback Error:', err);
    res.status(500).send('Authentication failed: ' + err.message);
  }
});

expressApp.get('/api/auth/google/status', async (req, res) => {
  try {
    const hasServiceAccount = !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const client = await getDriveClient();
    res.json({ 
      connected: !!client || hasServiceAccount, 
      method: hasServiceAccount ? 'service_account' : (client ? 'oauth' : 'none'),
      debug: {
        hasServiceAccount,
        hasClientId: !!process.env.GOOGLE_CLIENT_ID,
        hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
        hasRedirectUri: !!process.env.GOOGLE_REDIRECT_URI,
        appUrl: APP_URL,
        nodeEnv: process.env.NODE_ENV
      }
    });
  } catch (error: any) {
    console.error('Server: Status check error:', error);
    res.json({ connected: false, error: error.message });
  }
});

expressApp.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      hasServiceAccount: !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
      hasFirebaseAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT,
      hasClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      appUrl: APP_URL,
      nodeEnv: process.env.NODE_ENV || 'development',
      isVercel: !!process.env.VERCEL
    }
  });
});

expressApp.post('/api/auth/google/logout', async (req, res) => {
  try {
    await deleteConfig('google_drive_admin');
    driveClient = null; // Clear cache
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// API Route for file upload (storing in Google Drive)
expressApp.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const { userId, userName } = req.body;
    
    const drive = await getDriveClient();

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    if (!drive) {
      return res.status(401).json({ error: 'Makerspace Google Drive not connected. Please contact an administrator.' });
    }

    console.log(`Server: Uploading file ${file.originalname} to Admin Google Drive for user ${userId}`);

    // 1. Check if "Makerspace Uploads" folder exists, or create it
    let folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || '';
    
    if (!folderId) {
      const folderResponse = await drive.files.list({
        q: "name = 'Makerspace Uploads' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        fields: 'files(id)',
      });

      if (folderResponse.data.files && folderResponse.data.files.length > 0) {
        folderId = folderResponse.data.files[0].id!;
      } else {
        const folderMetadata = {
          name: 'Makerspace Uploads',
          mimeType: 'application/vnd.google-apps.folder',
        };
        const folder = await drive.files.create({
          requestBody: folderMetadata,
          fields: 'id',
        });
        folderId = folder.data.id!;
      }
    }

    // 2. Upload file to the folder
    const fileMetadata = {
      name: file.originalname,
      parents: [folderId],
    };

    // Multer memory storage doesn't have a path, so we write to a temp file briefly
    const tempDir = os.tmpdir();
    const tempPath = path.join(tempDir, 'temp_' + Date.now() + '_' + file.originalname);
    fs.writeFileSync(tempPath, file.buffer);

    const driveFile = await drive.files.create({
      requestBody: fileMetadata,
      media: {
        mimeType: file.mimetype,
        body: fs.createReadStream(tempPath),
      },
      fields: 'id, webViewLink',
    });

    // Cleanup temp file
    fs.unlinkSync(tempPath);

    // 3. Make file readable by anyone with the link (so admin can see it)
    await drive.permissions.create({
      fileId: driveFile.data.id!,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    // Return Drive info to client. Client will save to Firestore.
    res.json({ 
      success: true, 
      driveFileId: driveFile.data.id,
      fileUrl: driveFile.data.webViewLink,
      fileName: file.originalname,
      message: 'File stored in Google Drive successfully' 
    });
  } catch (error: any) {
    console.error('Server: Upload error:', error);
    res.status(500).json({ error: error.message || 'Internal server error during upload' });
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

const getDriveClient = async () => {
  if (driveClient) return driveClient;

  // Option 1: Hard-wired Service Account (Preferred for production)
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      console.log('Server: Found GOOGLE_SERVICE_ACCOUNT_JSON. Attempting to parse...');
      const jsonStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim();
      const credentials = JSON.parse(jsonStr);
      
      if (!credentials.client_email || !credentials.private_key) {
        throw new Error('Service Account JSON is missing client_email or private_key');
      }

      console.log(`Server: Initializing Drive with Service Account: ${credentials.client_email}`);
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/drive.file'],
      });
      driveClient = google.drive({ version: 'v3', auth });
      return driveClient;
    } catch (err: any) {
      console.error('Server: Failed to initialize Service Account Drive client:', err.message);
      console.error('Server: Check your GOOGLE_SERVICE_ACCOUNT_JSON environment variable.');
    }
  }

  // Option 2: OAuth2 (Fallback)
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      return null;
    }

    const config = await getConfig('google_drive_admin');
    if (config && config.tokens) {
      const client = getOAuth2Client();
      client.setCredentials(config.tokens);
      driveClient = google.drive({ version: 'v3', auth: client });
      return driveClient;
    }
  } catch (err) {
    console.error('Server: Failed to load OAuth tokens:', err);
  }

  return null;
};

if (!process.env.VERCEL) {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
  });
} else {
  console.log('Server: Running in Vercel environment, skipping startServer()');
}

console.log('Server: Module loading complete.');
