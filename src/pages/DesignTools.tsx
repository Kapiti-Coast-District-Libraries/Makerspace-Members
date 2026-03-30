import React, { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  Box, 
  ArrowRight, 
  PenTool, 
  Layers, 
  Image as ImageIcon, 
  Scissors, 
  Type,
  ExternalLink 
} from 'lucide-react';

const iconMap: Record<string, any> = {
  Box,
  PenTool,
  Layers,
  Image: ImageIcon,
  Scissors,
  Type
};

export function DesignTools() {
  const [tools, setTools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'design_tools'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTools(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      console.error("Error fetching design tools:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-12 text-stone-500">Loading tools...</div>;
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-4xl font-bold tracking-tight text-stone-900">Design Tools</h1>
        <p className="text-stone-500 mt-2 text-lg">Create, experiment, and generate designs for your projects.</p>
      </header>

      {tools.length === 0 ? (
        <div className="bg-stone-50 border-2 border-dashed border-stone-200 rounded-3xl p-12 text-center">
          <Box className="mx-auto text-stone-300 mb-4" size={48} />
          <h3 className="text-lg font-medium text-stone-900 mb-1">No tools available yet</h3>
          <p className="text-stone-500">Check back soon for new design tools!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.map((tool) => {
            const Icon = iconMap[tool.icon] || Box;
            
            // Determine how to link based on tool type
            let linkElement;
            const CardContent = (
              <>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${tool.color}`}>
                  <Icon size={24} />
                </div>
                <h3 className="text-xl font-semibold text-stone-900 mb-2 group-hover:text-indigo-600 transition-colors">
                  {tool.name}
                </h3>
                <p className="text-stone-500 text-sm mb-6">
                  {tool.description}
                </p>
                <div className="flex items-center text-sm font-medium text-indigo-600 group-hover:translate-x-1 transition-transform">
                  Open Tool
                  {tool.type === 'external' ? <ExternalLink size={16} className="ml-1" /> : <ArrowRight size={16} className="ml-1" />}
                </div>
              </>
            );

            if (tool.type === 'external') {
              linkElement = (
                <a
                  href={tool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group bg-white p-6 rounded-3xl shadow-sm border border-stone-200 hover:shadow-md hover:border-stone-300 transition-all"
                >
                  {CardContent}
                </a>
              );
            } else if (tool.type === 'iframe' || tool.type === 'static') {
              linkElement = (
                <Link
                  to={`/design-tools/view/${tool.id}`}
                  className="block group bg-white p-6 rounded-3xl shadow-sm border border-stone-200 hover:shadow-md hover:border-stone-300 transition-all"
                >
                  {CardContent}
                </Link>
              );
            } else {
              // React internal route
              linkElement = (
                <Link
                  to={tool.url}
                  className="block group bg-white p-6 rounded-3xl shadow-sm border border-stone-200 hover:shadow-md hover:border-stone-300 transition-all"
                >
                  {CardContent}
                </Link>
              );
            }

            return <React.Fragment key={tool.id}>{linkElement}</React.Fragment>;
          })}
        </div>
      )}
    </div>
  );
}
