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
  ExternalLink,
  ChevronDown,
  Hammer,
  Sparkles,
  Wrench,
  Cpu
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const iconMap: Record<string, any> = {
  Box,
  PenTool,
  Layers,
  Image: ImageIcon,
  Scissors,
  Type,
  Wrench,
  Hammer,
  Cpu,
  Sparkles
};

interface ToolCardProps {
  tool: any;
}

function ToolCard({ tool }: ToolCardProps) {
  const Icon = iconMap[tool.icon] || Box;

  const cardInner = (
    <>
      {tool.imageUrl ? (
        <div className="aspect-video w-full rounded-2xl overflow-hidden mb-4 border border-stone-100">
          <img 
            src={tool.imageUrl} 
            alt={tool.name} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            referrerPolicy="no-referrer"
          />
        </div>
      ) : (
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${tool.color || 'bg-indigo-100 text-indigo-700'}`}>
          <Icon size={24} />
        </div>
      )}
      <h3 className="text-xl font-semibold text-stone-900 mb-2 group-hover:text-indigo-600 transition-colors">
        {tool.name}
      </h3>
      <p className="text-stone-500 text-sm mb-6 line-clamp-3">
        {tool.description}
      </p>
      <div className="flex items-center text-sm font-medium text-indigo-600 group-hover:translate-x-1 transition-transform mt-auto">
        Open Tool
        {tool.type === 'external' ? <ExternalLink size={16} className="ml-1" /> : <ArrowRight size={16} className="ml-1" />}
      </div>
    </>
  );

  if (tool.type === 'external') {
    return (
      <a
        href={tool.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-col group bg-white p-6 rounded-3xl shadow-sm border border-stone-200 hover:shadow-md hover:border-stone-300 transition-all h-full"
      >
        {cardInner}
      </a>
    );
  } else if (tool.type === 'iframe' || tool.type === 'static') {
    return (
      <Link
        to={`/design-tools/view/${tool.id}`}
        className="flex flex-col group bg-white p-6 rounded-3xl shadow-sm border border-stone-200 hover:shadow-md hover:border-stone-300 transition-all h-full"
      >
        {cardInner}
      </Link>
    );
  } else {
    // React internal route
    return (
      <Link
        to={tool.url}
        className="flex flex-col group bg-white p-6 rounded-3xl shadow-sm border border-stone-200 hover:shadow-md hover:border-stone-300 transition-all h-full"
      >
        {cardInner}
      </Link>
    );
  }
}

interface FoldOutSectionProps {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  badgeColor: string;
  tools: any[];
  isOpen: boolean;
  onToggle: () => void;
  emptyLabel: string;
}

function FoldOutSection({
  title,
  description,
  icon,
  badgeColor,
  tools,
  isOpen,
  onToggle,
  emptyLabel
}: FoldOutSectionProps) {
  return (
    <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden transition-colors hover:border-stone-300">
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-6 flex items-center justify-between text-left group hover:bg-stone-50/60 transition-colors focus:outline-none"
        aria-expanded={isOpen}
      >
        <div className="flex items-center space-x-4 min-w-0 pr-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${badgeColor}`}>
            {icon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-bold text-stone-900 group-hover:text-indigo-950 transition-colors">
                {title}
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-stone-100 text-stone-600 border border-stone-200/80">
                {tools.length} {tools.length === 1 ? 'tool' : 'tools'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-stone-500 mt-0.5 line-clamp-1 font-sans">
              {description}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          <span className="text-xs font-medium text-stone-400 hidden sm:inline">
            {isOpen ? 'Fold in' : 'Fold out'}
          </span>
          <div className="w-9 h-9 rounded-xl bg-stone-100 group-hover:bg-stone-200/80 flex items-center justify-center text-stone-600 transition-all">
            <ChevronDown 
              size={18} 
              className={`transform transition-transform duration-300 ${isOpen ? 'rotate-180 text-stone-900' : ''}`}
            />
          </div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="p-6 pt-4 border-t border-stone-100 bg-stone-50/40">
              {tools.length === 0 ? (
                <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-stone-200 text-stone-400">
                  <p className="text-sm font-medium">{emptyLabel}</p>
                  <p className="text-xs text-stone-400 mt-1">
                    Tools can be assigned to this category in the Admin Dashboard.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {tools.map(tool => (
                    <ToolCard key={tool.id} tool={tool} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function DesignTools() {
  const [tools, setTools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Fold-out state for the two collapsible categories
  const [isMakingOpen, setIsMakingOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

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

  // Filter tools by category
  // Normal ones: category === 'normal' or undefined
  const normalTools = tools.filter(t => !t.category || t.category === 'normal');
  const makingTools = tools.filter(t => t.category === 'making');
  const advancedTools = tools.filter(t => t.category === 'advanced');

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-4xl font-bold tracking-tight text-stone-900">Design Tools</h1>
        <p className="text-stone-500 mt-2 text-lg">Create, experiment, and generate designs for your projects.</p>
      </header>

      {/* Main Content Area */}
      {tools.length === 0 ? (
        <div className="bg-stone-50 border-2 border-dashed border-stone-200 rounded-3xl p-12 text-center">
          <Box className="mx-auto text-stone-300 mb-4" size={48} />
          <h3 className="text-lg font-medium text-stone-900 mb-1">No tools available yet</h3>
          <p className="text-stone-500">Check back soon for new design tools!</p>
        </div>
      ) : (
        <div className="space-y-10">
          {/* Normal Design Tools - Shown how they are currently */}
          <section className="space-y-4">
            {normalTools.length === 0 ? (
              <div className="bg-stone-50 border border-stone-200 rounded-3xl p-8 text-center text-stone-500 text-sm">
                No standard design tools currently listed. Check the fold-out categories below!
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {normalTools.map((tool) => (
                  <ToolCard key={tool.id} tool={tool} />
                ))}
              </div>
            )}
          </section>

          {/* Two Fold-Out Categories */}
          <section className="space-y-4 pt-2">
            <div className="flex items-center justify-between pb-1">
              <h2 className="text-sm font-bold uppercase tracking-wider text-stone-400">
                Specialized Categories
              </h2>
            </div>

            <div className="space-y-4">
              {/* Category 1: Tools for Making */}
              <FoldOutSection
                id="tools-for-making"
                title="Tools for Making"
                description="CAM generators, slicing helpers, laser toolpaths, and fabrication utilities"
                icon={<Hammer size={22} />}
                badgeColor="bg-amber-100/70 text-amber-800 border border-amber-200/70"
                tools={makingTools}
                isOpen={isMakingOpen}
                onToggle={() => setIsMakingOpen(prev => !prev)}
                emptyLabel="No tools for making have been added yet."
              />

              {/* Category 2: Advanced Design Tools */}
              <FoldOutSection
                id="advanced-design-tools"
                title="Advanced Design Tools"
                description="Parametric modeling, algorithmic geometry, and high-precision CAD engines"
                icon={<Sparkles size={22} />}
                badgeColor="bg-purple-100/70 text-purple-800 border border-purple-200/70"
                tools={advancedTools}
                isOpen={isAdvancedOpen}
                onToggle={() => setIsAdvancedOpen(prev => !prev)}
                emptyLabel="No advanced design tools have been added yet."
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
