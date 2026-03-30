/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { Inductions } from './pages/Inductions';
import { LogUsage } from './pages/LogUsage';
import { SpaceUsage } from './pages/SpaceUsage';
import { Feedback } from './pages/Feedback';
import { Instructions } from './pages/Instructions';
import { ProjectBoard } from './pages/ProjectBoard';
import { AdminDashboard } from './pages/AdminDashboard';
import { Profile } from './pages/Profile';
import { MyDocuments } from './pages/MyDocuments';
import { DesignTools } from './pages/DesignTools';
import { ToolShell } from './pages/ToolShell';

function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode, requireAdmin?: boolean }) {
  const { user, userRole, loading } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  if (requireAdmin && userRole !== 'admin') return <Navigate to="/" />;

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inductions" element={<Inductions />} />
            <Route path="/log-usage" element={<LogUsage />} />
            <Route path="/space-usage" element={<ProtectedRoute requireAdmin><SpaceUsage /></ProtectedRoute>} />
            <Route path="/feedback" element={<Feedback />} />
            <Route path="/instructions" element={<Instructions />} />
            <Route path="/projects" element={<ProjectBoard />} />
            <Route path="/design-tools" element={<DesignTools />} />
            <Route path="/design-tools/view/:toolId" element={<ToolShell />} />
            <Route path="/documents" element={<MyDocuments />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminDashboard /></ProtectedRoute>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

