import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import multer from 'multer';
import admin from 'firebase-admin';
import fs from 'fs';
import { google } from 'googleapis';
import cookieSession from 'cookie-session';

// Load Firebase config
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf-8'));

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: firebaseConfig.projectId,
    });
    console.log('Server: Firebase Admin initialized successfully');
  } catch (initErr) {
    console.error('Server: Firebase Admin initialization failed:', initErr);
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for Google Drive uploads
  },
});

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 
  (process.env.APP_URL ? `${process.env.APP_URL}/api/auth/google/callback` : 'http://localhost:3000/api/auth/google/callback')
);

async function startServer() {
  const expressApp = express();
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
  expressApp.get('/api/auth/google/url', (req, res) => {
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive.file'],
      prompt: 'consent',
    });
    res.json({ url });
  });

  expressApp.get('/api/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      req.session!.tokens = tokens;
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
    } catch (error) {
      console.error('Google Auth Error:', error);
      res.status(500).send('Authentication failed');
    }
  });

  expressApp.get('/api/auth/google/status', (req, res) => {
    res.json({ connected: !!req.session?.tokens });
  });

  expressApp.post('/api/auth/google/logout', (req, res) => {
    req.session = null;
    res.json({ success: true });
  });

  // API Route for file upload (storing in Google Drive)
  expressApp.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
      const file = req.file;
      const { userId, userName, filamentColor, notes } = req.body;
      const tokens = req.session?.tokens;

      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
      }

      if (!tokens) {
        return res.status(401).json({ error: 'Google Drive not connected. Please connect your Google account first.' });
      }

      console.log(`Server: Uploading file ${file.originalname} to Google Drive for user ${userId}`);

      oauth2Client.setCredentials(tokens);
      const drive = google.drive({ version: 'v3', auth: oauth2Client });

      // 1. Check if "Makerspace Uploads" folder exists, or create it
      let folderId = '';
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

      // 2. Upload file to the folder
      const fileMetadata = {
        name: file.originalname,
        parents: [folderId],
      };
      const media = {
        mimeType: file.mimetype,
        body: fs.createReadStream(path.join(process.cwd(), 'temp_' + file.originalname)),
      };

      // Multer memory storage doesn't have a path, so we write to a temp file briefly
      const tempPath = path.join(process.cwd(), 'temp_' + Date.now() + '_' + file.originalname);
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

      // 4. Save to Firestore
      const docRef = await admin.firestore().collection('print_jobs').add({
        userId,
        userName: userName || 'Anonymous',
        fileName: file.originalname,
        fileUrl: driveFile.data.webViewLink,
        driveFileId: driveFile.data.id,
        filamentColor: filamentColor || '',
        notes: notes || '',
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({ 
        success: true, 
        id: docRef.id,
        fileUrl: driveFile.data.webViewLink,
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
