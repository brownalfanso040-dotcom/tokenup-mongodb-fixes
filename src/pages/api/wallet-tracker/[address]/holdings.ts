import { NextApiRequest, NextApiResponse } from 'next';
import { getWalletTrackerDb } from '@/lib/walletTrackerDb';
import { getWalletTracker } from '@/lib/walletTracker';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { method } = req;
    const { address } = req.query;

    if (!address || typeof address !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid wallet address' });
    }

    switch (method) {
      case 'GET':
        await handleGetHoldings(req, res, address);
        break;
      case 'POST':
        await handleRefreshHoldings(req, res, address);
        break;
      default:
        res.setHeader('Allow', ['GET', 'POST']);
        res.status(405).json({ error: `Method ${method} not allowed` });
    }
  } catch (error) {
    console.error('Holdings API error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleGetHoldings(req: NextApiRequest, res: NextApiResponse, address: string) {
  const { includeMetadata = 'true', sortBy = 'value', sortOrder = 'desc' } = req.query;

  try {
    const db = await getWalletTrackerDb();
    
    // Check if wallet exists
    const wallet = await db.getWallet(address);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Get holdings
    let holdings = await db.getWalletHoldings(address);

    // Sort holdings
    holdings.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'value':
          comparison = (a.usdValue || 0) - (b.usdValue || 0);
          break;
        case 'amount':
          comparison = a.amount - b.amount;
          break;
        case 'symbol':
          comparison = ((a as any).symbol || '').localeCompare(((b as any).symbol || ''));
          break;
        case 'updated':
          comparison = a.lastUpdated.getTime() - b.lastUpdated.getTime();
          break;
        default:
          comparison = 0;
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // Calculate summary
    const summary = {
      totalTokens: holdings.length,
      totalValue: holdings.reduce((sum, h) => sum + (h.usdValue || 0), 0),
      lastUpdated: holdings.length > 0 
        ? new Date(Math.max(...holdings.map(h => h.lastUpdated.getTime())))
        : null
    };

    // Include metadata if requested
    if (includeMetadata === 'true') {
      // Group by token type or other metadata
      const tokenTypes = holdings.reduce((acc, holding) => {
        const type = (holding as any).tokenType || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      (summary as any)['tokenTypes'] = tokenTypes;
    }

    res.status(200).json({
      holdings,
      summary,
      wallet: {
        address: wallet.address,
        name: wallet.name,
        isActive: wallet.isActive
      }
    });
  } catch (error) {
    console.error('Error fetching holdings:', error);
    res.status(500).json({ error: 'Failed to fetch holdings' });
  }
}

async function handleRefreshHoldings(req: NextApiRequest, res: NextApiResponse, address: string) {
  try {
    const db = await getWalletTrackerDb();
    
    // Check if wallet exists
    const wallet = await db.getWallet(address);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Refresh wallet data
    const walletTracker = getWalletTracker();
    await walletTracker.refreshWalletData(address);

    // Get updated holdings
    const holdings = await db.getWalletHoldings(address);
    
    const summary = {
      totalTokens: holdings.length,
      totalValue: holdings.reduce((sum, h) => sum + (h.usdValue || 0), 0),
      lastUpdated: new Date()
    };

    res.status(200).json({
      message: 'Holdings refreshed successfully',
      holdings,
      summary
    });
  } catch (error) {
    console.error('Error refreshing holdings:', error);
    res.status(500).json({ error: 'Failed to refresh holdings' });
  }
}