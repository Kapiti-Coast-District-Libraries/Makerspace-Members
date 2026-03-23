import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { PenTool, CheckCircle, AlertCircle } from 'lucide-react';

const EQUIPMENT_OPTIONS = [
  { id: 'laser-cutter', name: 'Laser Cutter', unit: 'minutes' },
  { id: '3d-printer', name: '3D Printer', unit: 'grams' },
  { id: 'vinyl-cutter', name: 'Vinyl Cutter', unit: 'meters' },
  { id: 'sewing-machine', name: 'Sewing Machines', unit: 'hours' },
  { id: 'hand-tools', name: 'Hand Tools / Electronics', unit: 'hours' },
];

export function LogUsage() {
  const { user } = useAuth();
  const [qualifications, setQualifications] = useState<string[]>([]);
  const [equipment, setEquipment] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;

    // Listen to qualifications
    const qualQuery = query(
      collection(db, 'qualifications'),
      where('userId', '==', user.uid),
      where('status', '==', 'active')
    );

    const unsubQual = onSnapshot(qualQuery, (snapshot) => {
      const quals = snapshot.docs.map(doc => doc.data().equipmentId);
      setQualifications(quals);
      if (quals.length > 0 && !equipment) {
        setEquipment(quals[0]);
      }
    });

    // Listen to usage logs
    const logsQuery = query(
      collection(db, 'usage_logs'),
      where('userId', '==', user.uid),
      orderBy('loggedAt', 'desc')
    );

    const unsubLogs = onSnapshot(logsQuery, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLogs(logsData);
      setLoading(false);
    });

    return () => {
      unsubQual();
      unsubLogs();
    };
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError('');
    setSuccess('');
    setSubmitting(true);

    const selectedEq = EQUIPMENT_OPTIONS.find(eq => eq.id === equipment);
    if (!selectedEq) return;

    try {
      await addDoc(collection(db, 'usage_logs'), {
        userId: user.uid,
        equipmentId: equipment,
        amount: parseFloat(amount),
        unit: selectedEq.unit,
        loggedAt: serverTimestamp()
      });
      
      setSuccess(`Successfully logged ${amount} ${selectedEq.unit} for ${selectedEq.name}`);
      setAmount('');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to log usage');
      setTimeout(() => setError(''), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-stone-900">Log Equipment Usage</h1>
        <p className="text-stone-500 mt-2 text-lg">Record your usage of consumables and machine time.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Log Form */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-200">
          <h2 className="text-2xl font-semibold mb-6 flex items-center">
            <PenTool className="mr-3 text-stone-400" />
            New Entry
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

          {qualifications.length === 0 ? (
            <div className="bg-amber-50 text-amber-800 p-6 rounded-2xl text-center">
              <AlertCircle className="mx-auto mb-2" size={32} />
              <p className="font-medium">You need to complete an induction first.</p>
              <p className="text-sm mt-1 opacity-80">Go to the Inductions tab to get qualified for equipment.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">Equipment</label>
                <select
                  value={equipment}
                  onChange={(e) => setEquipment(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 focus:border-transparent transition-all outline-none bg-white"
                  required
                >
                  {EQUIPMENT_OPTIONS.filter(eq => qualifications.includes(eq.id)).map(eq => (
                    <option key={eq.id} value={eq.id}>{eq.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Amount ({EQUIPMENT_OPTIONS.find(eq => eq.id === equipment)?.unit || 'units'})
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 focus:border-transparent transition-all outline-none"
                  placeholder="e.g. 15.5"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-stone-900 text-white font-medium py-3 px-4 rounded-xl hover:bg-stone-800 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Logging...' : 'Log Usage'}
              </button>
            </form>
          )}
        </div>

        {/* Recent Logs */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-200">
          <h2 className="text-2xl font-semibold mb-6">Recent Usage</h2>
          
          {logs.length === 0 ? (
            <p className="text-stone-500 text-center py-8">No usage logged yet.</p>
          ) : (
            <div className="space-y-4">
              {logs.map((log, idx) => {
                const eqName = EQUIPMENT_OPTIONS.find(eq => eq.id === log.equipmentId)?.name || log.equipmentId;
                return (
                  <div key={idx} className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl">
                    <div>
                      <p className="font-medium text-stone-900">{eqName}</p>
                      <p className="text-sm text-stone-500">
                        {log.loggedAt?.toDate ? log.loggedAt.toDate().toLocaleString() : 'Recently'}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="inline-block bg-stone-200 text-stone-800 px-3 py-1 rounded-full text-sm font-medium">
                        {log.amount} {log.unit}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
