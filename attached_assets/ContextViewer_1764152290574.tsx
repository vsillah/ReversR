import React from 'react';
import { MutationContext } from '../types';
import { generateContextMarkdown } from '../utils/contextMarkdown';
import { FileText } from 'lucide-react';

interface Props {
  context: MutationContext;
}

const ContextViewer: React.FC<Props> = ({ context }) => {
  const markdown = generateContextMarkdown(context);

  return (
    <div className="h-full flex flex-col bg-mutation-panel border-l border-mutation-border">
      <div className="p-4 border-b border-mutation-border bg-mutation-dark flex items-center justify-between">
        <h2 className="text-mutation-accent font-mono text-sm uppercase tracking-wider flex items-center gap-2">
          <FileText size={14} />
          Context.md
        </h2>
        <span className="text-[10px] text-mutation-dim">Operational Memory</span>
      </div>
      <div className="flex-1 overflow-y-auto bg-[#0a0a0a]">
        <div className="p-4">
            <pre className="font-mono text-[10px] leading-relaxed text-mutation-dim whitespace-pre-wrap font-medium">
                {markdown}
            </pre>
        </div>
      </div>
      <div className="p-2 bg-mutation-panel border-t border-mutation-border text-[10px] text-center text-gray-600 font-mono">
        <span className="inline-block w-2 h-2 rounded-full bg-green-500/50 animate-pulse mr-2"></span>
        Context Sync Active
      </div>
    </div>
  );
};

export default ContextViewer;