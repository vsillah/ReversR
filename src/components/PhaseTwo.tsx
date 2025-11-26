import React, { useState } from 'react';
import { AnalysisResult, InnovationResult, SITPattern } from '../types';
import { applySITPattern } from '../services/geminiService';
import { Sliders, Sparkles, RefreshCw, Cloud, Info, ArrowRight } from 'lucide-react';

interface Props {
  analysis: AnalysisResult;
  onComplete: (innovation: InnovationResult) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  onReset: () => void;
}

const PATTERN_DETAILS: Record<SITPattern, { description: string; steps: string[] }> = {
    [SITPattern.SUBTRACTION]: {
        description: "Remove an essential component from the system.",
        steps: [
            "1. List the product's internal components.",
            "2. Identify an ESSENTIAL component (not just an accessory).",
            "3. Remove the component completely from the virtual product.",
            "4. Ask: 'What is the benefit of this new form?' or 'How can we replace the missing function using existing resources?'"
        ]
    },
    [SITPattern.TASK_UNIFICATION]: {
        description: "Assign a new task to an existing resource.",
        steps: [
            "1. List internal components and external (neighborhood) resources.",
            "2. Select a component or resource that is currently underutilized.",
            "3. Assign it a task usually performed by a different component.",
            "4. Visualize the unified product and identify the efficiency gain."
        ]
    },
    [SITPattern.MULTIPLICATION]: {
        description: "Copy a component but change a specific attribute.",
        steps: [
            "1. List the product's components.",
            "2. Select a component to multiply.",
            "3. Create a copy, but deliberately change one attribute (e.g., size, location, state) relative to the original.",
            "4. Determine the benefit of having this modified copy."
        ]
    },
    [SITPattern.DIVISION]: {
        description: "Divide the product or a component physically or functionally.",
        steps: [
            "1. Select the product or a major component.",
            "2. Apply a division technique: Functional (split by task), Physical (cut into pieces), or Preserving (smaller versions).",
            "3. Rearrange the parts in space or time.",
            "4. Visualize the new configuration and its utility."
        ]
    },
    [SITPattern.ATTRIBUTE_DEPENDENCY]: {
        description: "Create a correlation between two independent variables.",
        steps: [
            "1. List attributes of the product (e.g., color, speed) and the environment (e.g., temperature, user age).",
            "2. Identify two attributes that are currently independent.",
            "3. Create a dependency: 'Attribute A changes as Attribute B changes.'",
            "4. Visualize the dynamic behavior and identify the 'smart' benefit."
        ]
    }
};

const PhaseTwo: React.FC<Props> = ({ analysis, onComplete, isLoading, setIsLoading, onReset }) => {
  const [selectedPattern, setSelectedPattern] = useState<SITPattern>(SITPattern.SUBTRACTION);
  const [error, setError] = useState<string | null>(null);

  const handleApply = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await applySITPattern(analysis, selectedPattern);
      onComplete(result);
    } catch (e) {
      setError("Pattern application failed. Gemini might be overloaded.");
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const details = PATTERN_DETAILS[selectedPattern];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Sliders className="text-mutation-secondary" />
            Phase 2: Pattern Application
            </h2>
            <p className="text-mutation-dim">
            Force a change. Select a SIT pattern to mutate the Closed World.
            </p>
        </div>
        <button onClick={onReset} className="text-xs text-mutation-dim hover:text-white flex items-center gap-1 transition-colors">
            <RefreshCw size={12} /> Reset Analysis
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-mutation-panel border border-mutation-border rounded-lg p-6 flex flex-col gap-6">
            <div>
                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest mb-4">Closed World Components</h3>
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                    {analysis.components.map((c, i) => (
                        <div key={i} className="flex items-start justify-between bg-black/30 p-3 rounded border border-gray-800">
                            <div>
                                <div className="font-mono text-sm text-blue-300">{c.name}</div>
                                <div className="text-xs text-gray-500">{c.description}</div>
                            </div>
                            {c.isEssential && <span className="text-[10px] bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded uppercase">Essential</span>}
                        </div>
                    ))}
                </div>
            </div>

            {analysis.neighborhoodResources && analysis.neighborhoodResources.length > 0 && (
                <div>
                    <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Cloud size={14} /> Neighborhood Resources
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {analysis.neighborhoodResources.map((nr, i) => (
                            <span key={i} className="text-xs font-mono bg-mutation-dark border border-mutation-border px-3 py-1.5 rounded text-gray-400">
                                {nr}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>

        <div className="bg-mutation-panel border border-mutation-border rounded-lg p-6 flex flex-col h-full">
            <div className="space-y-4 flex-1">
                <label className="block text-sm font-medium text-gray-400">Select SIT Pattern</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.values(SITPattern).map((pattern) => (
                        <button
                            key={pattern}
                            onClick={() => setSelectedPattern(pattern)}
                            className={`text-left px-3 py-2 rounded-md border transition-all text-xs sm:text-sm ${
                                selectedPattern === pattern 
                                ? 'bg-mutation-secondary/20 border-mutation-secondary text-white shadow-[0_0_10px_rgba(157,0,255,0.2)]' 
                                : 'bg-black/40 border-gray-800 text-gray-400 hover:bg-gray-900 hover:border-gray-600'
                            }`}
                        >
                            <span className="font-mono">{pattern}</span>
                        </button>
                    ))}
                </div>

                <div className="mt-6 bg-black/20 border border-mutation-border rounded-lg p-4 space-y-3 animate-in fade-in duration-300">
                    <div className="flex items-center gap-2 text-mutation-secondary">
                        <Info size={16} />
                        <h3 className="font-bold font-mono text-sm">{selectedPattern} Breakdown</h3>
                    </div>
                    <p className="text-sm text-gray-300 italic">
                        "{details.description}"
                    </p>
                    <div className="space-y-2 mt-2">
                        {details.steps.map((step, idx) => (
                            <div key={idx} className="flex gap-2 text-xs text-mutation-dim">
                                <ArrowRight size={12} className="mt-0.5 flex-shrink-0" />
                                <span>{step}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-6 pt-6 border-t border-mutation-border">
                 {error && <div className="text-red-500 text-sm mb-4">{error}</div>}
                 <button
                    onClick={handleApply}
                    disabled={isLoading}
                    className="w-full relative px-8 py-3 font-semibold text-white transition-all duration-200 bg-mutation-secondary rounded-md hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(157,0,255,0.3)] hover:shadow-[0_0_25px_rgba(157,0,255,0.5)]"
                 >
                    {isLoading ? "Mutating..." : (
                        <span className="flex items-center justify-center gap-2">
                             Apply Mutation <Sparkles size={16} />
                        </span>
                    )}
                 </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default PhaseTwo;
