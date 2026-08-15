export const WORKFLOW_STEPS = [
  'optimize',
  'perspectives',
  'compare',
  'variables',
  'launch',
];

export const DEFAULT_WORKFLOWS = [
  {
    id: 'content-polish',
    name: 'Content Polish',
    description: 'Optimize an idea, compare approaches, then copy the winner.',
    category: 'writing',
    steps: ['optimize', 'perspectives', 'compare'],
  },
  {
    id: 'image-creator',
    name: 'Image Creator',
    description: 'Build a reusable image prompt with perspectives and launch it.',
    category: 'image',
    steps: ['optimize', 'perspectives', 'compare', 'launch'],
  },
];

export const getWorkflowById = (workflowId) =>
  DEFAULT_WORKFLOWS.find((workflow) => workflow.id === workflowId) || null;
