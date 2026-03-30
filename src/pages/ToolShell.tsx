import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ArrowLeft, Maximize2, Minimize2, ExternalLink, RefreshCw } from 'lucide-react';

export function ToolShell() {
  const { toolId } = useParams();
  const navigate = useNavigate();
  const [tool, setTool] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    async function fetchTool() {
      if (!toolId) return;
      try {
        const docRef = doc(db, 'design_tools', toolId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setTool({ id: docSnap.id, ...docSnap.data() });
        } else {
          navigate('/design-tools');
        }
      } catch (error) {
        console.error("Error fetching tool:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchTool();
  }, [toolId, navigate]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-stone-500">
        <RefreshCw className="animate-spin mb-4" size={32} />
        <p>Loading tool environment...</p>
      </div>
    );
  }

  if (!tool) return null;

  return (
    <div className={`flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-white' : 'h-[calc(100vh-12rem)]'}`}>
      {/* Tool Header */}
      <div className="flex items-center justify-between p-4 border-b border-stone-200 bg-white">
        <div className="flex items-center space-x-4">
          {!isFullscreen && (
            <Link 
              to="/design-tools" 
              className="p-2 hover:bg-stone-100 rounded-full transition-colors text-stone-500"
            >
              <ArrowLeft size={20} />
            </Link>
          )}
          <div>
            <h1 className="font-bold text-stone-900 leading-tight">{tool.name}</h1>
            <p className="text-xs text-stone-500">{tool.description}</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 hover:bg-stone-100 rounded-xl text-stone-500 transition-colors"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
          <a
            href={tool.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 hover:bg-stone-100 rounded-xl text-stone-500 transition-colors"
            title="Open in New Tab"
          >
            <ExternalLink size={20} />
          </a>
        </div>
      </div>

      {/* Tool Content (Iframe) */}
      <div className="flex-1 bg-stone-100 relative overflow-hidden">
        <iframe
          src={tool.url}
          className="w-full h-full border-none"
          title={tool.name}
          allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking"
          sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
        />
      </div>
    </div>
  );
}
