import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import { google } from 'googleapis';
import cookieSession from 'cookie-session';
import dotenv from 'dotenv';
import { initializeApp, cert, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

dotenv.config();

// Import the Firebase configuration for project ID and database ID
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf-8'));

// Initialize Firebase Admin SDK
if (!getApps().length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) 
    : undefined;

  initializeApp({
    credential: serviceAccount ? cert(serviceAccount) : applicationDefault(),
    projectId: firebaseConfig.projectId
  });
}

const firestore = getFirestore(firebaseConfig.firestoreDatabaseId);
const configCollection = firestore.collection('server_config');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for Google Drive uploads
  },
});

const ADMIN_EMAIL = 'paraparaumumake@gmail.com';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 
  (process.env.APP_URL ? `${process.env.APP_URL}/api/auth/google/callback` : 'http://localhost:3000/api/auth/google/callback')
);

// Initialize Google Drive client cache
let driveClient: any = null;

export const expressApp = express();

async function startServer() {
  const PORT = 3000;

  expressApp.use(express.json());
  expressApp.use(cookieSession({
    name: 'session',
    keys: [process.env.SESSION_SECRET || 'makerspace-secret'],
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: true,
    sameSite: 'none',
  }));

  // Google OAuth Routes
  // Helper to get config from Firestore
  const getConfig = async (key: string) => {
    try {
      const doc = await configCollection.doc(key).get();
      return doc.exists ? doc.data() : null;
    } catch (err) {
      console.error('Error getting config from Firestore:', err);
      return null;
    }
  };

  // Helper to set config in Firestore
  const setConfig = async (key: string, value: any) => {
    try {
      await configCollection.doc(key).set({
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
      await configCollection.doc(key).delete();
    } catch (err) {
      console.error('Error deleting config from Firestore:', err);
    }
  };

  const getDriveClient = async () => {
    if (driveClient) return driveClient;

    // Option 1: Hard-wired Service Account (Preferred for production)
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      try {
        console.log('Server: Initializing Drive with Service Account...');
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
        const auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/drive.file'],
        });
        driveClient = google.drive({ version: 'v3', auth });
        return driveClient;
      } catch (err) {
        console.error('Server: Failed to initialize Service Account Drive client:', err);
      }
    }

    // Option 2: OAuth2 (Fallback)
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return null;
    }

    try {
      const config = await getConfig('google_drive_admin');
      if (config && config.tokens) {
        oauth2Client.setCredentials(config.tokens);
        driveClient = google.drive({ version: 'v3', auth: oauth2Client });
        return driveClient;
      }
    } catch (err) {
      console.error('Server: Failed to load OAuth tokens:', err);
    }

    return null;
  };

  expressApp.get('/api/auth/google/url', (req, res) => {
    try {
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        console.error('Server: Missing Google OAuth credentials.');
        return res.status(500).json({ error: 'Server missing Google OAuth credentials' });
      }

      const url = oauth2Client.generateAuthUrl({
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
    const { code } = req.query;
    
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.error('Server: Missing Google OAuth credentials in environment variables.');
      return res.status(500).send('Authentication failed: Server is missing Google OAuth credentials.');
    }

    try {
      console.log('Server: Received OAuth code, exchanging for tokens...');
      const { tokens } = await oauth2Client.getToken(code as string);
      
      console.log('Server: Tokens received, fetching user info...');
      oauth2Client.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();

      console.log(`Server: Authenticated as ${userInfo.data.email}`);

      if (userInfo.data.email !== ADMIN_EMAIL) {
        console.warn(`Server: Unauthorized connection attempt by ${userInfo.data.email}`);
        return res.status(403).send(`Unauthorized: Only the Makerspace Admin (${ADMIN_EMAIL}) can connect their Google Drive. You are logged in as ${userInfo.data.email}.`);
      }

      // Store tokens in Firestore
      console.log('Server: Storing tokens in Firestore...');
      await setConfig('google_drive_admin', { tokens, email: userInfo.data.email });

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error('Google Auth Error:', error);
      const errorMessage = error.response?.data?.error_description || error.message || 'Unknown error';
      res.status(500).send(`Authentication failed: ${errorMessage}`);
    }
  });

  expressApp.get('/api/auth/google/status', async (req, res) => {
    try {
      if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        return res.json({ connected: true, method: 'service_account' });
      }
      const client = await getDriveClient();
      res.json({ connected: !!client, method: client ? 'oauth' : 'none' });
    } catch (error) {
      res.json({ connected: false });
    }
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

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
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

  expressApp.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
