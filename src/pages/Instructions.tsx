import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { BookOpen, Plus, Trash2, Edit2, ChevronDown, ChevronUp } from 'lucide-react';
import Markdown from 'react-markdown';

export function Instructions() {
  const { userRole } = useAuth();
  const [instructions, setInstructions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Admin form state
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [equipmentId, setEquipmentId] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'instructions'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const instData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setInstructions(instData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole !== 'admin') return;

    try {
      if (editId) {
        await updateDoc(doc(db, 'instructions', editId), {
          title,
          equipmentId,
          content,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'instructions'), {
          title,
          equipmentId,
          content,
          createdAt: serverTimestamp()
        });
      }
      resetForm();
    } catch (err) {
      console.error('Error saving instruction:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (userRole !== 'admin') return;
    try {
      await deleteDoc(doc(db, 'instructions', id));
    } catch (err) {
      console.error('Error deleting instruction:', err);
    }
  };

  const handleEdit = (inst: any) => {
    setEditId(inst.id);
    setTitle(inst.title);
    setEquipmentId(inst.equipmentId);
    setContent(inst.content);
    setIsEditing(true);
  };

  const resetForm = () => {
    setEditId(null);
    setTitle('');
    setEquipmentId('');
    setContent('');
    setIsEditing(false);
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-stone-900">Instruction Manuals</h1>
          <p className="text-stone-500 mt-2 text-lg">Step-by-step guides for using makerspace equipment.</p>
        </div>
        {userRole === 'admin' && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center bg-stone-900 text-white px-4 py-2 rounded-xl hover:bg-stone-800 transition-colors"
          >
            <Plus size={20} className="mr-2" />
            Add Manual
          </button>
        )}
      </header>

      {isEditing && userRole === 'admin' && (
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-200 mb-8">
          <h2 className="text-2xl font-semibold mb-4">{editId ? 'Edit Manual' : 'New Manual'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none"
                placeholder="e.g. Laser Cutter Basic Operation"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Equipment ID</label>
              <input
                type="text"
                required
                value={equipmentId}
                onChange={(e) => setEquipmentId(e.target.value)}
                className="w-full px-4 py-2 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none"
                placeholder="e.g. laser-cutter"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Content (Markdown supported)</label>
              <textarea
                required
                rows={10}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full px-4 py-2 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900 outline-none resize-y"
                placeholder="1. Turn on the machine...&#10;2. Load material..."
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 text-stone-600 hover:bg-stone-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors"
              >
                Save Manual
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-4">
        {instructions.length === 0 ? (
          <p className="text-stone-500 text-center py-8">No instruction manuals available yet.</p>
        ) : (
          instructions.map((inst) => (
            <div key={inst.id} className="bg-white rounded-3xl shadow-sm border border-stone-200 overflow-hidden">
              <div 
                className="p-6 flex justify-between items-center cursor-pointer hover:bg-stone-50 transition-colors"
                onClick={() => setExpandedId(expandedId === inst.id ? null : inst.id)}
              >
                <div className="flex items-center">
                  <BookOpen className="text-stone-400 mr-4" size={24} />
                  <div>
                    <h3 className="text-xl font-semibold text-stone-900">{inst.title}</h3>
                    <p className="text-sm text-stone-500">Equipment: {inst.equipmentId}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  {userRole === 'admin' && (
                    <div className="flex space-x-2" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => handleEdit(inst)} className="p-2 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors">
                        <Edit2 size={18} />
                      </button>
                      <button onClick={() => handleDelete(inst.id)} className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  )}
                  {expandedId === inst.id ? <ChevronUp className="text-stone-400" /> : <ChevronDown className="text-stone-400" />}
                </div>
              </div>
              
              {expandedId === inst.id && (
                <div className="p-6 border-t border-stone-100 bg-stone-50">
                  <div className="prose prose-stone max-w-none">
                    <Markdown>{inst.content}</Markdown>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
