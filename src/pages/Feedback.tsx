import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { MessageSquare, CheckCircle, AlertCircle } from 'lucide-react';

export function Feedback() {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [type, setType] = useState('consumable');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      await addDoc(collection(db, 'feedback'), {
        userId: user.uid,
        message,
        type,
        status: 'new',
        createdAt: serverTimestamp()
      });
      
      setSuccess('Thank you for your feedback!');
      setMessage('');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit feedback');
      setTimeout(() => setError(''), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-stone-900">Feedback & Reports</h1>
        <p className="text-stone-500 mt-2 text-lg">Let us know if we're running low on consumables or if you have any suggestions.</p>
      </header>

      <div className="max-w-2xl bg-white p-8 rounded-3xl shadow-sm border border-stone-200">
        <h2 className="text-2xl font-semibold mb-6 flex items-center">
          <MessageSquare className="mr-3 text-stone-400" />
          Submit a Report
        </h2>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-center mb-6">
            <AlertCircle className="mr-2" size={20} />
            {error}
          </div>
        )}

        {success && (
          <div className="bg-emerald-50 text-emerald-600 p-4 rounded-xl flex items-center mb-6">
            <CheckCircle className="mr-2" size={20} />
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">Report Type</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className={`cursor-pointer border rounded-xl p-4 flex items-center justify-center transition-colors ${type === 'consumable' ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'}`}>
                <input
                  type="radio"
                  name="type"
                  value="consumable"
                  checked={type === 'consumable'}
                  onChange={(e) => setType(e.target.value)}
                  className="sr-only"
                />
                <span className="font-medium">Low Consumable</span>
              </label>
              <label className={`cursor-pointer border rounded-xl p-4 flex items-center justify-center transition-colors ${type === 'general' ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'}`}>
                <input
                  type="radio"
                  name="type"
                  value="general"
                  checked={type === 'general'}
                  onChange={(e) => setType(e.target.value)}
                  className="sr-only"
                />
                <span className="font-medium">General Feedback</span>
              </label>
              <label className={`cursor-pointer border rounded-xl p-4 flex items-center justify-center transition-colors ${type === 'issue' ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'}`}>
                <input
                  type="radio"
                  name="type"
                  value="issue"
                  checked={type === 'issue'}
                  onChange={(e) => setType(e.target.value)}
                  className="sr-only"
                />
                <span className="font-medium">Report an Issue</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">Message</label>
            <textarea
              required
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 focus:border-transparent transition-all outline-none resize-none"
              placeholder={type === 'consumable' ? "e.g. We are running low on 3mm clear acrylic." : type === 'issue' ? "e.g. The 3D printer nozzle is jammed." : "e.g. The new soldering irons are great!"}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-stone-900 text-white font-medium py-3 px-4 rounded-xl hover:bg-stone-800 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit Report'}
          </button>
        </form>
      </div>
    </div>
  );
}
