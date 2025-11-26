import React, { useState, useRef } from 'react';
import { AnalysisResult } from '../types';
import { analyzeProduct } from '../services/geminiService';
import { Layers, Zap, Sparkles, Camera, X, CheckCircle, RefreshCw } from 'lucide-react'; 

interface Props {
  onComplete: (input: string, analysis: AnalysisResult) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

const PRODUCT_PRESETS = [
    "A mechanical analog wristwatch. It features a leather strap, a stainless steel case, a winding crown, a crystal glass face, hour/minute/second hands, a dial with numerals, mainspring, gear train, escapement, and balance wheel.",
    "A smart coffee maker. It has a water reservoir, a filter basket, a heating element, a carafe, a control panel with buttons, and Wi-Fi connectivity for app control.",
    "A standard bicycle. It consists of a frame, two wheels, handlebars, pedals, a chain, gears, and brakes.",
    "A robotic vacuum cleaner. Features include a main body, side brushes, a main brush, a dustbin, a battery, various sensors (cliff, obstacle), and a charging dock.",
    "A portable Bluetooth speaker. Contains a speaker grille, drivers, a passive radiator, a battery, control buttons (power, volume), a charging port, and a rugged casing.",
    "A reusable water bottle. Composed of a cylindrical body made of stainless steel, a screw-top lid with a silicone seal, and a small carrying loop.",
    "An electric toothbrush. Includes a handle with battery and motor, a replaceable brush head with bristles, a charging base, and a pressure sensor.",
    "A consumer drone. Features four propellers, a camera on a gimbal, a battery, a remote controller, GPS module, and obstacle avoidance sensors.",
    "A DSLR camera. Comprises a body with sensor and mirror mechanism, a detachable lens, a viewfinder, an LCD screen, a shutter button, and a battery.",
    "A gaming mouse. Features high-DPI optical sensor, left/right buttons, scroll wheel, side buttons, RGB lighting, and a braided USB cable.",
];

const PhaseOne: React.FC<Props> = ({ onComplete, isLoading, setIsLoading }) => {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleAnalyze = async () => {
    if (!input.trim() && !capturedImage) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await analyzeProduct(input, capturedImage || undefined);
      onComplete(input, result);
    } catch (e) {
      setError("Analysis failed. Please try again.");
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadPreset = () => {
      const randomIndex = Math.floor(Math.random() * PRODUCT_PRESETS.length);
      setInput(PRODUCT_PRESETS[randomIndex]);
  };

  const startCamera = async (mode: 'user' | 'environment' = facingMode) => {
    try {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }

      setIsCameraOpen(true);
      setCapturedImage(null);
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: mode } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("Could not access camera. Please check permissions.");
      setIsCameraOpen(false);
    }
  };

  const toggleCamera = () => {
      const newMode = facingMode === 'user' ? 'environment' : 'user';
      setFacingMode(newMode);
      startCamera(newMode);
  };

  const captureImage = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const context = canvas.getContext('2d');
      if (context) {
        if (facingMode === 'user') {
            context.translate(canvas.width, 0);
            context.scale(-1, 1);
        }
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setCapturedImage(dataUrl);
        stopCamera();
      }
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
  };

  const clearCapturedImage = () => {
      setCapturedImage(null);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
          <Layers className="text-blue-500" />
          Phase 1: The Closed World Scan
        </h2>
        <p className="text-mutation-dim">
          Define the boundaries. Enter a product description or scan an object.
        </p>
      </div>

      <div className="bg-mutation-panel border border-mutation-border rounded-lg p-6 space-y-4">
        <div className="flex justify-between items-end">
            <label className="block text-sm font-medium text-gray-400">System Input</label>
            <div className="flex gap-3">
                <button 
                    onClick={handleLoadPreset}
                    disabled={isLoading || isCameraOpen}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors disabled:opacity-50"
                >
                    <Sparkles size={12} /> Feel Lucky
                </button>
                <button
                    onClick={() => startCamera()}
                    disabled={isLoading || isCameraOpen || !!capturedImage}
                    className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1 transition-colors disabled:opacity-50"
                >
                    <Camera size={12} /> Scan Object
                </button>
            </div>
        </div>
        
        <div className="relative">
            {isCameraOpen ? (
                <div className="w-full bg-black rounded-md overflow-hidden relative aspect-video border border-mutation-accent shadow-[0_0_15px_rgba(0,255,157,0.2)]">
                    <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} 
                    ></video>
                    
                    <div className="absolute top-4 right-4 z-20">
                        <button 
                            onClick={toggleCamera}
                            className="p-2 bg-black/50 text-white rounded-full hover:bg-black/70 backdrop-blur-sm transition-colors"
                            title="Switch Camera"
                        >
                            <RefreshCw size={20} />
                        </button>
                    </div>

                    <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4 z-20">
                        <button 
                            onClick={stopCamera}
                            className="px-4 py-2 bg-red-600/80 text-white rounded-full text-sm hover:bg-red-500 backdrop-blur-sm"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={captureImage}
                            className="px-6 py-2 bg-white/90 text-black font-bold rounded-full text-sm hover:bg-white backdrop-blur-sm"
                        >
                            Capture
                        </button>
                    </div>
                </div>
            ) : capturedImage ? (
                <div className="w-full bg-black/30 border border-mutation-border rounded-md p-4 flex items-start gap-4 relative group">
                    <img src={capturedImage} alt="Captured" className="w-32 h-32 object-cover rounded border border-gray-700" />
                    <div className="flex-1">
                        <div className="text-green-400 text-sm font-mono mb-2 flex items-center gap-2">
                            <CheckCircle size={14} /> Image Captured
                        </div>
                        <p className="text-xs text-gray-500">
                            The image will be analyzed along with any text you provide.
                        </p>
                    </div>
                    <button 
                        onClick={clearCapturedImage}
                        className="absolute top-2 right-2 p-1 bg-gray-800 rounded-full text-gray-400 hover:text-white hover:bg-red-900 transition-colors"
                        title="Remove Image"
                    >
                        <X size={14} />
                    </button>
                </div>
            ) : (
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="w-full bg-black/50 border border-mutation-border rounded-md p-4 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[120px] font-mono resize-none transition-all"
                    placeholder="e.g., A standard kitchen blender... (Or scan an object using the camera)"
                    disabled={isLoading}
                />
            )}
            <canvas ref={canvasRef} className="hidden"></canvas>
        </div>
        
        {error && <div className="text-red-500 text-sm">{error}</div>}

        <div className="flex justify-end">
          <button
            onClick={handleAnalyze}
            disabled={isLoading || (!input.trim() && !capturedImage)}
            className="group relative inline-flex items-center justify-center px-8 py-3 font-semibold text-white transition-all duration-200 bg-blue-600 font-sans rounded-md hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
               <span className="flex items-center gap-2">
                 <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                   <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                   <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                 </svg>
                 Scanning Closed World...
               </span>
            ) : (
                <span className="flex items-center gap-2">
                    Initiate Scan <Zap size={16} className="group-hover:text-yellow-300 transition-colors" />
                </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PhaseOne;
