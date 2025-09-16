import { NextApiRequest, NextApiResponse } from 'next';
import { getWalletTrackerDb } from '@/lib/walletTrackerDb';
import { NetworkType } from '@/context/NetworkContext';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { method } = req;

    switch (method) {
      case 'GET':
        await handleGetStats(req, res);
        break;
      default:
        res.setHeader('Allow', ['GET']);
        res.status(405).json({ error: `Method ${method} not allowed` });
    }
  } catch (error) {
    console.error('Stats API error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleGetStats(req: NextApiRequest, res: NextApiResponse) {
  const { 
    network, 
    walletAddress, 
    timeframe = '30d',
    includeTokens = 'false',
    includeActivities = 'false' 
  } = req.query;

  try {
    const db = await getWalletTrackerDb();

    // Get basic stats
    const basicStats = await db.getWalletStats(network as NetworkType);

    const response: any = {
      basic: basicStats,
      generatedAt: new Date()
    };

    // Get wallet-specific stats if address provided
    if (walletAddress && typeof walletAddress === 'string') {
      const wallet = await db.getWallet(walletAddress);
      if (!wallet) {
        return res.status(404).json({ error: 'Wallet not found' });
      }

      const [holdings, activities] = await Promise.all([
        db.getWalletHoldings(walletAddress),
        db.getWalletActivities(walletAddress, 1000)
      ]);

      const walletStats = {
        address: walletAddress,
        name: wallet.name,
        isActive: wallet.isActive,
        tokenCount: holdings.length,
        totalValue: holdings.reduce((sum, h) => sum + (h.usdValue || 0), 0),
        activityCount: activities.length,
        lastActivity: activities.length > 0 ? activities[0].timestamp : null,
        createdAt: wallet.createdAt,
        tags: wallet.tags
      };

      response.wallet = walletStats;

      // Include activity summary if requested
      if (includeActivities === 'true') {
        const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
        const activitySummary = await db.getWalletActivitySummary(walletAddress, days);
        response.wallet.activitySummary = activitySummary;
      }
    }

    // Get top tokens by wallet count if requested
    if (includeTokens === 'true') {
      const topTokens = await db.getTopTokensByWalletCount(10);
      response.topTokens = topTokens;
    }

    // Get network-wide analytics
    if (!walletAddress) {
      const [recentActivities, collectionStats] = await Promise.all([
        db.getRecentActivities(network as NetworkType, 10),
        db.getCollectionStats()
      ]);

      response.recentActivities = recentActivities;
      response.collectionStats = collectionStats;

      // Get activity trends
      const now = new Date();
      const timeRanges = {
        '24h': new Date(now.getTime() - 24 * 60 * 60 * 1000),
        '7d': new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        '30d': new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      };

      const activityTrends = {};
      for (const [period, startDate] of Object.entries(timeRanges)) {
        const activities = await db.getRecentActivities(network as NetworkType, 10000);
        const filteredActivities = activities.filter(a => a.timestamp >= startDate);
        
        (activityTrends as any)[period] = {
          total: filteredActivities.length,
          byType: filteredActivities.reduce((acc, activity) => {
            acc[activity.type] = (acc[activity.type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        };
      }

      response.activityTrends = activityTrends;

      // Get wallet distribution
      const allWallets = await db.getAllWallets(network as NetworkType);
      const walletDistribution = {
        total: allWallets.length,
        active: allWallets.filter(w => w.isActive).length,
        inactive: allWallets.filter(w => !w.isActive).length,
        byTags: allWallets.reduce((acc, wallet) => {
          wallet.tags.forEach(tag => {
            acc[tag] = (acc[tag] || 0) + 1;
          });
          return acc;
        }, {} as Record<string, number>)
      };

      response.walletDistribution = walletDistribution;

      // Get value distribution
      const allHoldings = await Promise.all(
        allWallets.map(w => db.getWalletHoldings(w.address))
      );

      const valueDistribution = allHoldings.flat().reduce((acc, holding) => {
        const value = holding.usdValue || 0;
        if (value === 0) acc.zero++;
        else if (value < 1) acc.micro++;
        else if (value < 100) acc.small++;
        else if (value < 10000) acc.medium++;
        else acc.large++;
        return acc;
      }, { zero: 0, micro: 0, small: 0, medium: 0, large: 0 });

      response.valueDistribution = valueDistribution;
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
}