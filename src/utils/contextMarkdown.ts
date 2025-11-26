import { MutationContext } from '../types';

export const generateContextMarkdown = (context: MutationContext): string => {
  const { input, analysis, innovation, spec, selectedPattern, threeDScene, imageUrl } = context;

  let md = `# MUTATION SESSION LOG\n\n`;

  md += `## PHASE 1: ANALYSIS\n`;
  md += `**Input:** ${input || '(Pending input...)'}\n`;
  if (analysis) {
    md += `**Product:** ${analysis.productName}\n`;
    md += `**Closed World Boundary:** ${analysis.closedWorldBoundary}\n`;
    
    md += `**Components:**\n`;
    analysis.components.forEach(c => {
      md += `  - ${c.name}: ${c.description} ${c.isEssential ? '(Essential)' : ''}\n`;
    });

    if (analysis.neighborhoodResources && analysis.neighborhoodResources.length > 0) {
        md += `**Neighborhood Resources:**\n`;
        analysis.neighborhoodResources.forEach(nr => {
            md += `  - ${nr}\n`;
        });
    }

    md += `**Attributes:**\n`;
    analysis.attributes.forEach(a => {
      md += `  - ${a.name} (${a.type}): ${a.value}\n`;
    });
    md += `**Raw Analysis:** ${analysis.rawAnalysis}\n`;
  } else {
    md += `(Awaiting analysis results...)\n`;
  }
  md += `\n`;

  md += `## PHASE 2: PATTERN APPLICATION\n`;
  if (innovation) {
    md += `**Pattern Used:** ${innovation.patternUsed}\n`;
    md += `**Concept Name:** ${innovation.conceptName}\n`;
    md += `**Virtual Product Concept:** ${innovation.conceptDescription}\n`;
    md += `**Market Gap:** ${innovation.marketGap}\n`;
    md += `**Constraint:** ${innovation.constraint}\n`;
    md += `**Novelty Score:** ${innovation.noveltyScore}/10\n`;
    md += `**Viability Score:** ${innovation.viabilityScore}/10\n`;
    md += `**Market Benefit:** ${innovation.marketBenefit}\n`;
  } else {
    md += `**Selected Pattern:** ${selectedPattern || '(None selected)'}\n`;
    md += `(Awaiting mutation...)\n`;
  }
  md += `\n`;

  md += `## PHASE 3: THE ARCHITECT\n`;
  if (spec) {
    md += `**Prompt Logic:**\n\`\`\`\n${spec.promptLogic}\n\`\`\`\n`;
    md += `**Component Structure:**\n\`\`\`\n${spec.componentStructure}\n\`\`\`\n`;
    md += `**Implementation Notes:**\n${spec.implementationNotes}\n`;
  } else {
    md += `(Awaiting technical specifications...)\n`;
  }
  md += `\n`;

  md += `## VISUALIZATIONS\n`;
  if (imageUrl) {
      md += `**2D Sketch:** Generated (See application display)\n`;
  }
  if (threeDScene) {
    md += `**3D Prototype Scene Descriptor:**\n`;
    md += `\`\`\`json\n${JSON.stringify(threeDScene, null, 2)}\n\`\`\`\n`;
  } 
  if (!imageUrl && !threeDScene) {
    md += `(No visualizations generated yet)\n`;
  }

  return md;
};
