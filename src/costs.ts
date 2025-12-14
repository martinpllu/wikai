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
  prompt?: string;  // The full user-provided prompt
}

export interface CostSummary {
  totalCost: number;
  totalRequests: number;
  totalTokensPrompt: number;
  totalTokensCompletion: number;
  recentRequests: CostRecord[];
}

const REQUESTS_FILE = 'requests.jsonl';

function getRequestsFilePath(): string {
  return path.join(config.configDir, REQUESTS_FILE);
}

export function loadCosts(): CostRecord[] {
  const filePath = getRequestsFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const lines = data.trim().split('\n').filter(line => line.length > 0);
      return lines.map(line => JSON.parse(line));
    }
  } catch (error) {
    console.error('Error loading costs:', error);
  }
  return [];
}

export function addCostRecord(record: CostRecord): void {
  const filePath = getRequestsFilePath();

  // Ensure config directory exists
  if (!fs.existsSync(config.configDir)) {
    fs.mkdirSync(config.configDir, { recursive: true });
  }

  // Append a single line to the file
  fs.appendFileSync(filePath, JSON.stringify(record) + '\n');
}

export function getCostSummary(limit: number = 10): CostSummary {
  const filePath = getRequestsFilePath();

  let costs: CostRecord[] = [];
  let totalCost = 0;
  let totalRequests = 0;
  let totalTokensPrompt = 0;
  let totalTokensCompletion = 0;

  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const lines = data.trim().split('\n').filter(line => line.length > 0);

      for (const line of lines) {
        const record: CostRecord = JSON.parse(line);
        totalCost += record.totalCost;
        totalTokensPrompt += record.nativeTokensPrompt;
        totalTokensCompletion += record.nativeTokensCompletion;
        totalRequests++;
      }

      // Get last N records for recent requests
      const recentLines = lines.slice(-limit);
      costs = recentLines.map(line => JSON.parse(line)).reverse();
    }
  } catch (error) {
    console.error('Error loading cost summary:', error);
  }

  return {
    totalCost,
    totalRequests,
    totalTokensPrompt,
    totalTokensCompletion,
    recentRequests: costs,
  };
}
