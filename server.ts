import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import { google } from 'googleapis';
import cookieSession from 'cookie-session';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';

dotenv.config();

// Initialize SQLite for server-side config (tokens)
const dbPath = path.join(process.cwd(), 'server_config.db');
const sqlite = new Database(dbPath);

// Create tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

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
  // Helper to get config from SQLite
  const getConfig = (key: string) => {
    const row = sqlite.prepare('SELECT value FROM app_config WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : null;
  };

  // Helper to set config in SQLite
  const setConfig = (key: string, value: any) => {
    sqlite.prepare('INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
      .run(key, JSON.stringify(value));
  };

  // Helper to delete config from SQLite
  const deleteConfig = (key: string) => {
    sqlite.prepare('DELETE FROM app_config WHERE key = ?').run(key);
  };

  expressApp.get('/api/auth/google/url', (req, res) => {
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/userinfo.email'
      ],
      prompt: 'consent',
    });
    res.json({ url });
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

      // Store tokens in SQLite
      console.log('Server: Storing tokens in SQLite...');
      setConfig('google_drive_admin', { tokens, email: userInfo.data.email });

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
      const config = getConfig('google_drive_admin');
      res.json({ connected: !!config && !!config.tokens });
    } catch (error) {
      res.json({ connected: false });
    }
  });

  expressApp.post('/api/auth/google/logout', async (req, res) => {
    try {
      deleteConfig('google_drive_admin');
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
      
      // Fetch Admin tokens from SQLite
      const config = getConfig('google_drive_admin');
      const tokens = config?.tokens;

      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
      }

      if (!tokens) {
        return res.status(401).json({ error: 'Makerspace Google Drive not connected. Please contact an administrator.' });
      }

      console.log(`Server: Uploading file ${file.originalname} to Admin Google Drive for user ${userId}`);

      oauth2Client.setCredentials(tokens);
      
      // Handle token refresh if needed
      oauth2Client.on('tokens', (newTokens) => {
        if (newTokens.refresh_token) {
          // Store new tokens in SQLite
          setConfig('google_drive_admin', { 
            ...config, 
            tokens: { ...tokens, ...newTokens } 
          });
        }
      });

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
