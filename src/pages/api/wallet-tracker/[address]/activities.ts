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
        await handleGetActivities(req, res, address);
        break;
      case 'POST':
        await handleRefreshActivities(req, res, address);
        break;
      default:
        res.setHeader('Allow', ['GET', 'POST']);
        res.status(405).json({ error: `Method ${method} not allowed` });
    }
  } catch (error) {
    console.error('Activities API error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleGetActivities(req: NextApiRequest, res: NextApiResponse, address: string) {
  const { 
    limit = '50', 
    offset = '0', 
    type, 
    startDate, 
    endDate,
    includeStats = 'false'
  } = req.query;

  try {
    const db = await getWalletTrackerDb();
    
    // Check if wallet exists
    const wallet = await db.getWallet(address);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);

    // Get activities
    let activities = await db.getWalletActivities(address, limitNum + offsetNum);

    // Apply filters
    if (type && typeof type === 'string') {
      activities = activities.filter(a => a.type === type);
    }

    if (startDate && typeof startDate === 'string') {
      const start = new Date(startDate);
      activities = activities.filter(a => a.timestamp >= start);
    }

    if (endDate && typeof endDate === 'string') {
      const end = new Date(endDate);
      activities = activities.filter(a => a.timestamp <= end);
    }

    // Apply pagination
    const paginatedActivities = activities.slice(offsetNum, offsetNum + limitNum);

    const response: any = {
      activities: paginatedActivities,
      total: activities.length,
      limit: limitNum,
      offset: offsetNum,
      hasMore: offsetNum + limitNum < activities.length,
      wallet: {
        address: wallet.address,
        name: wallet.name,
        isActive: wallet.isActive
      }
    };

    // Include statistics if requested
    if (includeStats === 'true') {
      const stats = {
        totalActivities: activities.length,
        activityTypes: activities.reduce((acc, activity) => {
          acc[activity.type] = (acc[activity.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        dateRange: activities.length > 0 ? {
          earliest: new Date(Math.min(...activities.map(a => a.timestamp.getTime()))),
          latest: new Date(Math.max(...activities.map(a => a.timestamp.getTime())))
        } : null,
        totalVolume: activities.reduce((sum, a) => sum + (a.amount || 0), 0)
      };

      response.stats = stats;
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
}

async function handleRefreshActivities(req: NextApiRequest, res: NextApiResponse, address: string) {
  try {
    const db = await getWalletTrackerDb();
    
    // Check if wallet exists
    const wallet = await db.getWallet(address);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Refresh wallet activities
    const walletTracker = getWalletTracker();
    await walletTracker.refreshWalletData(address);

    // Get updated activities
    const activities = await db.getWalletActivities(address, 50);
    
    const stats = {
      totalActivities: activities.length,
      lastActivity: activities.length > 0 ? activities[0].timestamp : null,
      refreshedAt: new Date()
    };

    res.status(200).json({
      message: 'Activities refreshed successfully',
      activities,
      stats
    });
  } catch (error) {
    console.error('Error refreshing activities:', error);
    res.status(500).json({ error: 'Failed to refresh activities' });
  }
}