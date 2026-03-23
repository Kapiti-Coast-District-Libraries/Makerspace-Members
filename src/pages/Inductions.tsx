import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { BookOpen, CheckCircle, Clock, Send, X, Calendar } from 'lucide-react';

function BookingModal({ equipment, onClose, onSuccess }: { equipment: any, onClose: () => void, onSuccess: (date: Date) => void }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !time) return;
    const bookingDate = new Date(`${date}T${time}`);
    onSuccess(bookingDate);
  };

  // Get tomorrow's date for min attribute
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-stone-400 hover:text-stone-900"
        >
          <X size={24} />
        </button>
        <h2 className="text-2xl font-bold text-stone-900 mb-2">Book In-Person Induction</h2>
        <p className="text-stone-500 mb-6 text-sm">Select a preferred date and time for your {equipment.name} induction.</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Date</label>
            <input
              type="date"
              required
              min={minDate}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Time</label>
            <input
              type="time"
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={!date || !time}
            className="w-full py-3 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors disabled:opacity-50 font-medium mt-6"
          >
            Confirm Booking
          </button>
        </form>
      </div>
    </div>
  );
}

function QuizModal({ equipment, onClose, onSuccess }: { equipment: any, onClose: () => void, onSuccess: () => void }) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [error, setError] = useState(false);

  const questions = equipment.quiz || [];

  const handleNext = () => {
    if (selectedOption === null) return;
    
    if (selectedOption === questions[currentQuestion].answer) {
      setError(false);
      if (currentQuestion === questions.length - 1) {
        onSuccess();
      } else {
        setCurrentQuestion(prev => prev + 1);
        setSelectedOption(null);
      }
    } else {
      setError(true);
    }
  };

  if (questions.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full relative text-center">
          <button onClick={onClose} className="absolute top-4 right-4 text-stone-400 hover:text-stone-900">
            <X size={24} />
          </button>
          <h2 className="text-2xl font-bold text-stone-900 mb-4">No Quiz Required</h2>
          <p className="text-stone-500 mb-6">There is no safety quiz for this equipment. You can proceed to book an in-person induction.</p>
          <button
            onClick={onSuccess}
            className="w-full py-3 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors font-medium"
          >
            Continue to Booking
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-stone-400 hover:text-stone-900"
        >
          <X size={24} />
        </button>
        <h2 className="text-2xl font-bold text-stone-900 mb-2">{equipment.name} Safety Quiz</h2>
        <p className="text-stone-500 mb-6 text-sm">Please answer the following questions to proceed to booking.</p>
        
        <div className="mb-6">
          <p className="font-medium text-stone-900 mb-4">
            Question {currentQuestion + 1} of {questions.length}:<br/>
            <span className="text-lg">{questions[currentQuestion].question}</span>
          </p>
          <div className="space-y-3">
            {questions[currentQuestion].options.map((option: string, idx: number) => (
              <button
                key={idx}
                onClick={() => { setSelectedOption(idx); setError(false); }}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                  selectedOption === idx 
                    ? 'border-stone-900 bg-stone-50 text-stone-900 font-medium' 
                    : 'border-stone-200 hover:border-stone-400 text-stone-600'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          {error && (
            <p className="text-rose-600 text-sm mt-4 font-medium">Incorrect answer. Please try again.</p>
          )}
        </div>

        <button
          onClick={handleNext}
          disabled={selectedOption === null}
          className="w-full py-3 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors disabled:opacity-50 font-medium"
        >
          {currentQuestion === questions.length - 1 ? 'Continue to Booking' : 'Next Question'}
        </button>
      </div>
    </div>
  );
}

export function Inductions() {
  const { user } = useAuth();
  const [qualifications, setQualifications] = useState<any[]>([]);
  const [equipmentList, setEquipmentList] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<any | null>(null);
  const [bookingEquipment, setBookingEquipment] = useState<any | null>(null);

  useEffect(() => {
    if (!user) return;

    const qualQuery = query(
      collection(db, 'qualifications'),
      where('userId', '==', user.uid)
    );

    const unsubQual = onSnapshot(qualQuery, (snapshot) => {
      const quals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setQualifications(quals);
    });

    const equipQuery = query(collection(db, 'equipment'), orderBy('createdAt', 'asc'));
    const unsubEquip = onSnapshot(equipQuery, (snapshot) => {
      setEquipmentList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    const bookingsQuery = query(
      collection(db, 'induction_bookings'),
      where('userId', '==', user.uid)
    );
    const unsubBookings = onSnapshot(bookingsQuery, (snapshot) => {
      setBookings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubQual();
      unsubEquip();
      unsubBookings();
    };
  }, [user]);

  const handleQuizSuccess = () => {
    const eq = activeQuiz;
    setActiveQuiz(null);
    setBookingEquipment(eq);
  };

  const handleBookInduction = async (date: Date) => {
    if (!user || !bookingEquipment) return;
    setRequesting(bookingEquipment.id);
    
    try {
      await addDoc(collection(db, 'induction_bookings'), {
        userId: user.uid,
        equipmentId: bookingEquipment.id,
        date: date,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setBookingEquipment(null);
    } catch (err) {
      console.error('Error booking induction:', err);
    } finally {
      setRequesting(null);
    }
  };

  if (loading) return <div>Loading inductions...</div>;

  return (
    <div className="space-y-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-stone-900">Equipment Inductions</h1>
        <p className="text-stone-500 mt-2 text-lg">View your current qualifications. Book an in-person induction for new equipment.</p>
      </header>

      {activeQuiz && (
        <QuizModal 
          equipment={activeQuiz}
          onClose={() => setActiveQuiz(null)}
          onSuccess={handleQuizSuccess}
        />
      )}

      {bookingEquipment && (
        <BookingModal
          equipment={bookingEquipment}
          onClose={() => setBookingEquipment(null)}
          onSuccess={handleBookInduction}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {equipmentList.length === 0 ? (
          <div className="col-span-full text-center py-12 text-stone-500 bg-stone-50 rounded-3xl">
            <BookOpen className="mx-auto h-12 w-12 text-stone-300 mb-3" />
            <p>No equipment available yet.</p>
          </div>
        ) : (
          equipmentList.map((eq) => {
            const qual = qualifications.find(q => q.equipmentId === eq.id);
            const isQualified = qual?.status === 'active';
            const booking = bookings.find(b => b.equipmentId === eq.id && b.status !== 'cancelled' && b.status !== 'completed');
            const isPending = !!booking;
            
            return (
              <div key={eq.id} className="bg-white p-6 rounded-3xl shadow-sm border border-stone-200 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-2xl ${isQualified ? 'bg-emerald-100 text-emerald-600' : isPending ? 'bg-amber-100 text-amber-600' : 'bg-stone-100 text-stone-600'}`}>
                    {isQualified ? <CheckCircle size={24} /> : isPending ? <Calendar size={24} /> : <BookOpen size={24} />}
                  </div>
                  {isQualified && <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">Qualified</span>}
                  {isPending && <span className="text-xs font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-3 py-1 rounded-full">{booking.status}</span>}
                </div>
                
                <h3 className="text-xl font-semibold text-stone-900 mb-2">{eq.name}</h3>
                <p className="text-stone-500 text-sm flex-1 mb-6">{eq.description}</p>
                
                {isQualified ? (
                  <div className="w-full py-3 px-4 rounded-xl font-medium text-center bg-emerald-50 text-emerald-700">
                    Induction Completed
                  </div>
                ) : isPending ? (
                  <div className="w-full py-3 px-4 rounded-xl font-medium text-center bg-amber-50 text-amber-700 flex flex-col items-center justify-center">
                    <div className="flex items-center mb-1">
                      <Calendar size={16} className="mr-2" /> Booking {booking.status}
                    </div>
                    {booking.date?.toDate && (
                      <span className="text-xs text-amber-600/80">
                        {booking.date.toDate().toLocaleString()}
                      </span>
                    )}
                  </div>
                ) : (
                  <button 
                    onClick={() => setActiveQuiz(eq)}
                    disabled={requesting === eq.id}
                    className="w-full py-3 px-4 rounded-xl font-medium text-center bg-stone-900 text-white hover:bg-stone-800 transition-colors flex items-center justify-center disabled:opacity-50"
                  >
                    {requesting === eq.id ? 'Processing...' : <><Calendar size={16} className="mr-2" /> Book Induction</>}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
