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
    "A VR headset. Includes a head-mounted display with lenses, internal screens, motion tracking cameras, built-in speakers, and hand controllers.",
    "An acoustic guitar. Consists of a wooden body with sound hole, a neck with frets, a headstock with tuning pegs, six strings, and a bridge.",
    "A hiking backpack. Features a main compartment, multiple zippered pockets, padded shoulder straps, a hip belt, a chest strap, and a hydration bladder sleeve.",
    "A compact umbrella. Composed of a collapsible canopy made of waterproof fabric, metal ribs, a telescopic shaft, a handle, and a release button.",
    "A desk lamp. Includes a weighted base, an adjustable arm, a lamp shade, an LED bulb, and a power switch.",
    "A toaster. Features two slots for bread, heating filaments, a lowering lever, a browning control dial, and a crumb tray.",
    "A microwave oven. Consists of a metal enclosure, a door with mesh screen, a magnetron, a turntable, a light, and a keypad control panel.",
    "A hair dryer. Includes a plastic housing, a heating coil, a fan motor, an intake grille, a nozzle, and switches for heat/speed.",
    "A running shoe. Composed of a rubber outsole, a foam midsole, a mesh upper, shoelaces, a tongue, and a heel counter.",
    "A yoga mat. A rectangular sheet made of PVC or rubber, with a textured non-slip surface and cushioning properties.",
    "A standard chess set. Includes a checkered board (64 squares) and 32 pieces (Kings, Queens, Rooks, Bishops, Knights, Pawns) in two colors.",
    "A fountain pen. Features a barrel, a grip section, a nib (metal tip), a feed, and an ink reservoir or cartridge.",
    "A Swiss Army Knife. A pocket knife with a main blade, scissors, screwdrivers, a can opener, a corkscrew, and tweezers, all folding into a red handle.",
    "A pair of binoculars. Consists of two optical telescopes mounted side-by-side, objective lenses, eyepieces, a focus wheel, and a diopter adjustment.",
    "A refracting telescope. Features a long tube, an objective lens at the front, an eyepiece at the back, a finder scope, and a tripod mount.",
    "An optical microscope. Includes an eyepiece, objective lenses on a nosepiece, a stage for slides, a light source, and focus knobs.",
    "A sewing machine. Composed of a needle, a presser foot, a bobbin mechanism, a feed dog, a motor, and a foot pedal.",
    "A 3D printer (FDM). Features a print bed, an extruder nozzle, stepper motors for X/Y/Z axes, a filament spool holder, and an LCD interface.",
    "A smart thermostat. Includes a digital display, temperature sensors, a control dial or touchscreen, a Wi-Fi module, and backplate wiring terminals.",
    "A fire extinguisher. Consists of a steel cylinder, a pressure gauge, a discharge hose/nozzle, a safety pin, and a squeeze lever.",
    "A first aid kit. A box containing bandages, antiseptic wipes, gauze, adhesive tape, scissors, tweezers, gloves, and pain relievers.",
    "A camping tent. Features a fabric canopy, a rainfly, flexible poles, stakes, guy lines, and zippered doors/windows.",
    "A sleeping bag. A zip-up insulated bag with a hood, synthetic or down filling, a water-resistant shell, and a compression sack.",
    "A fishing rod and reel. Includes a flexible fiberglass rod with guides, a handle, a reel seat, and a reel mechanism with line and drag control.",
    "A skateboard. Consists of a wooden deck with grip tape, two metal trucks, four urethane wheels, and bearings.",
    "A surfboard. A buoyant board with a foam core and fiberglass shell, a deck, rails, a tail, and fins on the bottom.",
    "A snowboard. A wide board with a P-tex base, metal edges, a top sheet, and binding inserts for boots.",
    "A motorcycle helmet. Features a hard outer shell, an impact-absorbing liner, comfort padding, a visor, vents, and a chin strap.",
    "A car tire. A rubber torus with a tread pattern, sidewalls, steel belts, bead wires, and an inner liner.",
    "A lead-acid car battery. A box containing lead plates, sulfuric acid electrolyte, six cells, positive and negative terminals, and a plastic casing.",
    "A solar panel. Consists of photovoltaic cells under glass, an aluminum frame, a backsheet, and a junction box with cables.",
    "A gasoline chainsaw. Features a two-stroke engine, a guide bar, a cutting chain, a pull starter, handles, and a safety brake.",
    "A push lawnmower. Includes a cutting deck, a rotating blade, an engine or motor, four wheels, and a push handle.",
    "A cordless power drill. Features a chuck, a torque selector, a trigger, a motor, a rechargeable battery pack, and a forward/reverse switch.",
    "A claw hammer. Consists of a steel head with a flat striking face and a curved claw, attached to a wooden or fiberglass handle.",
    "A tape measure. A retractable metal tape with markings, coiled inside a plastic case with a locking mechanism and a belt clip.",
    "A step ladder. An A-frame structure with steps, spreaders to lock legs, and rubber feet.",
    "A wheelbarrow. Features a single wheel at the front, a tray/tub for cargo, two legs, and two handles for lifting and pushing.",
    "A garden hose. A long flexible tube made of rubber/vinyl, with brass male and female couplings at the ends.",
    "A charcoal BBQ grill. Consists of a kettle or barrel body, a charcoal grate, a cooking grid, a lid with vents, and legs.",
    "A hard-shell suitcase. Features a polycarbonate shell, a telescoping handle, four spinner wheels, zippered compartments, and a TSA lock.",
    "A grand piano. A large musical instrument with keys, hammers, strings stretched on a metal frame, a wooden soundboard, and pedals.",
    "A ceiling fan. Consists of an electric motor, angled blades, a mounting bracket, a downrod, and often a light kit.",
    "A padlock. Features a solid metal body, a U-shaped shackle, a locking mechanism (tumbler/wafer), and a keyway or combination dials.",
    "A stethoscope. Includes ear tips, binaurals (metal tubes), flexible tubing, and a chest piece with a diaphragm and bell."
];

const PhaseOne: React.FC<Props> = ({ onComplete, isLoading, setIsLoading }) => {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // Camera States
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

  // Camera Logic
  const startCamera = async (mode: 'user' | 'environment' = facingMode) => {
    try {
      // Stop existing tracks if any to ensure clean switch
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }

      setIsCameraOpen(true);
      setCapturedImage(null); // Clear previous image
      
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
        // Flip horizontally if using front camera for mirror effect
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
        
        {/* Input Area with Camera Overlay */}
        <div className="relative">
            {isCameraOpen ? (
                <div className="w-full bg-black rounded-md overflow-hidden relative aspect-video border border-mutation-accent shadow-[0_0_15px_rgba(0,255,157,0.2)]">
                    <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} 
                    ></video>
                    
                    {/* Overlay Controls */}
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
            {/* Hidden canvas for capture */}
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