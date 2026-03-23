import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, getDocs, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Users, ShieldCheck, FileText, AlertTriangle, CheckCircle, XCircle, Database, Settings, Plus, Trash2, Calendar } from 'lucide-react';

export function AdminDashboard() {
  const { user, userRole } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [qualifications, setQualifications] = useState<any[]>([]);
  const [inductionBookings, setInductionBookings] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState('');

  // Equipment form state
  const [isAddingEquipment, setIsAddingEquipment] = useState(false);
  const [newEquipmentName, setNewEquipmentName] = useState('');
  const [newEquipmentDesc, setNewEquipmentDesc] = useState('');
  const [newQuiz, setNewQuiz] = useState<{question: string, options: string[], answer: number}[]>([]);

  // Event form state
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDesc, setNewEventDesc] = useState('');
  const [newEventDate, setNewEventDate] = useState('');

  // Feedback state
  const [showArchivedFeedback, setShowArchivedFeedback] = useState(false);

  useEffect(() => {
    if (userRole !== 'admin') return;

    // Fetch users
    const usersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubUsers = onSnapshot(usersQuery, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => console.error("Error fetching users:", error));

    // Fetch pending qualifications (legacy)
    const qualsQuery = query(collection(db, 'qualifications'), where('status', '==', 'pending'));
    const unsubQuals = onSnapshot(qualsQuery, (snapshot) => {
      setQualifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => console.error("Error fetching qualifications:", error));

    // Fetch pending induction bookings
    const bookingsQuery = query(collection(db, 'induction_bookings'), where('status', '==', 'pending'));
    const unsubBookings = onSnapshot(bookingsQuery, (snapshot) => {
      setInductionBookings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => console.error("Error fetching induction bookings:", error));

    // Fetch feedback
    const feedbackQuery = query(collection(db, 'feedback'), orderBy('createdAt', 'desc'));
    const unsubFeedback = onSnapshot(feedbackQuery, (snapshot) => {
      setFeedback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => console.error("Error fetching feedback:", error));

    // Fetch equipment
    const equipQuery = query(collection(db, 'equipment'), orderBy('createdAt', 'asc'));
    const unsubEquip = onSnapshot(equipQuery, (snapshot) => {
      setEquipment(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => console.error("Error fetching equipment:", error));

    // Fetch events
    const eventsQuery = query(collection(db, 'events'), orderBy('date', 'asc'));
    const unsubEvents = onSnapshot(eventsQuery, (snapshot) => {
      setEvents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      console.error("Error fetching events:", error);
      setLoading(false);
    });

    return () => {
      unsubUsers();
      unsubQuals();
      unsubBookings();
      unsubFeedback();
      unsubEquip();
      unsubEvents();
    };
  }, [userRole]);

  const handleApproveQualification = async (qualId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'qualifications', qualId), {
        status: 'active',
        acquiredAt: serverTimestamp(),
        signedOffBy: user.uid
      });
    } catch (err) {
      console.error('Error approving qualification:', err);
    }
  };

  const handleRejectQualification = async (qualId: string) => {
    try {
      await deleteDoc(doc(db, 'qualifications', qualId));
    } catch (err) {
      console.error('Error rejecting qualification:', err);
    }
  };

  const handleApproveBooking = async (booking: any) => {
    if (!user) return;
    try {
      // Update booking status
      await updateDoc(doc(db, 'induction_bookings', booking.id), {
        status: 'completed'
      });
      // Create active qualification
      await addDoc(collection(db, 'qualifications'), {
        userId: booking.userId,
        equipmentId: booking.equipmentId,
        status: 'active',
        acquiredAt: serverTimestamp(),
        signedOffBy: user.uid
      });
    } catch (err) {
      console.error('Error approving booking:', err);
    }
  };

  const handleRejectBooking = async (bookingId: string) => {
    try {
      await updateDoc(doc(db, 'induction_bookings', bookingId), {
        status: 'cancelled'
      });
    } catch (err) {
      console.error('Error rejecting booking:', err);
    }
  };

  const handleUpdateFeedbackStatus = async (feedbackId: string, status: string) => {
    try {
      await updateDoc(doc(db, 'feedback', feedbackId), {
        status
      });
    } catch (err) {
      console.error('Error updating feedback status:', err);
    }
  };

  const handleUpdateLibraryCard = async (userId: string, libraryCardNumber: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        libraryCardNumber
      });
    } catch (err) {
      console.error('Error updating library card number:', err);
    }
  };

  const handleUpdateUserRole = async (userId: string, newRole: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        role: newRole
      });
    } catch (err) {
      console.error('Error updating user role:', err);
    }
  };

  const handleAddEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      await addDoc(collection(db, 'equipment'), {
        name: newEquipmentName,
        description: newEquipmentDesc,
        quiz: newQuiz,
        createdAt: serverTimestamp()
      });
      setNewEquipmentName('');
      setNewEquipmentDesc('');
      setNewQuiz([]);
      setIsAddingEquipment(false);
    } catch (err) {
      console.error('Error adding equipment:', err);
    }
  };

  const handleDeleteEquipment = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'equipment', id));
    } catch (err) {
      console.error('Error deleting equipment:', err);
    }
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      await addDoc(collection(db, 'events'), {
        title: newEventTitle,
        description: newEventDesc,
        date: new Date(newEventDate),
        createdAt: serverTimestamp()
      });
      setNewEventTitle('');
      setNewEventDesc('');
      setNewEventDate('');
      setIsAddingEvent(false);
    } catch (err) {
      console.error('Error adding event:', err);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'events', id));
    } catch (err) {
      console.error('Error deleting event:', err);
    }
  };

  const addQuizQuestion = () => {
    setNewQuiz([...newQuiz, { question: '', options: ['', '', '', ''], answer: 0 }]);
  };

  const updateQuizQuestion = (index: number, field: string, value: any, optionIndex?: number) => {
    const updatedQuiz = [...newQuiz];
    if (field === 'question') {
      updatedQuiz[index].question = value;
    } else if (field === 'answer') {
      updatedQuiz[index].answer = parseInt(value);
    } else if (field === 'option' && optionIndex !== undefined) {
      updatedQuiz[index].options[optionIndex] = value;
    }
    setNewQuiz(updatedQuiz);
  };

  const removeQuizQuestion = (index: number) => {
    const updatedQuiz = newQuiz.filter((_, i) => i !== index);
    setNewQuiz(updatedQuiz);
  };

  const handleSeedData = async () => {
    if (!user) return;
    setSeeding(true);
    setSeedMessage('');
    try {
      // Add example instructions
      const instructions = [
        {
          title: "Laser Cutter Basic Operation",
          equipmentId: "laser-cutter",
          content: "# Laser Cutter Basic Operation\n\n## 1. Safety First\n* Always wear safety glasses.\n* Never leave the machine unattended while cutting.\n* Ensure the ventilation system is ON before starting.\n\n## 2. Material Setup\n* Place your material flat on the honeycomb bed.\n* Use the focus tool to set the correct height for the laser head.\n\n## 3. Software Setup\n* Import your vector file (SVG or DXF) into LightBurn.\n* Set your speed and power settings according to the material chart.\n* **Red lines** = Cut (high power, low speed)\n* **Black lines** = Engrave (low power, high speed)\n\n## 4. Running the Job\n* Close the lid.\n* Press 'Start' on the machine panel.\n* Keep an eye out for flare-ups."
        },
        {
          title: "3D Printer Filament Loading",
          equipmentId: "3d-printer",
          content: "# Loading Filament\n\n## 1. Preheat the Nozzle\n* Navigate to `Prepare > Preheat PLA` on the LCD screen.\n* Wait for the nozzle to reach 200°C.\n\n## 2. Remove Old Filament\n* Squeeze the extruder lever.\n* Gently pull the old filament out of the PTFE tube.\n\n## 3. Insert New Filament\n* Cut the end of the new filament at a 45-degree angle.\n* Squeeze the extruder lever and push the new filament in until you feel resistance.\n* Continue pushing until you see the new color extruding from the nozzle.\n\n## 4. Clean Up\n* Use tweezers to remove the extruded plastic from the nozzle."
        }
      ];

      for (const inst of instructions) {
        await addDoc(collection(db, 'instructions'), {
          ...inst,
          createdAt: serverTimestamp()
        });
      }

      // Add example projects
      const projects = [
        {
          userId: user.uid,
          authorName: "Alex Maker",
          title: "Wooden Desk Organizer",
          description: "Designed this in Illustrator and cut it out of 3mm birch plywood on the laser cutter. The joints are press-fit so no glue was needed!",
          imageUrl: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=800",
          likes: 12
        },
        {
          userId: user.uid,
          authorName: "Sam Builder",
          title: "3D Printed Planter",
          description: "Printed this geometric planter using marble PLA. It took about 14 hours on the Prusa i3 MK3S. I added a drainage hole at the bottom.",
          imageUrl: "https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&q=80&w=800",
          likes: 8
        },
        {
          userId: user.uid,
          authorName: "Jordan Crafts",
          title: "Custom Tote Bag",
          description: "Used the vinyl cutter to create a heat transfer vinyl (HTV) design, then applied it to a canvas tote bag using the heat press.",
          imageUrl: "https://images.unsplash.com/photo-1597348989645-46b190ce4918?auto=format&fit=crop&q=80&w=800",
          likes: 24
        }
      ];

      for (const proj of projects) {
        await addDoc(collection(db, 'projects'), {
          ...proj,
          createdAt: serverTimestamp()
        });
      }

      // Add example equipment
      const equipmentList = [
        {
          name: 'Laser Cutter',
          description: 'Learn to safely operate the laser cutter, including material selection and emergency stops.',
          quiz: [
            {
              question: "What is the first thing you should do in an emergency?",
              options: ["Run away", "Hit the emergency stop button", "Call a friend", "Ignore it"],
              answer: 1
            },
            {
              question: "When should you wear safety glasses in the makerspace?",
              options: ["Only when using the laser cutter", "Whenever operating machinery or handling tools", "Only on Tuesdays", "Never"],
              answer: 1
            }
          ]
        },
        {
          name: '3D Printer',
          description: 'Understand bed leveling, filament loading, and safe removal of prints.',
          quiz: []
        }
      ];

      for (const eq of equipmentList) {
        await addDoc(collection(db, 'equipment'), {
          ...eq,
          createdAt: serverTimestamp()
        });
      }

      // Add example events
      const upcomingEvents = [
        {
          title: "Intro to 3D Printing Workshop",
          description: "Learn the basics of 3D printing, from finding models to slicing and printing.",
          date: new Date(Date.now() + 86400000 * 2) // 2 days from now
        },
        {
          title: "Laser Cutting Safety Induction",
          description: "Mandatory safety induction for using the laser cutter.",
          date: new Date(Date.now() + 86400000 * 5) // 5 days from now
        }
      ];
      for (const ev of upcomingEvents) {
        await addDoc(collection(db, 'events'), {
          ...ev,
          createdAt: serverTimestamp()
        });
      }

      setSeedMessage('Example data loaded successfully!');
    } catch (err) {
      console.error('Error seeding data:', err);
      setSeedMessage('Failed to load example data.');
    } finally {
      setSeeding(false);
      setTimeout(() => setSeedMessage(''), 3000);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-stone-900">Admin Dashboard</h1>
          <p className="text-stone-500 mt-2 text-lg">Manage users, approve inductions, and review feedback.</p>
        </div>
        <div className="flex items-center space-x-4">
          {seedMessage && (
            <span className="text-sm font-medium text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
              {seedMessage}
            </span>
          )}
          <button
            onClick={handleSeedData}
            disabled={seeding}
            className="flex items-center bg-stone-100 text-stone-700 px-4 py-2 rounded-xl hover:bg-stone-200 transition-colors disabled:opacity-50"
          >
            <Database size={20} className="mr-2" />
            {seeding ? 'Loading...' : 'Load Example Data'}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Pending Inductions */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-200">
          <h2 className="text-2xl font-semibold mb-6 flex items-center">
            <ShieldCheck className="mr-3 text-stone-400" />
            Pending Inductions
          </h2>
          {qualifications.length === 0 && inductionBookings.length === 0 ? (
            <p className="text-stone-500 text-center py-4">No pending inductions.</p>
          ) : (
            <div className="space-y-4">
              {/* Legacy Qualifications */}
              {qualifications.map(qual => (
                <div key={qual.id} className="p-4 bg-stone-50 rounded-2xl flex justify-between items-center">
                  <div>
                    <p className="font-medium text-stone-900">User ID: {qual.userId}</p>
                    <p className="text-sm text-stone-500">Equipment: {qual.equipmentId}</p>
                    <p className="text-xs text-stone-400">Requested: {qual.createdAt?.toDate ? qual.createdAt.toDate().toLocaleDateString() : 'Unknown'}</p>
                  </div>
                  <div className="flex space-x-2">
                    <button 
                      onClick={() => handleApproveQualification(qual.id)}
                      className="p-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-xl transition-colors"
                      title="Approve"
                    >
                      <CheckCircle size={20} />
                    </button>
                    <button 
                      onClick={() => handleRejectQualification(qual.id)}
                      className="p-2 bg-rose-100 text-rose-700 hover:bg-rose-200 rounded-xl transition-colors"
                      title="Reject"
                    >
                      <XCircle size={20} />
                    </button>
                  </div>
                </div>
              ))}
              {/* Induction Bookings */}
              {inductionBookings.map(booking => {
                const eq = equipment.find(e => e.id === booking.equipmentId);
                const u = users.find(u => u.id === booking.userId);
                return (
                  <div key={booking.id} className="p-4 bg-stone-50 rounded-2xl flex justify-between items-center">
                    <div>
                      <p className="font-medium text-stone-900">{u?.name || booking.userId}</p>
                      <p className="text-sm text-stone-500">Equipment: {eq?.name || booking.equipmentId}</p>
                      <p className="text-sm font-medium text-amber-600 mt-1">
                        Booking: {booking.date?.toDate ? booking.date.toDate().toLocaleString() : 'Unknown'}
                      </p>
                      <p className="text-xs text-stone-400 mt-1">Requested: {booking.createdAt?.toDate ? booking.createdAt.toDate().toLocaleDateString() : 'Unknown'}</p>
                    </div>
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => handleApproveBooking(booking)}
                        className="p-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-xl transition-colors"
                        title="Mark Completed & Approve"
                      >
                        <CheckCircle size={20} />
                      </button>
                      <button 
                        onClick={() => handleRejectBooking(booking.id)}
                        className="p-2 bg-rose-100 text-rose-700 hover:bg-rose-200 rounded-xl transition-colors"
                        title="Cancel Booking"
                      >
                        <XCircle size={20} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Manage Events */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-200">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold flex items-center">
              <Calendar className="mr-3 text-stone-400" />
              Manage Events
            </h2>
            {!isAddingEvent && (
              <button
                onClick={() => setIsAddingEvent(true)}
                className="flex items-center text-sm bg-stone-100 text-stone-700 px-3 py-2 rounded-xl hover:bg-stone-200 transition-colors"
              >
                <Plus size={16} className="mr-1" />
                Add Event
              </button>
            )}
          </div>

          {isAddingEvent && (
            <form onSubmit={handleAddEvent} className="mb-8 p-6 bg-stone-50 rounded-2xl border border-stone-200">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Event Title</label>
                  <input
                    type="text"
                    required
                    value={newEventTitle}
                    onChange={(e) => setNewEventTitle(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Description</label>
                  <textarea
                    required
                    value={newEventDesc}
                    onChange={(e) => setNewEventDesc(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Date & Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={newEventDate}
                    onChange={(e) => setNewEventDate(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none"
                  />
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsAddingEvent(false)}
                    className="px-4 py-2 text-stone-600 hover:bg-stone-200 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors"
                  >
                    Save Event
                  </button>
                </div>
              </div>
            </form>
          )}

          {events.length === 0 ? (
            <p className="text-stone-500 text-center py-4">No events scheduled.</p>
          ) : (
            <div className="space-y-4">
              {events.map(ev => (
                <div key={ev.id} className="p-4 bg-stone-50 rounded-2xl relative group">
                  <button
                    onClick={() => handleDeleteEvent(ev.id)}
                    className="absolute top-4 right-4 p-2 text-stone-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete event"
                  >
                    <Trash2 size={18} />
                  </button>
                  <h3 className="font-semibold text-stone-900 mb-1 pr-8">{ev.title}</h3>
                  <p className="text-sm text-stone-600 mb-2">{ev.description}</p>
                  <div className="flex items-center text-xs font-medium text-stone-500">
                    <span className="bg-stone-200 px-2 py-1 rounded-md">
                      {ev.date?.toDate ? ev.date.toDate().toLocaleString() : 'No date'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Manage Equipment & Tests */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-200">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold flex items-center">
              <Settings className="mr-3 text-stone-400" />
              Manage Equipment & Tests
            </h2>
            {!isAddingEquipment && (
              <button
                onClick={() => setIsAddingEquipment(true)}
                className="flex items-center text-sm bg-stone-100 text-stone-700 px-3 py-2 rounded-xl hover:bg-stone-200 transition-colors"
              >
                <Plus size={16} className="mr-1" />
                Add Equipment
              </button>
            )}
          </div>

          {isAddingEquipment && (
            <form onSubmit={handleAddEquipment} className="mb-8 p-6 bg-stone-50 rounded-2xl border border-stone-200">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Equipment Name</label>
                  <input
                    type="text"
                    required
                    value={newEquipmentName}
                    onChange={(e) => setNewEquipmentName(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Description</label>
                  <textarea
                    required
                    value={newEquipmentDesc}
                    onChange={(e) => setNewEquipmentDesc(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none"
                  />
                </div>
                
                <div className="pt-4 border-t border-stone-200">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-medium text-stone-900">Safety Quiz (Optional)</h3>
                    <button
                      type="button"
                      onClick={addQuizQuestion}
                      className="text-sm text-stone-600 hover:text-stone-900 flex items-center"
                    >
                      <Plus size={16} className="mr-1" /> Add Question
                    </button>
                  </div>
                  
                  {newQuiz.map((q, qIndex) => (
                    <div key={qIndex} className="mb-6 p-4 bg-white rounded-xl border border-stone-200 relative">
                      <button
                        type="button"
                        onClick={() => removeQuizQuestion(qIndex)}
                        className="absolute top-4 right-4 text-stone-400 hover:text-red-600"
                      >
                        <Trash2 size={16} />
                      </button>
                      <div className="mb-3 pr-8">
                        <label className="block text-xs font-medium text-stone-500 mb-1">Question {qIndex + 1}</label>
                        <input
                          type="text"
                          required
                          value={q.question}
                          onChange={(e) => updateQuizQuestion(qIndex, 'question', e.target.value)}
                          className="w-full px-3 py-1.5 text-sm rounded-lg border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        {q.options.map((opt, oIndex) => (
                          <div key={oIndex} className="flex items-center space-x-2">
                            <input
                              type="radio"
                              name={`correct-answer-${qIndex}`}
                              checked={q.answer === oIndex}
                              onChange={() => updateQuizQuestion(qIndex, 'answer', oIndex)}
                              className="text-stone-900 focus:ring-stone-900"
                            />
                            <input
                              type="text"
                              required
                              value={opt}
                              onChange={(e) => updateQuizQuestion(qIndex, 'option', e.target.value, oIndex)}
                              placeholder={`Option ${oIndex + 1}`}
                              className="flex-1 px-3 py-1 text-sm rounded-lg border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsAddingEquipment(false)}
                    className="px-4 py-2 text-stone-600 hover:bg-stone-200 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors"
                  >
                    Save Equipment
                  </button>
                </div>
              </div>
            </form>
          )}

          {equipment.length === 0 ? (
            <p className="text-stone-500 text-center py-4">No equipment added yet.</p>
          ) : (
            <div className="space-y-4">
              {equipment.map(eq => (
                <div key={eq.id} className="p-4 bg-stone-50 rounded-2xl relative group">
                  <button
                    onClick={() => handleDeleteEquipment(eq.id)}
                    className="absolute top-4 right-4 p-2 text-stone-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete equipment"
                  >
                    <Trash2 size={18} />
                  </button>
                  <h3 className="font-semibold text-stone-900 mb-1 pr-8">{eq.name}</h3>
                  <p className="text-sm text-stone-600 mb-2">{eq.description}</p>
                  <div className="flex items-center text-xs font-medium text-stone-500">
                    <span className="bg-stone-200 px-2 py-1 rounded-md">
                      {eq.quiz?.length || 0} Quiz Questions
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Feedback */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-200">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold flex items-center">
              <AlertTriangle className="mr-3 text-stone-400" />
              {showArchivedFeedback ? 'Archived Feedback' : 'Recent Feedback'}
            </h2>
            <button
              onClick={() => setShowArchivedFeedback(!showArchivedFeedback)}
              className="text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors"
            >
              {showArchivedFeedback ? 'Show Active' : 'Show Archived'}
            </button>
          </div>
          {feedback.filter(item => showArchivedFeedback ? item.status === 'archived' : item.status !== 'archived').length === 0 ? (
            <p className="text-stone-500 text-center py-4">No {showArchivedFeedback ? 'archived' : 'active'} feedback.</p>
          ) : (
            <div className="space-y-4">
              {feedback
                .filter(item => showArchivedFeedback ? item.status === 'archived' : item.status !== 'archived')
                .slice(0, 10)
                .map(item => (
                <div key={item.id} className="p-4 bg-stone-50 rounded-2xl">
                  <div className="flex justify-between items-start mb-2">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${item.type === 'consumable' ? 'bg-amber-100 text-amber-800' : item.type === 'issue' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                      {item.type}
                    </span>
                    <select
                      value={item.status || 'new'}
                      onChange={(e) => handleUpdateFeedbackStatus(item.id, e.target.value)}
                      className="text-sm bg-white border border-stone-200 rounded-lg px-2 py-1 outline-none"
                    >
                      <option value="new">New</option>
                      <option value="in-progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                  <p className="text-stone-700 text-sm mb-2">{item.message}</p>
                  <p className="text-xs text-stone-400">User ID: {item.userId} • {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : 'Unknown'}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Users List */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-200 lg:col-span-2">
          <h2 className="text-2xl font-semibold mb-6 flex items-center">
            <Users className="mr-3 text-stone-400" />
            User Management
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-200 text-sm text-stone-500">
                  <th className="pb-3 font-medium">Name</th>
                  <th className="pb-3 font-medium">Email</th>
                  <th className="pb-3 font-medium">Role</th>
                  <th className="pb-3 font-medium">Library Card</th>
                  <th className="pb-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {users.map(u => (
                  <tr key={u.id} className="border-b border-stone-100 last:border-0">
                    <td className="py-4 font-medium text-stone-900">{u.name || 'N/A'}</td>
                    <td className="py-4 text-stone-600">{u.email}</td>
                    <td className="py-4">
                      <select
                        value={u.role || 'member'}
                        onChange={(e) => handleUpdateUserRole(u.id, e.target.value)}
                        disabled={u.email === 'paraparaumumake@gmail.com'} // Prevent changing the main admin's role
                        className={`text-sm border border-stone-200 rounded-lg px-2 py-1 outline-none ${
                          u.role === 'admin' ? 'bg-purple-50 text-purple-800' : 'bg-stone-50 text-stone-800'
                        } ${u.email === 'paraparaumumake@gmail.com' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="py-4">
                      <input
                        type="text"
                        defaultValue={u.libraryCardNumber || ''}
                        onBlur={(e) => {
                          if (e.target.value !== u.libraryCardNumber) {
                            handleUpdateLibraryCard(u.id, e.target.value);
                          }
                        }}
                        placeholder="Add card #"
                        className="text-sm bg-stone-50 border border-stone-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-stone-900 w-32"
                      />
                    </td>
                    <td className="py-4 text-stone-500">{u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString() : 'Unknown'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
