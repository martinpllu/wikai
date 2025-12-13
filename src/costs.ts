import * as fs from 'fs';
import * as path from 'path';
import { config } from './config.js';

export interface CostRecord {
  id: string;
  timestamp: string;
  model: string;
  tokensPrompt: number;
  tokensCompletion: number;
  nativeTokensPrompt: number;
  nativeTokensCompletion: number;
  totalCost: number;
  generationTime?: number;
  streamed: boolean;
  cacheDiscount?: number | null;
  // Context about what triggered this request
  action?: string;  // e.g., "generate", "edit", "comment", "reply"
  pageName?: string;  // The page this request was for
  promptExcerpt?: string;  // First ~50 chars of the user's input
}

export interface CostSummary {
  totalCost: number;
  totalRequests: number;
  totalTokensPrompt: number;
  totalTokensCompletion: number;
  recentRequests: CostRecord[];
}

const COSTS_FILE = 'costs.json';

function getCostsFilePath(): string {
  return path.join(config.configDir, COSTS_FILE);
}

export function loadCosts(): CostRecord[] {
  const filePath = getCostsFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading costs:', error);
  }
  return [];
}

export function saveCosts(costs: CostRecord[]): void {
  const filePath = getCostsFilePath();

  // Ensure config directory exists
  if (!fs.existsSync(config.configDir)) {
    fs.mkdirSync(config.configDir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(costs, null, 2));
}

export function addCostRecord(record: CostRecord): void {
  const costs = loadCosts();
  costs.push(record);
  saveCosts(costs);
}

export function getCostSummary(limit: number = 10): CostSummary {
  const costs = loadCosts();

  const totalCost = costs.reduce((sum, r) => sum + r.totalCost, 0);
  const totalTokensPrompt = costs.reduce((sum, r) => sum + r.nativeTokensPrompt, 0);
  const totalTokensCompletion = costs.reduce((sum, r) => sum + r.nativeTokensCompletion, 0);

  // Get most recent requests
  const recentRequests = costs.slice(-limit).reverse();

  return {
    totalCost,
    totalRequests: costs.length,
    totalTokensPrompt,
    totalTokensCompletion,
    recentRequests,
  };
}
