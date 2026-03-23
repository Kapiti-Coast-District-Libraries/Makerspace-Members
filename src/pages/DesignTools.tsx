import React from 'react';
import { Link } from 'react-router';
import { Box, ArrowRight } from 'lucide-react';

export function DesignTools() {
  const tools = [
    {
      id: 'sculpt',
      name: 'Virtual Clay Sculpting',
      description: 'A WebGL sculpting app to mold and shape virtual clay in 3D space.',
      icon: Box,
      path: '/design-tools/sculpt',
      color: 'bg-indigo-100 text-indigo-700',
    },
    // Future tools can be added here
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-4xl font-bold tracking-tight text-stone-900">Design Tools</h1>
        <p className="text-stone-500 mt-2 text-lg">Create, experiment, and generate designs for your projects.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.id}
              to={tool.path}
              className="block group bg-white p-6 rounded-3xl shadow-sm border border-stone-200 hover:shadow-md hover:border-stone-300 transition-all"
            >
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
                Open Tool <ArrowRight size={16} className="ml-1" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
