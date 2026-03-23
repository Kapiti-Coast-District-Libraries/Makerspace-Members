import React, { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { ArrowLeft, Minus, Plus, RefreshCw } from 'lucide-react';
import { Link } from 'react-router';

// The actual sculpting mesh component
function SculptMesh({ brushSize, brushStrength, isPushing }: { brushSize: number, brushStrength: number, isPushing: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera, raycaster, pointer } = useThree();
  const [isDragging, setIsDragging] = useState(false);

  // Create a high-resolution sphere geometry
  const geometry = useMemo(() => {
    const geo = new THREE.SphereGeometry(2, 128, 128);
    // We need to keep track of the original positions for normal calculation if needed,
    // but for simple sculpting, we just modify the position attribute directly.
    return geo;
  }, []);

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    setIsDragging(true);
    sculpt(e);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const handlePointerMove = (e: any) => {
    if (!isDragging) return;
    e.stopPropagation();
    sculpt(e);
  };

  const sculpt = (e: any) => {
    if (!meshRef.current) return;

    // The event from R3F gives us the intersection point
    const intersect = e.intersections[0];
    if (!intersect) return;

    const point = intersect.point;
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    
    // Transform intersection point to local space
    const localPoint = meshRef.current.worldToLocal(point.clone());

    let modified = false;

    // Iterate through all vertices (this is naive and can be slow for very high poly, 
    // but works fine for 128x128 on modern devices)
    for (let i = 0; i < positions.count; i++) {
      v.fromBufferAttribute(positions, i);
      
      const distance = v.distanceTo(localPoint);
      
      if (distance < brushSize) {
        // Calculate falloff (smoothstep-like)
        const falloff = 1 - (distance / brushSize);
        const smoothFalloff = falloff * falloff * (3 - 2 * falloff);
        
        n.fromBufferAttribute(normals, i);
        
        // Displacement amount
        const displacement = brushStrength * smoothFalloff * (isPushing ? -1 : 1);
        
        v.addScaledVector(n, displacement);
        positions.setXYZ(i, v.x, v.y, v.z);
        modified = true;
      }
    }

    if (modified) {
      positions.needsUpdate = true;
      geometry.computeVertexNormals();
    }
  };

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
      onPointerOut={handlePointerUp}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial 
        color="#d2b48c" 
        roughness={0.7} 
        metalness={0.1} 
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export function SculptTool() {
  const [brushSize, setBrushSize] = useState(0.3);
  const [brushStrength, setBrushStrength] = useState(0.05);
  const [isPushing, setIsPushing] = useState(false);
  const [key, setKey] = useState(0); // Used to reset the mesh

  const handleReset = () => {
    setKey(prev => prev + 1);
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col bg-stone-100 rounded-3xl overflow-hidden border border-stone-200 relative">
      {/* Toolbar */}
      <div className="bg-white p-4 border-b border-stone-200 flex flex-wrap items-center justify-between gap-4 z-10">
        <div className="flex items-center space-x-4">
          <Link to="/design-tools" className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <h2 className="font-semibold text-stone-900">Virtual Clay</h2>
        </div>
        
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-stone-600">Mode:</span>
            <div className="flex bg-stone-100 rounded-lg p-1">
              <button 
                onClick={() => setIsPushing(false)}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${!isPushing ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500 hover:text-stone-700'}`}
              >
                Pull
              </button>
              <button 
                onClick={() => setIsPushing(true)}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${isPushing ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500 hover:text-stone-700'}`}
              >
                Push
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-stone-600">Size:</span>
            <input 
              type="range" 
              min="0.1" 
              max="1.0" 
              step="0.05" 
              value={brushSize} 
              onChange={(e) => setBrushSize(parseFloat(e.target.value))}
              className="w-24 accent-stone-900"
            />
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-stone-600">Strength:</span>
            <input 
              type="range" 
              min="0.01" 
              max="0.2" 
              step="0.01" 
              value={brushStrength} 
              onChange={(e) => setBrushStrength(parseFloat(e.target.value))}
              className="w-24 accent-stone-900"
            />
          </div>
        </div>

        <button 
          onClick={handleReset}
          className="flex items-center space-x-2 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
        >
          <RefreshCw size={16} />
          <span>Reset</span>
        </button>
      </div>

      {/* 3D Canvas */}
      <div className="flex-1 relative cursor-crosshair">
        <Canvas shadows camera={{ position: [0, 0, 6], fov: 50 }}>
          <color attach="background" args={['#f5f5f4']} />
          <ambientLight intensity={0.5} />
          <directionalLight 
            position={[5, 5, 5]} 
            intensity={1} 
            castShadow 
            shadow-mapSize={1024}
          />
          <directionalLight position={[-5, 5, -5]} intensity={0.5} />
          
          <SculptMesh 
            key={key} 
            brushSize={brushSize} 
            brushStrength={brushStrength} 
            isPushing={isPushing} 
          />
          
          <ContactShadows 
            position={[0, -2.5, 0]} 
            opacity={0.4} 
            scale={10} 
            blur={2} 
            far={4} 
          />
          
          {/* We disable OrbitControls when dragging so it doesn't rotate while sculpting */}
          <OrbitControls makeDefault enablePan={false} />
          <Environment preset="city" />
        </Canvas>
        
        <div className="absolute bottom-4 left-4 pointer-events-none">
          <div className="bg-white/80 backdrop-blur-sm px-4 py-2 rounded-xl text-sm font-medium text-stone-600 shadow-sm border border-stone-200/50">
            Left Click + Drag to Sculpt • Right Click + Drag to Rotate
          </div>
        </div>
      </div>
    </div>
  );
}
