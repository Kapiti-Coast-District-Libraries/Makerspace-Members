import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, getDocs, where, addDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Users, ShieldCheck, FileText, AlertTriangle, CheckCircle, XCircle, Database, Settings, Plus, Trash2, Calendar, Box, UploadCloud, PlayCircle, Download, AlertCircle, Loader2, Camera } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Custom Confirmation Modal
interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
}

function ConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = 'Delete', 
  cancelText = 'Cancel',
  isDestructive = true,
  isLoading = false
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-stone-200"
        >
          <div className="flex items-center space-x-3 mb-4 text-rose-600">
            <AlertCircle size={28} />
            <h3 className="text-2xl font-bold text-stone-900">{title}</h3>
          </div>
          <p className="text-stone-600 mb-8 leading-relaxed">
            {message}
          </p>
          <div className="flex space-x-3 justify-end">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="px-6 py-2.5 rounded-xl font-medium text-stone-600 hover:bg-stone-100 transition-colors disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className={`px-6 py-2.5 rounded-xl font-medium text-white transition-all flex items-center ${
                isDestructive ? 'bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-200' : 'bg-stone-900 hover:bg-stone-800 shadow-lg shadow-stone-200'
              } disabled:opacity-50`}
            >
              {isLoading && <Loader2 size={18} className="mr-2 animate-spin" />}
              {confirmText}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function ImageUpload({ onUpload }: { onUpload: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const resizeImage = (file: File, maxWidth: number, maxHeight: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(dataUrl);
        };
        img.onerror = reject;
        img.src = event.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError('');

    try {
      // Resize to 800px max and convert to Base64 (same as Project Board)
      const base64Image = await resizeImage(file, 800, 800);
      onUpload(base64Image);
    } catch (err) {
      console.error('Image processing error:', err);
      setError('Failed to process image.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center space-x-2">
        <label className="cursor-pointer flex items-center px-3 py-1.5 bg-stone-100 text-stone-700 rounded-lg hover:bg-stone-200 transition-colors text-xs font-medium">
          <Camera size={14} className="mr-1.5" />
          {uploading ? 'Processing...' : 'Upload Photo'}
          <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} disabled={uploading} />
        </label>
        {error && <span className="text-[10px] text-rose-600 font-medium">{error}</span>}
      </div>
    </div>
  );
}

export function AdminDashboard() {
  const { user, userRole } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [qualifications, setQualifications] = useState<any[]>([]);
  const [inductionBookings, setInductionBookings] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [designTools, setDesignTools] = useState<any[]>([]);
  const [printJobs, setPrintJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState('');

  // Selection state for print jobs
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);

  // Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isLoading: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    isLoading: false
  });

  // Equipment form state
  const [isAddingEquipment, setIsAddingEquipment] = useState(false);
  const [editingEquipmentId, setEditingEquipmentId] = useState<string | null>(null);
  const [newEquipmentName, setNewEquipmentName] = useState('');
  const [newEquipmentDesc, setNewEquipmentDesc] = useState('');
  const [newQuiz, setNewQuiz] = useState<{question: string, options: string[], answer: number}[]>([]);
  const [newSlides, setNewSlides] = useState<{title: string, content: string, imageUrl: string}[]>([]);

  // Event form state
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDesc, setNewEventDesc] = useState('');
  const [newEventDate, setNewEventDate] = useState('');

  // Design Tool form state
  const [isAddingDesignTool, setIsAddingDesignTool] = useState(false);
  const [newDesignToolName, setNewDesignToolName] = useState('');
  const [newDesignToolDesc, setNewDesignToolDesc] = useState('');
  const [newDesignToolUrl, setNewDesignToolUrl] = useState('');
  const [newDesignToolIcon, setNewDesignToolIcon] = useState('Box');
  const [newDesignToolColor, setNewDesignToolColor] = useState('bg-indigo-100 text-indigo-700');
  const [newDesignToolType, setNewDesignToolType] = useState<'external' | 'react' | 'iframe'>('iframe');

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
    }, (error) => console.error("Error fetching events:", error));

    // Fetch print jobs
    const jobsQuery = query(collection(db, 'print_jobs'), orderBy('createdAt', 'desc'));
    const unsubJobs = onSnapshot(jobsQuery, (snapshot) => {
      setPrintJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => console.error("Error fetching print jobs:", error));

    // Fetch design tools
    const toolsQuery = query(collection(db, 'design_tools'), orderBy('createdAt', 'desc'));
    const unsubTools = onSnapshot(toolsQuery, (snapshot) => {
      setDesignTools(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      console.error("Error fetching design tools:", error);
      setLoading(false);
    });

    return () => {
      unsubUsers();
      unsubQuals();
      unsubBookings();
      unsubFeedback();
      unsubEquip();
      unsubEvents();
      unsubJobs();
      unsubTools();
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

  const handleUpdatePrintJobStatus = async (jobId: string, status: string) => {
    try {
      await updateDoc(doc(db, 'print_jobs', jobId), {
        status
      });
    } catch (err) {
      console.error('Error updating print job status:', err);
    }
  };

  const handleDeletePrintJob = (job: any) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Document',
      message: `Are you sure you want to delete "${job.fileName}"? This action cannot be undone.`,
      isLoading: false,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isLoading: true }));
        try {
          await deleteDoc(doc(db, 'print_jobs', job.id));
          setConfirmModal(prev => ({ ...prev, isOpen: false, isLoading: false }));
        } catch (err) {
          console.error('Error deleting print job:', err);
          setConfirmModal(prev => ({ ...prev, isLoading: false }));
          alert('Failed to delete document. Please check permissions.');
        }
      }
    });
  };

  const handleBulkDeletePrintJobs = () => {
    if (selectedJobs.length === 0) return;
    
    setConfirmModal({
      isOpen: true,
      title: 'Bulk Delete',
      message: `Are you sure you want to delete ${selectedJobs.length} selected documents? This action cannot be undone.`,
      isLoading: false,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isLoading: true }));
        try {
          const batch = writeBatch(db);
          selectedJobs.forEach(id => {
            batch.delete(doc(db, 'print_jobs', id));
          });
          await batch.commit();
          setSelectedJobs([]);
          setConfirmModal(prev => ({ ...prev, isOpen: false, isLoading: false }));
        } catch (err) {
          console.error('Error bulk deleting print jobs:', err);
          setConfirmModal(prev => ({ ...prev, isLoading: false }));
          alert('Failed to delete documents. Please check permissions.');
        }
      }
    });
  };

  const toggleJobSelection = (jobId: string) => {
    setSelectedJobs(prev => 
      prev.includes(jobId) 
        ? prev.filter(id => id !== jobId) 
        : [...prev, jobId]
    );
  };

  const toggleAllJobs = () => {
    if (selectedJobs.length === printJobs.length) {
      setSelectedJobs([]);
    } else {
      setSelectedJobs(printJobs.map(j => j.id));
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
      const equipmentData = {
        name: newEquipmentName,
        description: newEquipmentDesc,
        quiz: newQuiz,
        slides: newSlides,
        updatedAt: serverTimestamp()
      };

      if (editingEquipmentId) {
        await updateDoc(doc(db, 'equipment', editingEquipmentId), equipmentData);
      } else {
        await addDoc(collection(db, 'equipment'), {
          ...equipmentData,
          createdAt: serverTimestamp()
        });
      }

      setNewEquipmentName('');
      setNewEquipmentDesc('');
      setNewQuiz([]);
      setNewSlides([]);
      setIsAddingEquipment(false);
      setEditingEquipmentId(null);
    } catch (err) {
      console.error('Error saving equipment:', err);
    }
  };

  const handleEditEquipment = (eq: any) => {
    setEditingEquipmentId(eq.id);
    setNewEquipmentName(eq.name);
    setNewEquipmentDesc(eq.description);
    setNewQuiz(eq.quiz || []);
    setNewSlides(eq.slides || []);
    setIsAddingEquipment(true);
  };

  const handleDeleteEquipment = (id: string) => {
    const eq = equipment.find(e => e.id === id);
    setConfirmModal({
      isOpen: true,
      title: 'Delete Equipment',
      message: `Are you sure you want to delete "${eq?.name || 'this equipment'}"?`,
      isLoading: false,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isLoading: true }));
        try {
          await deleteDoc(doc(db, 'equipment', id));
          setConfirmModal(prev => ({ ...prev, isOpen: false, isLoading: false }));
        } catch (err) {
          console.error('Error deleting equipment:', err);
          setConfirmModal(prev => ({ ...prev, isLoading: false }));
        }
      }
    });
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

  const handleDeleteEvent = (id: string) => {
    const ev = events.find(e => e.id === id);
    setConfirmModal({
      isOpen: true,
      title: 'Delete Event',
      message: `Are you sure you want to delete "${ev?.title || 'this event'}"?`,
      isLoading: false,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isLoading: true }));
        try {
          await deleteDoc(doc(db, 'events', id));
          setConfirmModal(prev => ({ ...prev, isOpen: false, isLoading: false }));
        } catch (err) {
          console.error('Error deleting event:', err);
          setConfirmModal(prev => ({ ...prev, isLoading: false }));
        }
      }
    });
  };

  const handleAddDesignTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      await addDoc(collection(db, 'design_tools'), {
        name: newDesignToolName,
        description: newDesignToolDesc,
        url: newDesignToolUrl,
        icon: newDesignToolIcon,
        color: newDesignToolColor,
        type: newDesignToolType,
        createdAt: serverTimestamp()
      });
      setNewDesignToolName('');
      setNewDesignToolDesc('');
      setNewDesignToolUrl('');
      setNewDesignToolIcon('Box');
      setNewDesignToolColor('bg-indigo-100 text-indigo-700');
      setNewDesignToolType('iframe');
      setIsAddingDesignTool(false);
    } catch (err) {
      console.error('Error adding design tool:', err);
    }
  };

  const handleDeleteDesignTool = (id: string) => {
    const tool = designTools.find(t => t.id === id);
    setConfirmModal({
      isOpen: true,
      title: 'Delete Design Tool',
      message: `Are you sure you want to delete "${tool?.name || 'this tool'}"?`,
      isLoading: false,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isLoading: true }));
        try {
          await deleteDoc(doc(db, 'design_tools', id));
          setConfirmModal(prev => ({ ...prev, isOpen: false, isLoading: false }));
        } catch (err) {
          console.error('Error deleting design tool:', err);
          setConfirmModal(prev => ({ ...prev, isLoading: false }));
        }
      }
    });
  };

  const addQuizQuestion = () => {
    setNewQuiz([...newQuiz, { question: '', options: ['', '', '', ''], answer: 0 }]);
  };

  const addSlide = () => {
    setNewSlides([...newSlides, { title: '', content: '', imageUrl: '' }]);
  };

  const updateSlide = (index: number, field: string, value: string) => {
    const updatedSlides = [...newSlides];
    (updatedSlides[index] as any)[field] = value;
    setNewSlides(updatedSlides);
  };

  const removeSlide = (index: number) => {
    const updatedSlides = newSlides.filter((_, i) => i !== index);
    setNewSlides(updatedSlides);
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
          slides: [
            {
              title: "Welcome to Laser Cutting",
              content: "The laser cutter is one of our most versatile tools. It uses a high-powered CO2 laser to cut and engrave materials like wood, acrylic, and leather.",
              imageUrl: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=800"
            },
            {
              title: "Safety First: Ventilation",
              content: "NEVER operate the laser without the extraction system running. Fumes from cutting can be toxic and flammable.",
              imageUrl: "https://images.unsplash.com/photo-1513828583688-c52646db42da?auto=format&fit=crop&q=80&w=800"
            },
            {
              title: "Fire Hazards",
              content: "Laser cutting involves burning material. Small flames are normal, but you must stay with the machine at all times to watch for flare-ups.",
              imageUrl: "https://images.unsplash.com/photo-1516733725897-1aa73b87c8e8?auto=format&fit=crop&q=80&w=800"
            }
          ],
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
          slides: [
            {
              title: "3D Printing Basics",
              content: "Our FDM printers build objects layer by layer using melted plastic filament.",
              imageUrl: "https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&q=80&w=800"
            }
          ],
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
                onClick={() => {
                  setIsAddingEquipment(true);
                  setEditingEquipmentId(null);
                  setNewEquipmentName('');
                  setNewEquipmentDesc('');
                  setNewQuiz([]);
                  setNewSlides([]);
                }}
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
                    <h3 className="font-medium text-stone-900">Induction Slides</h3>
                    <p className="text-[10px] text-stone-400 max-w-[200px]">Images are stored directly in the database. Keep slides under 10 for best performance.</p>
                    <button
                      type="button"
                      onClick={addSlide}
                      className="text-sm text-stone-600 hover:text-stone-900 flex items-center"
                    >
                      <Plus size={16} className="mr-1" /> Add Slide
                    </button>
                  </div>
                  
                  {newSlides.map((s, sIndex) => (
                    <div key={sIndex} className="mb-6 p-4 bg-white rounded-xl border border-stone-200 relative">
                      <button
                        type="button"
                        onClick={() => removeSlide(sIndex)}
                        className="absolute top-4 right-4 text-stone-400 hover:text-red-600"
                      >
                        <Trash2 size={16} />
                      </button>
                      <div className="space-y-3 pr-8">
                        <div>
                          <label className="block text-xs font-medium text-stone-500 mb-1">Slide {sIndex + 1} Title</label>
                          <input
                            type="text"
                            required
                            value={s.title}
                            onChange={(e) => updateSlide(sIndex, 'title', e.target.value)}
                            className="w-full px-3 py-1.5 text-sm rounded-lg border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-stone-500 mb-1">Content</label>
                          <textarea
                            required
                            value={s.content}
                            onChange={(e) => updateSlide(sIndex, 'content', e.target.value)}
                            className="w-full px-3 py-1.5 text-sm rounded-lg border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none h-20"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-stone-500 mb-1">Image URL</label>
                          <div className="flex flex-col space-y-2">
                            <div className="flex space-x-2">
                              <input
                                type="url"
                                value={s.imageUrl}
                                onChange={(e) => updateSlide(sIndex, 'imageUrl', e.target.value)}
                                placeholder="https://..."
                                className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none"
                              />
                              {s.imageUrl && (
                                <div className="w-10 h-10 rounded-lg overflow-hidden border border-stone-200 bg-stone-100">
                                  <img src={s.imageUrl} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                </div>
                              )}
                            </div>
                            <ImageUpload 
                              onUpload={(url) => updateSlide(sIndex, 'imageUrl', url)} 
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
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
                    onClick={() => {
                      setIsAddingEquipment(false);
                      setEditingEquipmentId(null);
                    }}
                    className="px-4 py-2 text-stone-600 hover:bg-stone-200 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors"
                  >
                    {editingEquipmentId ? 'Update Equipment' : 'Save Equipment'}
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
                  <div className="absolute top-4 right-4 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleEditEquipment(eq)}
                      className="p-2 text-stone-400 hover:text-stone-900 hover:bg-white rounded-lg transition-colors"
                      title="Edit equipment"
                    >
                      <Settings size={18} />
                    </button>
                    <button
                      onClick={() => handleDeleteEquipment(eq.id)}
                      className="p-2 text-stone-400 hover:text-red-600 hover:bg-white rounded-lg transition-colors"
                      title="Delete equipment"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <h3 className="font-semibold text-stone-900 mb-1 pr-20">{eq.name}</h3>
                  <p className="text-sm text-stone-600 mb-2">{eq.description}</p>
                  <div className="flex items-center space-x-2 text-xs font-medium text-stone-500">
                    <span className="bg-stone-200 px-2 py-1 rounded-md">
                      {eq.slides?.length || 0} Slides
                    </span>
                    <span className="bg-stone-200 px-2 py-1 rounded-md">
                      {eq.quiz?.length || 0} Quiz Questions
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Manage Design Tools */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-200">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold flex items-center">
              <Box className="mr-3 text-stone-400" />
              Manage Design Tools
            </h2>
            {!isAddingDesignTool && (
              <button
                onClick={() => setIsAddingDesignTool(true)}
                className="flex items-center text-sm bg-stone-100 text-stone-700 px-3 py-2 rounded-xl hover:bg-stone-200 transition-colors"
              >
                <Plus size={16} className="mr-1" />
                Add Tool
              </button>
            )}
          </div>

          {isAddingDesignTool && (
            <form onSubmit={handleAddDesignTool} className="mb-8 p-6 bg-stone-50 rounded-2xl border border-stone-200">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Tool Name</label>
                  <input
                    type="text"
                    required
                    value={newDesignToolName}
                    onChange={(e) => setNewDesignToolName(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none"
                    placeholder="e.g. Vector Editor"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Description</label>
                  <textarea
                    required
                    value={newDesignToolDesc}
                    onChange={(e) => setNewDesignToolDesc(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none"
                    placeholder="Briefly describe what this tool does."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Tool Type</label>
                  <select
                    value={newDesignToolType}
                    onChange={(e) => setNewDesignToolType(e.target.value as any)}
                    className="w-full px-4 py-2 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none"
                  >
                    <option value="iframe">Embed Link (Opens in Iframe)</option>
                    <option value="external">External Link (Opens in New Tab)</option>
                    <option value="react">Internal React Route (App Route)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Tool URL</label>
                  <input
                    type="text"
                    required
                    value={newDesignToolUrl}
                    onChange={(e) => setNewDesignToolUrl(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none"
                    placeholder={newDesignToolType === 'external' ? 'https://...' : newDesignToolType === 'iframe' ? 'https://my-design-tool.com' : '/design-tools/sculpt'}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Icon (Lucide name)</label>
                    <select
                      value={newDesignToolIcon}
                      onChange={(e) => setNewDesignToolIcon(e.target.value)}
                      className="w-full px-4 py-2 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none"
                    >
                      <option value="Box">Box</option>
                      <option value="PenTool">PenTool</option>
                      <option value="Layers">Layers</option>
                      <option value="Image">Image</option>
                      <option value="Scissors">Scissors</option>
                      <option value="Type">Type</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Color Class</label>
                    <select
                      value={newDesignToolColor}
                      onChange={(e) => setNewDesignToolColor(e.target.value)}
                      className="w-full px-4 py-2 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none"
                    >
                      <option value="bg-indigo-100 text-indigo-700">Indigo</option>
                      <option value="bg-emerald-100 text-emerald-700">Emerald</option>
                      <option value="bg-amber-100 text-amber-700">Amber</option>
                      <option value="bg-rose-100 text-rose-700">Rose</option>
                      <option value="bg-blue-100 text-blue-700">Blue</option>
                      <option value="bg-purple-100 text-purple-700">Purple</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsAddingDesignTool(false)}
                    className="px-4 py-2 text-stone-600 hover:bg-stone-200 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors"
                  >
                    Save Tool
                  </button>
                </div>
              </div>
            </form>
          )}

          {designTools.length === 0 ? (
            <p className="text-stone-500 text-center py-4">No external tools added yet.</p>
          ) : (
            <div className="space-y-4">
              {designTools.map(tool => (
                <div key={tool.id} className="p-4 bg-stone-50 rounded-2xl relative group">
                  <button
                    onClick={() => handleDeleteDesignTool(tool.id)}
                    className="absolute top-4 right-4 p-2 text-stone-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete tool"
                  >
                    <Trash2 size={18} />
                  </button>
                  <h3 className="font-semibold text-stone-900 mb-1 pr-8">{tool.name}</h3>
                  <p className="text-sm text-stone-600 mb-1">{tool.description}</p>
                  <p className="text-xs text-stone-400 truncate pr-8">{tool.url}</p>
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

        {/* Document Uploads */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-200 lg:col-span-2">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold flex items-center">
              <UploadCloud className="mr-3 text-stone-400" />
              Document Uploads
            </h2>
            {selectedJobs.length > 0 && (
              <button
                onClick={handleBulkDeletePrintJobs}
                className="flex items-center text-sm bg-rose-50 text-rose-600 px-4 py-2 rounded-xl hover:bg-rose-100 transition-colors font-medium"
              >
                <Trash2 size={18} className="mr-2" />
                Delete Selected ({selectedJobs.length})
              </button>
            )}
          </div>
          {printJobs.length === 0 ? (
            <p className="text-stone-500 text-center py-4">No documents uploaded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 text-sm text-stone-500">
                    <th className="pb-3 w-10">
                      <input 
                        type="checkbox" 
                        checked={selectedJobs.length === printJobs.length && printJobs.length > 0}
                        onChange={toggleAllJobs}
                        className="rounded border-stone-300 text-stone-900 focus:ring-stone-900"
                      />
                    </th>
                    <th className="pb-3 font-medium">User</th>
                    <th className="pb-3 font-medium">Document</th>
                    <th className="pb-3 font-medium">Details</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Date</th>
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {printJobs.map(job => (
                    <tr key={job.id} className={`border-b border-stone-100 last:border-0 transition-colors ${selectedJobs.includes(job.id) ? 'bg-stone-50' : ''}`}>
                      <td className="py-4">
                        <input 
                          type="checkbox" 
                          checked={selectedJobs.includes(job.id)}
                          onChange={() => toggleJobSelection(job.id)}
                          className="rounded border-stone-300 text-stone-900 focus:ring-stone-900"
                        />
                      </td>
                      <td className="py-4 font-medium text-stone-900">{job.userName}</td>
                      <td className="py-4 text-stone-600 max-w-[200px] truncate" title={job.fileName}>{job.fileName}</td>
                      <td className="py-4 text-stone-500">
                        {job.filamentColor && <div className="text-xs"><span className="font-medium">Color:</span> {job.filamentColor}</div>}
                        {job.notes && <div className="text-xs truncate max-w-[150px]" title={job.notes}><span className="font-medium">Notes:</span> {job.notes}</div>}
                      </td>
                      <td className="py-4">
                        <select
                          value={job.status || 'pending'}
                          onChange={(e) => handleUpdatePrintJobStatus(job.id, e.target.value)}
                          className={`text-sm border border-stone-200 rounded-lg px-2 py-1 outline-none ${
                            job.status === 'pending' ? 'bg-amber-50 text-amber-800' :
                            job.status === 'processing' ? 'bg-blue-50 text-blue-800' :
                            job.status === 'ready' ? 'bg-emerald-50 text-emerald-800' :
                            'bg-stone-50 text-stone-800'
                          }`}
                        >
                          <option value="pending">Pending</option>
                          <option value="processing">Processing</option>
                          <option value="ready">Ready</option>
                          <option value="completed">Completed</option>
                        </select>
                      </td>
                      <td className="py-4 text-stone-500">{job.createdAt?.toDate ? job.createdAt.toDate().toLocaleDateString() : 'Unknown'}</td>
                      <td className="py-4 text-right space-x-2">
                        <a
                          href={job.fileUrl || job.fileData}
                          download={job.fileName}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex p-2 text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
                          title="Download"
                        >
                          <Download size={18} />
                        </a>
                        <button
                          onClick={() => handleDeletePrintJob(job)}
                          className="inline-flex p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

      <ConfirmModal 
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        isLoading={confirmModal.isLoading}
      />
    </div>
  );
}
