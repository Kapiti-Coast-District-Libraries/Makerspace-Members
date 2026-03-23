import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Clock, Search, Filter, Download } from 'lucide-react';

export function SpaceUsage() {
  const { userRole } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [usersMap, setUsersMap] = useState<Record<string, any>>({});

  useEffect(() => {
    if (userRole !== 'admin') return;

    // Fetch users to map IDs to names
    const fetchUsers = async () => {
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const map: Record<string, any> = {};
      usersSnapshot.forEach(doc => {
        map[doc.id] = doc.data();
      });
      setUsersMap(map);
    };

    fetchUsers();

    // Listen to room logs
    const logsQuery = query(collection(db, 'room_logs'), orderBy('signInTime', 'desc'));
    const unsubLogs = onSnapshot(logsQuery, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    return () => unsubLogs();
  }, [userRole]);

  if (userRole !== 'admin') {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-stone-900">Access Denied</h2>
        <p className="text-stone-500 mt-2">You do not have permission to view this page.</p>
      </div>
    );
  }

  const calculateDuration = (signInTime: any, signOutTime: any) => {
    if (!signInTime || !signOutTime || !signInTime.toDate || !signOutTime.toDate) return 'Active';
    const start = signInTime.toDate();
    const end = signOutTime.toDate();
    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.round(diffMs / 60000);
    
    if (diffMins < 60) return `${diffMins} mins`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}h ${mins}m`;
  };

  const filteredLogs = logs.filter(log => {
    const user = usersMap[log.userId];
    const searchLower = searchTerm.toLowerCase();
    return (
      user?.name?.toLowerCase().includes(searchLower) ||
      user?.email?.toLowerCase().includes(searchLower) ||
      log.userId.toLowerCase().includes(searchLower)
    );
  });

  const handleExportCSV = () => {
    const headers = ['User Name', 'Email', 'Sign In Time', 'Sign Out Time', 'Duration'];
    const csvData = filteredLogs.map(log => {
      const user = usersMap[log.userId];
      const signIn = log.signInTime?.toDate ? log.signInTime.toDate().toLocaleString() : '';
      const signOut = log.signOutTime?.toDate ? log.signOutTime.toDate().toLocaleString() : 'Active';
      const duration = calculateDuration(log.signInTime, log.signOutTime);
      return `"${user?.name || 'Unknown'}","${user?.email || ''}","${signIn}","${signOut}","${duration}"`;
    });

    const csvContent = [headers.join(','), ...csvData].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `makerspace_usage_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <div>Loading space usage logs...</div>;

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-stone-900">Space Usage</h1>
          <p className="text-stone-500 mt-2 text-lg">Track member sign-ins and space utilization.</p>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={handleExportCSV}
            className="flex items-center bg-stone-100 text-stone-700 px-4 py-2 rounded-xl hover:bg-stone-200 transition-colors"
          >
            <Download size={20} className="mr-2" />
            Export CSV
          </button>
        </div>
      </header>

      <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-200">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-stone-400" size={20} />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none"
            />
          </div>
          <div className="flex items-center text-sm text-stone-500">
            <Filter size={16} className="mr-2" />
            Showing {filteredLogs.length} records
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-200 text-sm text-stone-500">
                <th className="pb-3 font-medium">User</th>
                <th className="pb-3 font-medium">Sign In</th>
                <th className="pb-3 font-medium">Sign Out</th>
                <th className="pb-3 font-medium">Duration</th>
                <th className="pb-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {filteredLogs.map(log => {
                const user = usersMap[log.userId];
                const isActive = !log.signOutTime;
                
                return (
                  <tr key={log.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50 transition-colors">
                    <td className="py-4">
                      <div className="font-medium text-stone-900">{user?.name || 'Unknown User'}</div>
                      <div className="text-xs text-stone-500">{user?.email || log.userId}</div>
                    </td>
                    <td className="py-4 text-stone-600">
                      {log.signInTime?.toDate ? (
                        <>
                          <div>{log.signInTime.toDate().toLocaleDateString()}</div>
                          <div className="text-xs text-stone-500">{log.signInTime.toDate().toLocaleTimeString()}</div>
                        </>
                      ) : 'Unknown'}
                    </td>
                    <td className="py-4 text-stone-600">
                      {log.signOutTime?.toDate ? (
                        <>
                          <div>{log.signOutTime.toDate().toLocaleDateString()}</div>
                          <div className="text-xs text-stone-500">{log.signOutTime.toDate().toLocaleTimeString()}</div>
                        </>
                      ) : '-'}
                    </td>
                    <td className="py-4 text-stone-600 font-medium">
                      {calculateDuration(log.signInTime, log.signOutTime)}
                    </td>
                    <td className="py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600'}`}>
                        {isActive ? 'Active Now' : 'Completed'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-stone-500">
                    No usage logs found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
