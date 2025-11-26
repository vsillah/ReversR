import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ThreeDSceneDescriptor, SceneObject } from '../types';
import { Download, Box, Printer, FileBox } from 'lucide-react';

interface PrototypeViewerProps {
  sceneDescriptor: ThreeDSceneDescriptor;
  innovationName: string;
}

const PrototypeViewer: React.FC<PrototypeViewerProps> = ({ sceneDescriptor, innovationName }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs for Three.js objects to access them inside event handlers without re-renders
  const sceneRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const groupRef = useRef<any>(null);
  const rendererRef = useRef<any>(null);

  const createMesh = useCallback((obj: SceneObject) => {
    const THREE = (window as any).THREE;
    if (!THREE) return null;

    let geometry: any;
    const material = obj.material === 'wireframe' 
      ? new THREE.MeshBasicMaterial({ color: obj.color, wireframe: true })
      : new THREE.MeshStandardMaterial({ color: obj.color, flatShading: true }); 

    // Reduced polygon count for performance and "schematic" look
    switch (obj.type) {
      case 'box':
        geometry = new THREE.BoxGeometry(obj.args?.[0] || 1, obj.args?.[1] || 1, obj.args?.[2] || 1);
        break;
      case 'sphere':
        geometry = new THREE.SphereGeometry(obj.args?.[0] || 0.5, 16, 12); // Low poly
        break;
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(obj.args?.[0] || 0.5, obj.args?.[1] || 0.5, obj.args?.[2] || 1, 16); // Low poly
        break;
      case 'plane':
        geometry = new THREE.PlaneGeometry(obj.args?.[0] || 1, obj.args?.[1] || 1);
        material.side = THREE.DoubleSide;
        break;
      default:
        console.warn(`Unknown mesh type: ${obj.type}`);
        return null;
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...obj.position);
    mesh.rotation.set(...obj.rotation);
    mesh.scale.set(...obj.scale);
    mesh.name = obj.name || obj.id;
    return mesh;
  }, []);

  const exportToObj = () => {
    const THREE = (window as any).THREE;
    if (!THREE || !groupRef.current) return;

    let output = `# ReversR Mutation Engine Export\n# Innovation: ${innovationName}\n`;
    let vertexOffset = 1;

    groupRef.current.children.forEach((mesh: any) => {
      if (!mesh.isMesh) return;
      
      output += `o ${mesh.name || 'Object'}\n`;
      
      mesh.updateMatrix(); 
      
      const geometry = mesh.geometry;
      const positions = geometry.attributes.position.array;
      const indices = geometry.index ? geometry.index.array : null;
      
      // Transform vertices to 'world' space (relative to the group center, ignoring user view rotation)
      for (let i = 0; i < positions.length; i += 3) {
        const v = new THREE.Vector3(positions[i], positions[i+1], positions[i+2]);
        v.applyMatrix4(mesh.matrix); 
        output += `v ${v.x.toFixed(6)} ${v.y.toFixed(6)} ${v.z.toFixed(6)}\n`;
      }
      
      // Faces
      if (indices) {
        for (let i = 0; i < indices.length; i += 3) {
          output += `f ${indices[i] + vertexOffset} ${indices[i+1] + vertexOffset} ${indices[i+2] + vertexOffset}\n`;
        }
        vertexOffset += positions.length / 3;
      } else {
          const vertexCount = positions.length / 3;
          for (let i = 0; i < vertexCount; i += 3) {
               output += `f ${i + vertexOffset} ${i + 1 + vertexOffset} ${i + 2 + vertexOffset}\n`;
          }
          vertexOffset += vertexCount;
      }
    });

    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${innovationName.replace(/\s+/g, '_')}.obj`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportToStl = () => {
    const THREE = (window as any).THREE;
    if (!THREE || !groupRef.current) return;

    let output = `solid ${innovationName.replace(/\s+/g, '_')}\n`;

    groupRef.current.children.forEach((mesh: any) => {
      if (!mesh.isMesh) return;
      mesh.updateMatrix();
      
      const geometry = mesh.geometry;
      const positions = geometry.attributes.position.array;
      const indices = geometry.index ? geometry.index.array : null;
      
      // Helper to get transformed vector
      const getVec = (idx: number) => {
          const v = new THREE.Vector3(positions[idx*3], positions[idx*3+1], positions[idx*3+2]);
          v.applyMatrix4(mesh.matrix);
          return v;
      };

      const processTriangle = (vA: any, vB: any, vC: any) => {
          // Compute normal using cross product
          const cb = new THREE.Vector3().subVectors(vC, vB);
          const ab = new THREE.Vector3().subVectors(vA, vB);
          cb.cross(ab).normalize();
          
          if (isNaN(cb.x)) return; // Handle degenerate triangles

          output += `facet normal ${cb.x.toFixed(6)} ${cb.y.toFixed(6)} ${cb.z.toFixed(6)}\n`;
          output += `  outer loop\n`;
          output += `    vertex ${vA.x.toFixed(6)} ${vA.y.toFixed(6)} ${vA.z.toFixed(6)}\n`;
          output += `    vertex ${vB.x.toFixed(6)} ${vB.y.toFixed(6)} ${vB.z.toFixed(6)}\n`;
          output += `    vertex ${vC.x.toFixed(6)} ${vC.y.toFixed(6)} ${vC.z.toFixed(6)}\n`;
          output += `  endloop\n`;
          output += `endfacet\n`;
      };

      if (indices) {
          for (let i = 0; i < indices.length; i += 3) {
              processTriangle(getVec(indices[i]), getVec(indices[i+1]), getVec(indices[i+2]));
          }
      } else {
          const vertexCount = positions.length / 3;
          for (let i = 0; i < vertexCount; i += 3) {
              processTriangle(getVec(i), getVec(i+1), getVec(i+2));
          }
      }
    });

    output += `endsolid ${innovationName.replace(/\s+/g, '_')}\n`;

    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${innovationName.replace(/\s+/g, '_')}.stl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    let intervalId: any;
    let timeoutId: any;
    let animationId: number;
    let domElement: any;
    const currentMount = mountRef.current;

    // --- Interaction Logic State ---
    let isDragging = false;
    let currentButton = -1; // 0: Left, 2: Right
    let previousMousePosition = { x: 0, y: 0 };

    const toRadians = (angle: number) => angle * (Math.PI / 180);

    const onMouseDown = (event: MouseEvent) => {
        isDragging = true;
        currentButton = event.button;
        previousMousePosition = { x: event.clientX, y: event.clientY };
    };

    const onMouseMove = (event: MouseEvent) => {
        if (!isDragging) return;

        const deltaX = event.clientX - previousMousePosition.x;
        const deltaY = event.clientY - previousMousePosition.y;

        if (currentButton === 0) {
            // Left Click: Rotate Object Group
            if (groupRef.current) {
                groupRef.current.rotation.y += toRadians(deltaX * 0.5);
                groupRef.current.rotation.x += toRadians(deltaY * 0.5);
            }
        } else if (currentButton === 2) {
            // Right Click: Pan Camera
            if (cameraRef.current) {
                const panSpeed = 0.01;
                cameraRef.current.translateX(-deltaX * panSpeed);
                cameraRef.current.translateY(deltaY * panSpeed);
            }
        }

        previousMousePosition = { x: event.clientX, y: event.clientY };
    };

    const onMouseUp = () => {
        isDragging = false;
        currentButton = -1;
    };

    const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        if (cameraRef.current) {
            const zoomSpeed = 0.005;
            cameraRef.current.translateZ(event.deltaY * zoomSpeed);
            
            const distance = cameraRef.current.position.length();
            if (distance < 1) cameraRef.current.translateZ(-event.deltaY * zoomSpeed);
            if (distance > 20) cameraRef.current.translateZ(-event.deltaY * zoomSpeed);
        }
    };

    const onContextMenu = (event: MouseEvent) => {
        event.preventDefault();
    };

    const initViewer = () => {
        const THREE = (window as any).THREE;
        if (!currentMount || !THREE) return;

        setLoading(true);
        setError(null);

        const width = currentMount.clientWidth;
        const height = currentMount.clientHeight;

        // Scene setup
        const scene = new THREE.Scene();
        sceneRef.current = scene;
        scene.background = new THREE.Color(0x0a0a0a);

        // Camera setup
        const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        camera.position.set(0, 1.5, 3);
        cameraRef.current = camera;

        // Renderer setup
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        currentMount.appendChild(renderer.domElement);
        rendererRef.current = renderer;
        domElement = renderer.domElement;

        // Lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 2);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 5, 5).normalize();
        scene.add(directionalLight);
        const pointLight = new THREE.PointLight(0xffffff, 0.8, 100);
        pointLight.position.set(-5, 5, -5);
        scene.add(pointLight);

        // Helpers
        const gridHelper = new THREE.GridHelper(10, 10, 0x2a2a2a, 0x2a2a2a);
        scene.add(gridHelper);
        const axesHelper = new THREE.AxesHelper(1);
        scene.add(axesHelper);

        // Object Group
        const group = new THREE.Group();
        groupRef.current = group;
        sceneDescriptor.objects.forEach(obj => {
            const mesh = createMesh(obj);
            if (mesh) group.add(mesh);
        });
        scene.add(group);

        domElement.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove); 
        window.addEventListener('mouseup', onMouseUp);
        domElement.addEventListener('wheel', onWheel, { passive: false });
        domElement.addEventListener('contextmenu', onContextMenu);

        // Animation Loop
        const animate = () => {
            animationId = requestAnimationFrame(animate);
            if (rendererRef.current && sceneRef.current && cameraRef.current) {
                rendererRef.current.render(sceneRef.current, cameraRef.current);
            }
        };
        animate();

        setLoading(false);
    };

    const checkThreeAndInit = () => {
        if ((window as any).THREE) {
            initViewer();
        } else {
            // Poll every 100ms for up to 5 seconds
            let attempts = 0;
            intervalId = setInterval(() => {
                attempts++;
                if ((window as any).THREE) {
                    clearInterval(intervalId);
                    initViewer();
                } else if (attempts > 50) {
                    clearInterval(intervalId);
                    setLoading(false);
                    setError("Three.js failed to load. Check connection.");
                }
            }, 100);
        }
    };

    checkThreeAndInit();

    const handleResize = () => {
        if (currentMount && cameraRef.current && rendererRef.current) {
            const width = currentMount.clientWidth;
            const height = currentMount.clientHeight;
            cameraRef.current.aspect = width / height;
            cameraRef.current.updateProjectionMatrix();
            rendererRef.current.setSize(width, height);
        }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
      if (animationId) cancelAnimationFrame(animationId);
      
      window.removeEventListener('mousemove', onMouseMove); // Clean up window listeners
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('resize', handleResize);

      if (domElement) {
        domElement.removeEventListener('mousedown', onMouseDown);
        domElement.removeEventListener('wheel', onWheel);
        domElement.removeEventListener('contextmenu', onContextMenu);
        if (currentMount && currentMount.contains(domElement)) {
          currentMount.removeChild(domElement);
        }
      }

      if (rendererRef.current) {
          rendererRef.current.dispose();
      }
      
      if (sceneRef.current) {
          sceneRef.current.traverse((object: any) => {
            if (object.isMesh) {
              object.geometry.dispose();
              if (Array.isArray(object.material)) {
                object.material.forEach((material: any) => material.dispose());
              } else {
                object.material.dispose();
              }
            }
          });
      }
    };
  }, [sceneDescriptor, createMesh]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-black/20 rounded-lg">
        <div className="w-12 h-12 border-4 border-t-transparent border-mutation-accent rounded-full animate-spin"></div>
        <p className="mt-4 text-mutation-accent font-mono text-sm">Initializing 3D Engine...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-red-900/20 text-red-400 rounded-lg p-4">
        <p className="font-mono text-sm">Error: {error}</p>
        <p className="font-mono text-xs mt-2">Please ensure 'webgl' permission is granted and refresh.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[400px] bg-black border border-mutation-border rounded-lg overflow-hidden cursor-move group">
      <div ref={mountRef} className="w-full h-full" />
      
      <div className="absolute top-4 left-4 text-mutation-accent text-lg font-bold font-mono bg-black/50 px-3 py-1 rounded pointer-events-none select-none">
        {innovationName}
      </div>

      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex gap-2">
        <button
          onClick={exportToObj}
          className="flex items-center gap-1 px-3 py-1.5 bg-mutation-panel hover:bg-gray-800 border border-mutation-border rounded text-xs font-mono text-mutation-dim hover:text-white transition-colors"
          title="Export Wavefront OBJ"
        >
          <FileBox size={14} />
          .OBJ
        </button>
        <button
          onClick={exportToStl}
          className="flex items-center gap-1 px-3 py-1.5 bg-mutation-panel hover:bg-gray-800 border border-mutation-border rounded text-xs font-mono text-mutation-dim hover:text-white transition-colors"
          title="Export Stereolithography STL (3D Printing)"
        >
          <Printer size={14} />
          .STL
        </button>
      </div>
      
      <div className="absolute bottom-4 right-4 flex flex-col items-end gap-1 pointer-events-none select-none">
        <div className="text-gray-400 text-[10px] font-mono bg-black/60 px-2 py-1 rounded border border-gray-800">
           Left Click: Rotate
        </div>
        <div className="text-gray-400 text-[10px] font-mono bg-black/60 px-2 py-1 rounded border border-gray-800">
           Right Click: Pan
        </div>
        <div className="text-gray-400 text-[10px] font-mono bg-black/60 px-2 py-1 rounded border border-gray-800">
           Scroll: Zoom
        </div>
      </div>
    </div>
  );
};

export default PrototypeViewer;