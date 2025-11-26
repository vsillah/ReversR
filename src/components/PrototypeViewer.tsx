import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ThreeDSceneDescriptor, SceneObject } from '../types';
import { FileBox, Printer } from 'lucide-react';

interface PrototypeViewerProps {
  sceneDescriptor: ThreeDSceneDescriptor;
  innovationName: string;
}

const PrototypeViewer: React.FC<PrototypeViewerProps> = ({ sceneDescriptor, innovationName }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sceneRef = useRef<unknown>(null);
  const cameraRef = useRef<unknown>(null);
  const groupRef = useRef<unknown>(null);
  const rendererRef = useRef<unknown>(null);

  const createMesh = useCallback((obj: SceneObject) => {
    const THREE = (window as unknown as { THREE: Record<string, unknown> }).THREE;
    if (!THREE) return null;

    let geometry: unknown;
    const ThreeMeshBasicMaterial = THREE.MeshBasicMaterial as new (params: unknown) => unknown;
    const ThreeMeshStandardMaterial = THREE.MeshStandardMaterial as new (params: unknown) => unknown;
    
    const material = obj.material === 'wireframe' 
      ? new ThreeMeshBasicMaterial({ color: obj.color, wireframe: true })
      : new ThreeMeshStandardMaterial({ color: obj.color, flatShading: true }); 

    const BoxGeometry = THREE.BoxGeometry as new (...args: number[]) => unknown;
    const SphereGeometry = THREE.SphereGeometry as new (...args: number[]) => unknown;
    const CylinderGeometry = THREE.CylinderGeometry as new (...args: number[]) => unknown;
    const PlaneGeometry = THREE.PlaneGeometry as new (...args: number[]) => unknown;

    switch (obj.type) {
      case 'box':
        geometry = new BoxGeometry(obj.args?.[0] || 1, obj.args?.[1] || 1, obj.args?.[2] || 1);
        break;
      case 'sphere':
        geometry = new SphereGeometry(obj.args?.[0] || 0.5, 16, 12);
        break;
      case 'cylinder':
        geometry = new CylinderGeometry(obj.args?.[0] || 0.5, obj.args?.[1] || 0.5, obj.args?.[2] || 1, 16);
        break;
      case 'plane':
        geometry = new PlaneGeometry(obj.args?.[0] || 1, obj.args?.[1] || 1);
        (material as { side: unknown }).side = THREE.DoubleSide;
        break;
      default:
        console.warn(`Unknown mesh type: ${obj.type}`);
        return null;
    }

    const ThreeMesh = THREE.Mesh as new (geometry: unknown, material: unknown) => {
      position: { set: (...args: number[]) => void };
      rotation: { set: (...args: number[]) => void };
      scale: { set: (...args: number[]) => void };
      name: string;
    };
    const mesh = new ThreeMesh(geometry, material);
    mesh.position.set(...obj.position);
    mesh.rotation.set(...obj.rotation);
    mesh.scale.set(...obj.scale);
    mesh.name = obj.name || obj.id;
    return mesh;
  }, []);

  const exportToObj = () => {
    const THREE = (window as unknown as { THREE: Record<string, unknown> }).THREE;
    if (!THREE || !groupRef.current) return;

    let output = `# ReversR Mutation Engine Export\n# Innovation: ${innovationName}\n`;
    let vertexOffset = 1;

    const group = groupRef.current as { children: unknown[] };
    group.children.forEach((mesh: unknown) => {
      const m = mesh as { isMesh?: boolean; name?: string; updateMatrix?: () => void; matrix?: unknown; geometry?: { attributes?: { position?: { array: number[] } }; index?: { array: number[] } | null } };
      if (!m.isMesh) return;
      
      output += `o ${m.name || 'Object'}\n`;
      
      m.updateMatrix?.(); 
      
      const geometry = m.geometry;
      const positions = geometry?.attributes?.position?.array;
      const indices = geometry?.index ? geometry.index.array : null;
      
      if (!positions) return;

      const Vector3 = THREE.Vector3 as new (...args: number[]) => { x: number; y: number; z: number; applyMatrix4: (matrix: unknown) => void };
      
      for (let i = 0; i < positions.length; i += 3) {
        const v = new Vector3(positions[i], positions[i+1], positions[i+2]);
        v.applyMatrix4(m.matrix); 
        output += `v ${v.x.toFixed(6)} ${v.y.toFixed(6)} ${v.z.toFixed(6)}\n`;
      }
      
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
    const THREE = (window as unknown as { THREE: Record<string, unknown> }).THREE;
    if (!THREE || !groupRef.current) return;

    let output = `solid ${innovationName.replace(/\s+/g, '_')}\n`;

    const group = groupRef.current as { children: unknown[] };
    group.children.forEach((mesh: unknown) => {
      const m = mesh as { isMesh?: boolean; updateMatrix?: () => void; matrix?: unknown; geometry?: { attributes?: { position?: { array: number[] } }; index?: { array: number[] } | null } };
      if (!m.isMesh) return;
      m.updateMatrix?.();
      
      const geometry = m.geometry;
      const positions = geometry?.attributes?.position?.array;
      const indices = geometry?.index ? geometry.index.array : null;
      
      if (!positions) return;

      const Vector3 = THREE.Vector3 as new (...args: number[]) => { x: number; y: number; z: number; applyMatrix4: (matrix: unknown) => void; subVectors: (a: unknown, b: unknown) => unknown; cross: (v: unknown) => { normalize: () => { x: number; y: number; z: number } } };
      
      const getVec = (idx: number) => {
          const v = new Vector3(positions[idx*3], positions[idx*3+1], positions[idx*3+2]);
          v.applyMatrix4(m.matrix);
          return v;
      };

      const processTriangle = (vA: { x: number; y: number; z: number }, vB: { x: number; y: number; z: number }, vC: { x: number; y: number; z: number }) => {
          const cb = new Vector3().subVectors(vC, vB) as { cross: (v: unknown) => { normalize: () => { x: number; y: number; z: number } } };
          const ab = new Vector3().subVectors(vA, vB);
          const normal = cb.cross(ab).normalize();
          
          if (isNaN(normal.x)) return;

          output += `facet normal ${normal.x.toFixed(6)} ${normal.y.toFixed(6)} ${normal.z.toFixed(6)}\n`;
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
    let intervalId: ReturnType<typeof setInterval>;
    let animationId: number;
    let domElement: HTMLCanvasElement | null = null;
    const currentMount = mountRef.current;

    let isDragging = false;
    let currentButton = -1;
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
            const group = groupRef.current as { rotation: { y: number; x: number } } | null;
            if (group) {
                group.rotation.y += toRadians(deltaX * 0.5);
                group.rotation.x += toRadians(deltaY * 0.5);
            }
        } else if (currentButton === 2) {
            const camera = cameraRef.current as { translateX: (x: number) => void; translateY: (y: number) => void } | null;
            if (camera) {
                const panSpeed = 0.01;
                camera.translateX(-deltaX * panSpeed);
                camera.translateY(deltaY * panSpeed);
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
        const camera = cameraRef.current as { translateZ: (z: number) => void; position: { length: () => number } } | null;
        if (camera) {
            const zoomSpeed = 0.005;
            camera.translateZ(event.deltaY * zoomSpeed);
            
            const distance = camera.position.length();
            if (distance < 1) camera.translateZ(-event.deltaY * zoomSpeed);
            if (distance > 20) camera.translateZ(-event.deltaY * zoomSpeed);
        }
    };

    const onContextMenu = (event: MouseEvent) => {
        event.preventDefault();
    };

    const initViewer = () => {
        const THREE = (window as unknown as { THREE: Record<string, new (...args: unknown[]) => unknown> }).THREE;
        if (!currentMount || !THREE) return;

        setLoading(true);
        setError(null);

        const width = currentMount.clientWidth;
        const height = currentMount.clientHeight;

        const Scene = THREE.Scene as new () => { background: unknown; add: (obj: unknown) => void };
        const scene = new Scene();
        sceneRef.current = scene;
        const Color = THREE.Color as new (color: number) => unknown;
        scene.background = new Color(0x0a0a0a);

        const PerspectiveCamera = THREE.PerspectiveCamera as new (fov: number, aspect: number, near: number, far: number) => { position: { set: (x: number, y: number, z: number) => void }; aspect: number; updateProjectionMatrix: () => void };
        const camera = new PerspectiveCamera(75, width / height, 0.1, 1000);
        camera.position.set(0, 1.5, 3);
        cameraRef.current = camera;

        const WebGLRenderer = THREE.WebGLRenderer as new (options: { antialias: boolean }) => { setSize: (w: number, h: number) => void; domElement: HTMLCanvasElement; render: (scene: unknown, camera: unknown) => void; dispose: () => void };
        const renderer = new WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        currentMount.appendChild(renderer.domElement);
        rendererRef.current = renderer;
        domElement = renderer.domElement;

        const AmbientLight = THREE.AmbientLight as new (color: number, intensity: number) => unknown;
        const ambientLight = new AmbientLight(0x404040, 2);
        scene.add(ambientLight);
        const DirectionalLight = THREE.DirectionalLight as new (color: number, intensity: number) => { position: { set: (x: number, y: number, z: number) => { normalize: () => void } } };
        const directionalLight = new DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 5, 5).normalize();
        scene.add(directionalLight);
        const PointLight = THREE.PointLight as new (color: number, intensity: number, distance: number) => { position: { set: (x: number, y: number, z: number) => void } };
        const pointLight = new PointLight(0xffffff, 0.8, 100);
        pointLight.position.set(-5, 5, -5);
        scene.add(pointLight);

        const GridHelper = THREE.GridHelper as new (size: number, divisions: number, color1: number, color2: number) => unknown;
        const gridHelper = new GridHelper(10, 10, 0x2a2a2a, 0x2a2a2a);
        scene.add(gridHelper);
        const AxesHelper = THREE.AxesHelper as new (size: number) => unknown;
        const axesHelper = new AxesHelper(1);
        scene.add(axesHelper);

        const Group = THREE.Group as new () => { add: (mesh: unknown) => void };
        const group = new Group();
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

        const animate = () => {
            animationId = requestAnimationFrame(animate);
            const r = rendererRef.current as { render: (scene: unknown, camera: unknown) => void } | null;
            if (r && sceneRef.current && cameraRef.current) {
                r.render(sceneRef.current, cameraRef.current);
            }
        };
        animate();

        setLoading(false);
    };

    const checkThreeAndInit = () => {
        if ((window as unknown as { THREE?: unknown }).THREE) {
            initViewer();
        } else {
            let attempts = 0;
            intervalId = setInterval(() => {
                attempts++;
                if ((window as unknown as { THREE?: unknown }).THREE) {
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
        const camera = cameraRef.current as { aspect: number; updateProjectionMatrix: () => void } | null;
        const renderer = rendererRef.current as { setSize: (w: number, h: number) => void } | null;
        if (currentMount && camera && renderer) {
            const width = currentMount.clientWidth;
            const height = currentMount.clientHeight;
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (animationId) cancelAnimationFrame(animationId);
      
      window.removeEventListener('mousemove', onMouseMove);
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

      const renderer = rendererRef.current as { dispose?: () => void } | null;
      if (renderer?.dispose) {
          renderer.dispose();
      }
      
      const scene = sceneRef.current as { traverse?: (callback: (obj: unknown) => void) => void } | null;
      if (scene?.traverse) {
          scene.traverse((object: unknown) => {
            const obj = object as { isMesh?: boolean; geometry?: { dispose: () => void }; material?: { dispose: () => void } | { dispose: () => void }[] };
            if (obj.isMesh) {
              obj.geometry?.dispose();
              if (Array.isArray(obj.material)) {
                obj.material.forEach((material) => material.dispose());
              } else {
                obj.material?.dispose();
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
