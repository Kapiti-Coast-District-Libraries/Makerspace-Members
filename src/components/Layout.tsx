import { Outlet, Link, useNavigate, useLocation } from 'react-router';
import { Home, BookOpen, PenTool, MessageSquare, LogOut, FileText, Image as ImageIcon, Shield, User, Clock, Box } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userRole } = useAuth();

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const navItems = [
    { path: '/', label: 'Dashboard', icon: Home },
    { path: '/inductions', label: 'Inductions', icon: BookOpen },
    { path: '/instructions', label: 'Manuals', icon: FileText },
    { path: '/log-usage', label: 'Log Usage', icon: PenTool },
    { path: '/projects', label: 'Project Board', icon: ImageIcon },
    { path: '/design-tools', label: 'Design Tools', icon: Box },
    { path: '/feedback', label: 'Feedback', icon: MessageSquare },
    { path: '/profile', label: 'Profile', icon: User },
  ];

  if (userRole === 'admin') {
    navItems.push({ path: '/space-usage', label: 'Space Usage', icon: Clock });
    navItems.push({ path: '/admin', label: 'Admin Tools', icon: Shield });
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-stone-900 text-stone-100 flex flex-col">
        <div className="p-6 border-b border-stone-800">
          <h1 className="text-xl font-bold tracking-tight">Makerspace</h1>
          <p className="text-stone-400 text-sm mt-1">Library Resource</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${
                  isActive 
                    ? 'bg-stone-800 text-white' 
                    : 'text-stone-400 hover:bg-stone-800 hover:text-stone-200'
                }`}
              >
                <Icon size={20} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-stone-800">
          <button
            onClick={handleLogout}
            className="flex items-center space-x-3 px-4 py-3 w-full text-left rounded-xl text-stone-400 hover:bg-stone-800 hover:text-stone-200 transition-colors"
          >
            <LogOut size={20} />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
