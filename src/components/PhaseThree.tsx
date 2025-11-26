import React, { useEffect, useState, useCallback } from 'react';
import { InnovationResult, TechnicalSpec, ThreeDSceneDescriptor } from '../types';
import { generateTechnicalSpec, generate3DScene, generate2DImage } from '../services/geminiService';
import { generateContextMarkdown } from '../utils/contextMarkdown';
import { Code, Terminal, CheckCircle, Download, Box, RefreshCw, Image as ImageIcon, FileJson } from 'lucide-react';
import { MutationContext } from '../types';
import PrototypeViewer from './PrototypeViewer';

interface Props {
  innovation: InnovationResult;
  onComplete: (spec: TechnicalSpec, scene: ThreeDSceneDescriptor | null, imageUrl: string | null) => void;
  onReset: () => void;
  context: MutationContext; 
}

const PhaseThree: React.FC<Props> = ({ innovation, onComplete, onReset, context }) => {
  const [spec, setSpec] = useState<TechnicalSpec | null>(null);
  const [threeDScene, setThreeDScene] = useState<ThreeDSceneDescriptor | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  
  const [status, setStatus] = useState<'generating_specs' | 'specs_ready' | 'generating_visual' | 'complete'>('generating_specs');
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  
  const [downloadedMd, setDownloadedMd] = useState(false);
  const [downloadedJson, setDownloadedJson] = useState(false);

  const formatError = (e: unknown) => {
      const err = e as { message?: string };
      const msg = err.message || "Unknown error occurred.";
      if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
          return "System is currently at capacity (Rate Limit). Please wait a few seconds and click Retry.";
      }
      return msg;
  };

  const fetchSpecs = useCallback(async () => {
    setError(null);
    setStatus('generating_specs');
    try {
      const result = await generateTechnicalSpec(innovation);
      setSpec(result);
      setStatus('specs_ready');
    } catch (err: unknown) {
      console.error("Error generating technical spec:", err);
      setError(formatError(err));
    }
  }, [innovation]);

  useEffect(() => {
    fetchSpecs();
  }, [fetchSpecs]);

  const handleGenerate2D = async () => {
    if (!spec) return;
    setStatus('generating_visual');
    setError(null);
    
    try {
      const base64Image = await generate2DImage(innovation);
      const url = `data:image/png;base64,${base64Image}`;
      setImageUrl(url);
      setStatus('complete');
      onComplete(spec, threeDScene, url); 
    } catch (err: unknown) {
      console.error("Error generating 2D image:", err);
      setError(formatError(err));
      setStatus('specs_ready'); 
    }
  };

  const handleGenerate3D = async () => {
    if (!spec) return;
    setStatus('generating_visual');
    setError(null);
    
    try {
      const sceneResult = await generate3DScene(innovation);
      setThreeDScene(sceneResult);
      setStatus('complete');
      onComplete(spec, sceneResult, imageUrl); 
    } catch (err: unknown) {
      console.error("Error generating 3D scene:", err);
      setError(formatError(err));
      setStatus('specs_ready'); 
    }
  };

  const handleExportMd = () => {
    if (!spec) return;
    const md = generateContextMarkdown({ ...context, spec, threeDScene, imageUrl });
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Context.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadedMd(true);
    setTimeout(() => setDownloadedMd(false), 3000);
  };

  const handleExportJson = () => {
    if (!spec) return;
    const jsonString = JSON.stringify(spec, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'specifications.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadedJson(true);
    setTimeout(() => setDownloadedJson(false), 3000);
  };

  if (status === 'generating_specs') {
    return (
        <div className="flex flex-col items-center justify-center h-64 space-y-4 animate-in fade-in duration-700">
            <div className="w-16 h-16 border-4 border-mutation-accent border-t-transparent rounded-full animate-spin"></div>
            <p className="text-mutation-accent font-mono animate-pulse">Consulting The Architect...</p>
        </div>
    );
  }

  if (error && !spec) {
      return (
        <div className="flex flex-col items-center justify-center h-64 space-y-4 animate-in fade-in">
            <div className="text-red-500 font-mono text-center p-4 border border-red-900/50 bg-red-900/10 rounded max-w-md">
                <p className="mb-2 font-bold">Connection Error</p>
                <p className="text-xs">{error}</p>
            </div>
            <button 
                onClick={fetchSpecs}
                className="flex items-center gap-2 px-6 py-2 bg-mutation-border hover:bg-white/10 text-white rounded transition-colors border border-gray-700"
            >
                <RefreshCw size={16} /> Retry Architect
            </button>
        </div>
      );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-500">
       <div className="flex items-center justify-between">
        <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <Code className="text-mutation-accent" />
                Phase 3: The Architect
            </h2>
            <p className="text-mutation-dim">
                Blueprint generated. Select visualization mode.
            </p>
        </div>
        <button onClick={onReset} className="text-sm border border-mutation-border hover:bg-white/5 px-4 py-2 rounded transition-colors text-white">
            Start New Session
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-gradient-to-r from-mutation-panel to-black border border-mutation-border rounded-lg p-6 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10">
                <Terminal size={100} />
             </div>
             <div className="relative z-10">
                <h3 className="text-mutation-accent font-mono text-lg mb-2">{innovation.conceptName}</h3>
                <p className="text-gray-300 max-w-2xl">{innovation.conceptDescription}</p>
                <div className="mt-4 flex gap-4">
                    <div className="flex items-center gap-2 bg-green-900/20 px-3 py-1 rounded border border-green-900/50">
                        <span className="text-xs text-green-500 uppercase">Benefit</span>
                        <span className="text-sm text-green-200">{innovation.marketBenefit}</span>
                    </div>
                </div>
             </div>
        </div>
        
        <div className="bg-black border border-mutation-border rounded-lg overflow-hidden">
            <div className="bg-mutation-panel p-2 border-b border-mutation-border flex items-center gap-1">
                <button 
                    onClick={() => !(status === 'generating_visual') && setViewMode('2d')}
                    disabled={status === 'generating_visual'}
                    className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-all ${viewMode === '2d' ? 'bg-mutation-accent/10 text-mutation-accent border border-mutation-accent/20' : 'text-gray-500 hover:text-gray-300 disabled:opacity-50'}`}
                >
                    <ImageIcon size={16} /> 2D Sketch
                </button>
                <button 
                    onClick={() => !(status === 'generating_visual') && setViewMode('3d')}
                    disabled={status === 'generating_visual'}
                    className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-all ${viewMode === '3d' ? 'bg-mutation-accent/10 text-mutation-accent border border-mutation-accent/20' : 'text-gray-500 hover:text-gray-300 disabled:opacity-50'}`}
                >
                    <Box size={16} /> 3D Wireframe
                </button>
            </div>

            <div className="min-h-[400px] flex flex-col items-center justify-center relative">
                {status === 'generating_visual' ? (
                    <div className="flex flex-col items-center justify-center space-y-4 animate-in fade-in duration-300">
                        <div className="w-12 h-12 border-4 border-t-transparent border-mutation-accent rounded-full animate-spin shadow-[0_0_20px_rgba(0,255,157,0.2)]"></div>
                        <div className="text-center">
                            <p className="text-mutation-accent font-mono animate-pulse text-sm tracking-wider">
                                Generating {viewMode === '2d' ? 'Concept Sketch' : '3D Schematic'}...
                            </p>
                            <p className="text-xs text-mutation-dim mt-2">This may take a moment</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {viewMode === '2d' ? (
                            imageUrl ? (
                                <img src={imageUrl} alt="Concept Sketch" className="w-full h-full object-contain max-h-[500px] animate-in fade-in duration-500" />
                            ) : (
                                <div className="text-center space-y-4 animate-in zoom-in-95 duration-300">
                                    <div className="bg-mutation-panel/50 p-6 rounded-full inline-block border border-mutation-border">
                                        <ImageIcon size={48} className="text-gray-600" />
                                    </div>
                                    <p className="text-gray-400 font-mono text-sm">Generate a high-speed 2D concept sketch.</p>
                                    <button 
                                        onClick={handleGenerate2D}
                                        className="group relative px-6 py-2 bg-mutation-accent text-black font-bold rounded hover:bg-green-400 transition-colors overflow-hidden"
                                    >
                                        <span className="relative z-10">Generate Sketch</span>
                                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                                    </button>
                                </div>
                            )
                        ) : (
                            threeDScene ? (
                                <div className="w-full h-[400px] animate-in fade-in duration-500">
                                    <PrototypeViewer sceneDescriptor={threeDScene} innovationName={innovation.conceptName} />
                                </div>
                            ) : (
                                <div className="text-center space-y-4 animate-in zoom-in-95 duration-300">
                                    <div className="bg-mutation-panel/50 p-6 rounded-full inline-block border border-mutation-border">
                                        <Box size={48} className="text-gray-600" />
                                    </div>
                                    <p className="text-gray-400 font-mono text-sm">Generate an interactive 3D wireframe schematic.</p>
                                    <button 
                                        onClick={handleGenerate3D}
                                        className="group relative px-6 py-2 bg-mutation-accent text-black font-bold rounded hover:bg-green-400 transition-colors overflow-hidden"
                                    >
                                        <span className="relative z-10">Generate 3D Model</span>
                                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                                    </button>
                                </div>
                            )
                        )}
                        {error && (
                            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-red-900/90 border border-red-500/50 text-red-200 px-4 py-2 rounded text-xs font-mono backdrop-blur-sm animate-in slide-in-from-bottom-2">
                                {error}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>

        {spec && (
          <div className="bg-black border border-mutation-border rounded-lg overflow-hidden">
              <div className="bg-mutation-panel p-3 border-b border-mutation-border flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="ml-2 font-mono text-xs text-gray-500">specifications.json</span>
              </div>
              <div className="p-6 font-mono text-sm space-y-6">
                  
                  <div>
                      <h4 className="text-gray-500 uppercase tracking-widest text-xs mb-2 select-none">Prompt Logic</h4>
                      <div className="text-blue-300 bg-blue-900/10 p-4 rounded border border-blue-900/30 whitespace-pre-wrap">
                          {spec.promptLogic}
                      </div>
                  </div>

                  <div>
                      <h4 className="text-gray-500 uppercase tracking-widest text-xs mb-2 select-none">Component Structure</h4>
                      <div className="text-purple-300 bg-purple-900/10 p-4 rounded border border-purple-900/30 whitespace-pre-wrap">
                          {spec.componentStructure}
                      </div>
                  </div>

                  <div>
                      <h4 className="text-gray-500 uppercase tracking-widest text-xs mb-2 select-none">Implementation Notes</h4>
                      <div className="text-orange-300 bg-orange-900/10 p-4 rounded border border-orange-900/30">
                          {spec.implementationNotes}
                      </div>
                  </div>

              </div>
              <div className="bg-mutation-panel p-4 border-t border-mutation-border flex justify-end gap-3">
                  <button 
                    onClick={handleExportJson}
                    className={`flex items-center gap-2 px-4 py-2 rounded font-medium text-sm transition-all ${downloadedJson ? 'bg-green-600 text-white' : 'bg-mutation-border text-mutation-accent hover:bg-white/10'}`}
                  >
                      {downloadedJson ? <CheckCircle size={16} /> : <FileJson size={16} />} 
                      {downloadedJson ? 'Exported' : 'Export Specs (.json)'}
                  </button>
                  <button 
                    onClick={handleExportMd}
                    className={`flex items-center gap-2 px-4 py-2 rounded font-medium text-sm transition-all ${downloadedMd ? 'bg-green-600 text-white' : 'bg-mutation-border text-mutation-accent hover:bg-white/10'}`}
                  >
                      {downloadedMd ? <CheckCircle size={16} /> : <Download size={16} />} 
                      {downloadedMd ? 'Downloaded' : 'Download Context.md'}
                  </button>
              </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PhaseThree;
