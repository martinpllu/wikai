// Cost tracker - logs API costs to console

interface CostRequest {
  totalCost: number;
  action?: string;
  pageName?: string;
}

interface CostData {
  totalRequests: number;
  recentRequests: CostRequest[];
}

let previousRequestCount = 0;

function formatCost(cost: number): string {
  return '$' + cost.toFixed(4);
}

function fetchLatestCost(): void {
  fetch('/_api/costs?limit=1')
    .then(r => r.json())
    .then((data: CostData) => {
      if (data.totalRequests > previousRequestCount && data.recentRequests.length > 0) {
        const req = data.recentRequests[0];
        console.log(
          '%c API Cost: ' + formatCost(req.totalCost) + ' %c ' + (req.action || 'request') + ' | ' + (req.pageName || ''),
          'background: #4a5; color: white; padding: 2px 6px; border-radius: 3px;',
          'color: #666;'
        );
        previousRequestCount = data.totalRequests;
      }
    })
    .catch(() => {});
}

export function initCostTracker(): void {
  window.setCostLoading = (loading: boolean) => {
    if (!loading) {
      // Fetch cost after request completes (delay for OpenRouter to record it)
      setTimeout(fetchLatestCost, 1500);
    }
  };

  // Initialize previous request count
  fetch('/_api/costs?limit=1')
    .then(r => r.json())
    .then((data: CostData) => { previousRequestCount = data.totalRequests; })
    .catch(() => {});
}
