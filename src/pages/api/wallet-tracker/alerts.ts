import { NextApiRequest, NextApiResponse } from 'next';
import { getWalletTrackerDb, WalletAlert } from '@/lib/walletTrackerDb';
import { NetworkType } from '@/context/NetworkContext';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { method } = req;

    switch (method) {
      case 'GET':
        await handleGetAlerts(req, res);
        break;
      case 'POST':
        await handleCreateAlert(req, res);
        break;
      case 'PUT':
        await handleUpdateAlert(req, res);
        break;
      case 'DELETE':
        await handleDeleteAlert(req, res);
        break;
      default:
        res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
        res.status(405).json({ error: `Method ${method} not allowed` });
    }
  } catch (error) {
    console.error('Alerts API error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleGetAlerts(req: NextApiRequest, res: NextApiResponse) {
  const { 
    walletAddress, 
    isRead, 
    severity, 
    type, 
    network,
    limit = '100', 
    offset = '0' 
  } = req.query;

  try {
    const db = await getWalletTrackerDb();
    
    // Get all alerts first
    let alerts = await db.getWalletAlerts(
      walletAddress as string,
      isRead === 'true' ? true : isRead === 'false' ? false : undefined,
      parseInt(limit as string, 10) + parseInt(offset as string, 10)
    );

    // Apply additional filters
    if (severity && typeof severity === 'string') {
      alerts = alerts.filter(a => a.severity === severity);
    }

    if (type && typeof type === 'string') {
      alerts = alerts.filter(a => a.type === type);
    }

    if (network && typeof network === 'string') {
      alerts = alerts.filter(a => a.network === network);
    }

    // Apply pagination
    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);
    const paginatedAlerts = alerts.slice(offsetNum, offsetNum + limitNum);

    // Get statistics
    const stats = {
      total: alerts.length,
      unread: alerts.filter(a => !a.isRead).length,
      bySeverity: alerts.reduce((acc, alert) => {
        acc[alert.severity] = (acc[alert.severity] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byType: alerts.reduce((acc, alert) => {
        acc[alert.type] = (acc[alert.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };

    res.status(200).json({
      alerts: paginatedAlerts,
      stats,
      pagination: {
        total: alerts.length,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + limitNum < alerts.length
      }
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
}

async function handleCreateAlert(req: NextApiRequest, res: NextApiResponse) {
  const { 
    walletAddress, 
    type, 
    title, 
    message, 
    severity = 'medium', 
    network,
    data 
  } = req.body;

  if (!walletAddress || !type || !title || !message || !network) {
    return res.status(400).json({ 
      error: 'Missing required fields: walletAddress, type, title, message, network' 
    });
  }

  try {
    const alert: WalletAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      walletAddress,
      type,
      title,
      message,
      severity,
      isRead: false,
      createdAt: new Date(),
      network: network as NetworkType,
      ...(data && { data })
    };

    const db = await getWalletTrackerDb();
    await db.saveWalletAlert(alert);

    res.status(201).json({ 
      message: 'Alert created successfully',
      alert 
    });
  } catch (error) {
    console.error('Error creating alert:', error);
    res.status(500).json({ error: 'Failed to create alert' });
  }
}

async function handleUpdateAlert(req: NextApiRequest, res: NextApiResponse) {
  const { alertId, isRead, severity } = req.body;

  if (!alertId) {
    return res.status(400).json({ error: 'Missing alert ID' });
  }

  try {
    const db = await getWalletTrackerDb();

    if (isRead !== undefined) {
      const success = await db.markAlertAsRead(alertId);
      if (!success) {
        return res.status(404).json({ error: 'Alert not found' });
      }
    }

    res.status(200).json({ 
      message: 'Alert updated successfully',
      alertId 
    });
  } catch (error) {
    console.error('Error updating alert:', error);
    res.status(500).json({ error: 'Failed to update alert' });
  }
}

async function handleDeleteAlert(req: NextApiRequest, res: NextApiResponse) {
  const { alertId } = req.query;

  if (!alertId || typeof alertId !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid alert ID' });
  }

  try {
    const db = await getWalletTrackerDb();
    const success = await db.deleteAlert(alertId);

    if (!success) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.status(200).json({ 
      message: 'Alert deleted successfully',
      alertId 
    });
  } catch (error) {
    console.error('Error deleting alert:', error);
    res.status(500).json({ error: 'Failed to delete alert' });
  }
}