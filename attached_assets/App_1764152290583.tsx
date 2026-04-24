import React, { useState } from 'react';
import { MutationContext, AnalysisResult, InnovationResult, TechnicalSpec, ThreeDSceneDescriptor, SITPattern } from './types';
import PhaseOne from './components/PhaseOne';
import PhaseTwo from './components/PhaseTwo';
import PhaseThree from './components/PhaseThree';
import ContextViewer from './components/ContextViewer';
import { Cpu } from 'lucide-react';

function App() {
  const [context, setContext] = useState<MutationContext>({
    phase: 1,
    input: '',
    analysis: null,
    selectedPattern: null,
    innovation: null,
    spec: null,
    threeDScene: null,
    imageUrl: null,
    logs: []
  });
  const [isLoading, setIsLoading] = useState(false);

  // -- State Handlers --

  const handlePhaseOneComplete = (input: string, analysis: AnalysisResult) => {
    setContext(prev => ({
      ...prev,
      input,
      analysis,
      phase: 2,
      logs: [...prev.logs, `Phase 1 Complete: Analyzed ${input.substring(0, 20)}...`]
    }));
  };

  const handlePhaseTwoComplete = (innovation: InnovationResult) => {
    setContext(prev => ({
      ...prev,
      innovation,
      selectedPattern: innovation.patternUsed,
      phase: 3,
      logs: [...prev.logs, `Phase 2 Complete: Applied ${innovation.patternUsed}`]
    }));
  };

  const handlePhaseThreeComplete = (spec: TechnicalSpec, scene: ThreeDSceneDescriptor | null, imageUrl: string | null) => {
    setContext(prev => ({
        ...prev,
        spec,
        threeDScene: scene,
        imageUrl: imageUrl,
        logs: [...prev.logs, `Phase 3 Complete: Specs & Visuals generated.`]
    }));
  };

  const handleReset = () => {
    setContext({
        phase: 1,
        input: '',
        analysis: null,
        selectedPattern: null,
        innovation: null,
        spec: null,
        threeDScene: null,
        imageUrl: null,
        logs: []
    });
  };

  return (
    <div className="flex h-screen w-screen bg-mutation-dark overflow-hidden font-sans text-mutation-text">
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full relative">
        {/* Header */}
        <header className="h-16 border-b border-mutation-border flex items-center px-8 bg-mutation-panel/50 backdrop-blur-md z-10">
           <div className="flex items-center gap-3">
             <div className="bg-mutation-accent/20 p-2 rounded-lg">
                <Cpu className="text-mutation-accent" size={24} />
             </div>
             <div>
                <h1 className="font-mono font-bold text-lg tracking-wider text-white">REVERS<span className="text-mutation-accent">R</span></h1>
                <div className="text-[10px] text-mutation-dim uppercase tracking-[0.2em]">Systematic Inventive Thinking</div>
             </div>
           </div>
        </header>

        {/* Phase Container */}
        <main className="flex-1 overflow-y-auto p-8 relative">
           <div className="max-w-4xl mx-auto pb-20">
              
              {/* Progress Stepper */}
              <div className="flex items-center justify-between mb-12 px-4">
                 {[1, 2, 3].map((step) => (
                    <div key={step} className="flex flex-col items-center relative z-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-mono text-sm font-bold border-2 transition-all duration-300 ${
                            context.phase >= step 
                            ? (context.phase > step ? 'bg-green-500 border-green-500 text-black' : 'bg-mutation-accent border-mutation-accent text-black shadow-[0_0_20px_rgba(0,255,157,0.4)]')
                            : 'bg-black border-gray-800 text-gray-600'
                        }`}>
                            {step}
                        </div>
                        <span className={`mt-2 text-xs uppercase tracking-wider font-bold ${context.phase >= step ? 'text-white' : 'text-gray-700'}`}>
                            {step === 1 ? 'Scan' : step === 2 ? 'Mutate' : 'Architect'}
                        </span>
                    </div>
                 ))}
                 {/* Connecting Line */}
                 <div className="absolute top-5 left-0 w-full h-0.5 bg-gray-900 -z-10 transform translate-y-[-50%]"></div>
                 <div 
                    className="absolute top-5 left-0 h-0.5 bg-gradient-to-r from-blue-600 via-purple-600 to-green-600 -z-10 transform translate-y-[-50%] transition-all duration-700"
                    style={{ width: `${((context.phase - 1) / 2) * 100}%` }}
                 ></div>
              </div>

              {/* Dynamic Phase Render */}
              <div className="min-h-[400px]">
                {context.phase === 1 && (
                    <PhaseOne 
                        onComplete={handlePhaseOneComplete} 
                        isLoading={isLoading} 
                        setIsLoading={setIsLoading} 
                    />
                )}
                {context.phase === 2 && context.analysis && (
                    <PhaseTwo 
                        analysis={context.analysis} 
                        onComplete={handlePhaseTwoComplete}
                        isLoading={isLoading}
                        setIsLoading={setIsLoading}
                        onReset={handleReset}
                    />
                )}
                {context.phase === 3 && context.innovation && (
                    <PhaseThree
                        innovation={context.innovation}
                        onComplete={handlePhaseThreeComplete}
                        onReset={handleReset}
                        context={context}
                    />
                )}
              </div>

           </div>
        </main>
      </div>

      {/* Sidebar / Context Viewer */}
      <div className="w-80 hidden xl:block h-full shadow-2xl z-20">
         <ContextViewer context={context} />
      </div>

    </div>
  );
}

export default App;