import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp, orderBy, limit, onSnapshot, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router';
import { LogIn, LogOut, CheckCircle, Clock, Bell, Trash2, Plus, Calendar, Star, FileText } from 'lucide-react';

export function Dashboard() {
  const { user, userRole } = useAuth();
  const [roomStatus, setRoomStatus] = useState<{ signedIn: boolean; log: any }>({ signedIn: false, log: null });
  const [qualifications, setQualifications] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [featuredProjects, setFeaturedProjects] = useState<any[]>([]);
  const [readyJobs, setReadyJobs] = useState<any[]>([]);
  const [equipmentMap, setEquipmentMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Announcement form state
  const [isAddingAnnouncement, setIsAddingAnnouncement] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementContent, setAnnouncementContent] = useState('');

  useEffect(() => {
    // Public listeners - always active
    const annQuery = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
    const unsubAnn = onSnapshot(annQuery, (snapshot) => {
      setAnnouncements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const eventsQuery = query(collection(db, 'events'), orderBy('date', 'asc'));
    const unsubEvents = onSnapshot(eventsQuery, (snapshot) => {
      const now = new Date();
      const upcomingEvents = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((event: any) => event.date?.toDate ? event.date.toDate() >= now : false);
      setEvents(upcomingEvents);
    });

    const projectsQuery = query(collection(db, 'projects'), orderBy('likes', 'desc'), limit(10));
    const unsubProjects = onSnapshot(projectsQuery, (snapshot) => {
      setFeaturedProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      if (!user) setLoading(false);
    });

    // Listen to equipment to build a name map
    const equipQuery = query(collection(db, 'equipment'));
    const unsubEquipNames = onSnapshot(equipQuery, (snapshot) => {
      const map: Record<string, string> = {};
      snapshot.docs.forEach(doc => {
        map[doc.id] = doc.data().name;
      });
      setEquipmentMap(map);
    });

    let unsubRoom = () => {};
    let unsubQual = () => {};
    let unsubJobs = () => {};

    if (user) {
      // Listen to room status
      const roomQuery = query(
        collection(db, 'room_logs'),
        where('userId', '==', user.uid),
        orderBy('signInTime', 'desc'),
        limit(1)
      );

      unsubRoom = onSnapshot(roomQuery, (snapshot) => {
        if (!snapshot.empty) {
          const latestLog = snapshot.docs[0].data();
          setRoomStatus({
            signedIn: !latestLog.signOutTime,
            log: { id: snapshot.docs[0].id, ...latestLog }
          });
        } else {
          setRoomStatus({ signedIn: false, log: null });
        }
      });

      // Listen to qualifications
      const qualQuery = query(
        collection(db, 'qualifications'),
        where('userId', '==', user.uid),
        where('status', '==', 'active')
      );

      unsubQual = onSnapshot(qualQuery, (snapshot) => {
        const quals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setQualifications(quals);
      });

      // Listen to ready print jobs
      const jobsQuery = query(
        collection(db, 'print_jobs'),
        where('userId', '==', user.uid),
        where('status', '==', 'ready')
      );
      unsubJobs = onSnapshot(jobsQuery, (snapshot) => {
        setReadyJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      });
    } else {
      setLoading(false);
    }

    return () => {
      unsubRoom();
      unsubQual();
      unsubAnn();
      unsubEvents();
      unsubProjects();
      unsubEquipNames();
      unsubJobs();
    };
  }, [user]);

  const handleSignToggle = async () => {
    if (!user) return;
    try {
      if (roomStatus.signedIn && roomStatus.log) {
        const logRef = doc(db, 'room_logs', roomStatus.log.id);
        await updateDoc(logRef, {
          signOutTime: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'room_logs'), {
          userId: user.uid,
          signInTime: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Failed to toggle sign in status', error);
    }
  };

  const handlePostAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole !== 'admin' || !user) return;
    
    try {
      await addDoc(collection(db, 'announcements'), {
        title: announcementTitle,
        content: announcementContent,
        authorName: user.displayName || 'Admin',
        createdAt: serverTimestamp()
      });
      setAnnouncementTitle('');
      setAnnouncementContent('');
      setIsAddingAnnouncement(false);
    } catch (err) {
      console.error('Error posting announcement:', err);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (userRole !== 'admin') return;
    try {
      await deleteDoc(doc(db, 'announcements', id));
    } catch (err) {
      console.error('Error deleting announcement:', err);
    }
  };

  if (loading) return <div className="animate-pulse">Loading dashboard...</div>;

  return (
    <div className="space-y-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-stone-900">
          {user ? `Welcome, ${user.displayName || 'User'}` : 'Welcome to the Makerspace'}
        </h1>
        <p className="text-stone-500 mt-2 text-lg">
          {user ? 'Manage your makerspace access and activity.' : 'Explore our community projects, tools, and upcoming events.'}
        </p>
      </header>

      {readyJobs.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-3xl mb-8 flex items-start sm:items-center justify-between flex-col sm:flex-row gap-4">
          <div className="flex items-center">
            <div className="p-3 bg-emerald-100 text-emerald-600 rounded-full mr-4">
              <FileText size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-emerald-900">Your work is ready!</h3>
              <p className="text-emerald-700 mt-1">
                You have {readyJobs.length} document{readyJobs.length > 1 ? 's' : ''} ready for pickup or review.
              </p>
            </div>
          </div>
          <Link
            to="/documents"
            className="px-6 py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors whitespace-nowrap"
          >
            View Documents
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Room Status & Qualifications */}
        <div className="lg:col-span-1 space-y-6">
          {user ? (
            <>
              {/* Room Status Card */}
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-200 flex flex-col items-center justify-center text-center">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 ${roomStatus.signedIn ? 'bg-emerald-100 text-emerald-600' : 'bg-stone-100 text-stone-400'}`}>
                  {roomStatus.signedIn ? <CheckCircle size={40} /> : <Clock size={40} />}
                </div>
                <h2 className="text-2xl font-semibold mb-2">
                  {roomStatus.signedIn ? 'You are signed in' : 'You are signed out'}
                </h2>
                <p className="text-stone-500 mb-8">
                  {roomStatus.signedIn && roomStatus.log?.signInTime
                    ? `Since ${roomStatus.log.signInTime.toDate ? roomStatus.log.signInTime.toDate().toLocaleTimeString() : 'just now'}` 
                    : 'Sign in to access the makerspace room.'}
                </p>
                <button
                  onClick={handleSignToggle}
                  className={`flex items-center space-x-2 px-8 py-4 rounded-2xl font-medium transition-all ${
                    roomStatus.signedIn 
                      ? 'bg-stone-100 text-stone-900 hover:bg-stone-200' 
                      : 'bg-stone-900 text-white hover:bg-stone-800'
                  }`}
                >
                  {roomStatus.signedIn ? <LogOut size={20} /> : <LogIn size={20} />}
                  <span>{roomStatus.signedIn ? 'Sign Out of Room' : 'Sign In to Room'}</span>
                </button>
              </div>

              {/* Qualifications Card */}
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-200">
                <h2 className="text-2xl font-semibold mb-6 flex items-center">
                  <CheckCircle className="mr-3 text-stone-400" />
                  Your Qualifications
                </h2>
                
                {qualifications.length === 0 ? (
                  <div className="text-center py-8 text-stone-500 bg-stone-50 rounded-2xl">
                    <p>You haven't completed any inductions yet.</p>
                    <p className="text-sm mt-2">Head to the Inductions tab to get started.</p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {qualifications.map((q, idx) => (
                      <li key={idx} className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl">
                        <span className="font-medium text-stone-900">{equipmentMap[q.equipmentId] || q.equipmentId}</span>
                        <span className="text-sm text-stone-500">
                          {q.acquiredAt?.toDate ? q.acquiredAt.toDate().toLocaleDateString() : 'Recently'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <div className="bg-stone-900 text-white p-8 rounded-3xl shadow-xl">
              <h2 className="text-2xl font-bold mb-4">Join our community</h2>
              <p className="text-stone-400 mb-8">Sign in to book equipment, log your usage, and track your makerspace qualifications.</p>
              <Link 
                to="/login"
                className="block w-full py-4 bg-white text-stone-900 rounded-2xl font-bold text-center hover:bg-stone-100 transition-colors"
              >
                Sign In / Sign Up
              </Link>
            </div>
          )}
        </div>

        {/* Middle Column: Announcements & Events */}
        <div className="lg:col-span-1 space-y-6">
          {/* What's On Card */}
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-200">
            <h2 className="text-2xl font-semibold mb-6 flex items-center">
              <Calendar className="mr-3 text-stone-400" />
              What's On
            </h2>
            {events.length === 0 ? (
              <div className="text-center py-8 text-stone-500 bg-stone-50 rounded-2xl">
                <p>No upcoming events.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {events.slice(0, 3).map((event) => (
                  <div key={event.id} className="p-4 bg-stone-50 rounded-2xl border-l-4 border-stone-900">
                    <h3 className="font-semibold text-stone-900">{event.title}</h3>
                    <p className="text-sm text-stone-600 mt-1">{event.description}</p>
                    <p className="text-xs text-stone-500 mt-2 font-medium">
                      {event.date?.toDate ? event.date.toDate().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Upcoming'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Announcements Card */}
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold flex items-center">
                <Bell className="mr-3 text-stone-400" />
                Updates from Staff
              </h2>
              {userRole === 'admin' && !isAddingAnnouncement && (
                <button
                  onClick={() => setIsAddingAnnouncement(true)}
                  className="flex items-center text-sm bg-stone-100 text-stone-700 px-3 py-2 rounded-xl hover:bg-stone-200 transition-colors"
                >
                  <Plus size={16} className="mr-1" />
                  New
                </button>
              )}
            </div>

            {isAddingAnnouncement && (
              <form onSubmit={handlePostAnnouncement} className="mb-6 p-4 bg-stone-50 rounded-2xl border border-stone-200">
                <div className="space-y-3">
                  <div>
                    <input
                      type="text"
                      required
                      value={announcementTitle}
                      onChange={(e) => setAnnouncementTitle(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none"
                      placeholder="Title"
                    />
                  </div>
                  <div>
                    <textarea
                      required
                      rows={3}
                      value={announcementContent}
                      onChange={(e) => setAnnouncementContent(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none resize-y"
                      placeholder="Message"
                    />
                  </div>
                  <div className="flex justify-end space-x-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingAnnouncement(false)}
                      className="px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-200 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1.5 text-xs bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
                    >
                      Post
                    </button>
                  </div>
                </div>
              </form>
            )}

            {announcements.length === 0 ? (
              <div className="text-center py-8 text-stone-500 bg-stone-50 rounded-2xl">
                <p>No recent updates.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {announcements.map((ann) => (
                  <div key={ann.id} className="p-4 bg-stone-50 rounded-2xl relative group">
                    {userRole === 'admin' && (
                      <button
                        onClick={() => handleDeleteAnnouncement(ann.id)}
                        className="absolute top-2 right-2 p-1.5 text-stone-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete announcement"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                    <h3 className="font-semibold text-stone-900 text-sm pr-6">{ann.title}</h3>
                    <p className="text-stone-600 text-sm whitespace-pre-wrap mt-1 mb-2">{ann.content}</p>
                    <div className="flex items-center text-xs text-stone-500 font-medium">
                      <span className="bg-stone-200 px-2 py-0.5 rounded-md mr-2">{ann.authorName}</span>
                      <span>{ann.createdAt?.toDate ? ann.createdAt.toDate().toLocaleDateString() : 'Just now'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Featured Projects */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-200 h-full">
            <h2 className="text-2xl font-semibold mb-6 flex items-center">
              <Star className="mr-3 text-amber-400" />
              Featured Projects
            </h2>
            {featuredProjects.length === 0 ? (
              <div className="text-center py-8 text-stone-500 bg-stone-50 rounded-2xl">
                <p>No projects featured yet.</p>
              </div>
            ) : (
            <div className="space-y-6 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
                {featuredProjects.map((project) => (
                  <div key={project.id} className="group cursor-pointer">
                    <div className="aspect-video w-full rounded-2xl overflow-hidden mb-3">
                      <img 
                        src={project.imageUrl} 
                        alt={project.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <h3 className="font-semibold text-stone-900 group-hover:text-stone-600 transition-colors">{project.title}</h3>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm text-stone-500">by {project.authorName}</span>
                      <span className="text-xs font-medium bg-stone-100 text-stone-600 px-2 py-1 rounded-full flex items-center">
                        <Star size={12} className="mr-1 text-amber-500 fill-amber-500" />
                        {project.likes}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
