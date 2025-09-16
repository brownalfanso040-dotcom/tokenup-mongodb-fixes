import { NextApiRequest, NextApiResponse } from 'next';
import { getWalletTracker } from '@/lib/walletTracker';
import { getWalletTrackerDb } from '@/lib/walletTrackerDb';
import { NetworkType } from '@/context/NetworkContext';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { method } = req;

    switch (method) {
      case 'GET':
        await handleGetWallets(req, res);
        break;
      case 'POST':
        await handleAddWallet(req, res);
        break;
      case 'PUT':
        await handleUpdateWallet(req, res);
        break;
      case 'DELETE':
        await handleDeleteWallet(req, res);
        break;
      default:
        res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
        res.status(405).json({ error: `Method ${method} not allowed` });
    }
  } catch (error) {
    console.error('Wallet tracker API error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleGetWallets(req: NextApiRequest, res: NextApiResponse) {
  const { 
    network, 
    active, 
    search, 
    tags, 
    limit = '100', 
    offset = '0' 
  } = req.query;

  try {
    const db = await getWalletTrackerDb();
    
    // Get all wallets first
    let wallets = await db.getAllWallets(network as NetworkType);

    // Apply filters
    if (active !== undefined) {
      const isActive = active === 'true';
      wallets = wallets.filter(w => w.isActive === isActive);
    }

    if (search && typeof search === 'string') {
      const searchLower = search.toLowerCase();
      wallets = wallets.filter(w => 
        w.address.toLowerCase().includes(searchLower) ||
        w.name?.toLowerCase().includes(searchLower) ||
        w.description?.toLowerCase().includes(searchLower) ||
        w.tags.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }

    if (tags && typeof tags === 'string') {
      const tagList = tags.split(',').map(t => t.trim());
      wallets = wallets.filter(w => 
        tagList.some(tag => w.tags.includes(tag))
      );
    }

    // Apply pagination
    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);
    const paginatedWallets = wallets.slice(offsetNum, offsetNum + limitNum);

    // Get additional data for each wallet
    const walletsWithData = await Promise.all(
      paginatedWallets.map(async (wallet) => {
        const [holdings, recentActivities] = await Promise.all([
          db.getWalletHoldings(wallet.address),
          db.getWalletActivities(wallet.address, 5)
        ]);

        const totalValue = holdings.reduce((sum, h) => sum + (h.usdValue || 0), 0);

        return {
          ...wallet,
          tokenCount: holdings.length,
          totalValue,
          recentActivities: recentActivities.length
        };
      })
    );

    res.status(200).json({
      wallets: walletsWithData,
      total: wallets.length,
      limit: limitNum,
      offset: offsetNum,
      hasMore: offsetNum + limitNum < wallets.length
    });
  } catch (error) {
    console.error('Error fetching wallets:', error);
    res.status(500).json({ error: 'Failed to fetch wallets' });
  }
}

async function handleAddWallet(req: NextApiRequest, res: NextApiResponse) {
  const { address, name, description, tags, network } = req.body;

  if (!address || !network) {
    return res.status(400).json({ 
      error: 'Missing required fields: address and network' 
    });
  }

  try {
    const walletTracker = getWalletTracker();
    
    // Check if wallet already exists
    const db = await getWalletTrackerDb();
    const existingWallet = await db.getWallet(address);
    
    if (existingWallet) {
      return res.status(409).json({ 
        error: 'Wallet already exists',
        wallet: existingWallet
      });
    }

    // Add the wallet
    const wallet = await walletTracker.addWallet(
      address,
      name,
      description,
      tags || []
    );

    res.status(201).json({ 
      message: 'Wallet added successfully',
      wallet 
    });
  } catch (error) {
    console.error('Error adding wallet:', error);
    res.status(500).json({ error: 'Failed to add wallet' });
  }
}

async function handleUpdateWallet(req: NextApiRequest, res: NextApiResponse) {
  const { address } = req.query;
  const { name, description, tags, isActive } = req.body;

  if (!address || typeof address !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid wallet address' });
  }

  try {
    const db = await getWalletTrackerDb();
    const wallet = await db.getWallet(address);

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Update wallet properties
    const updatedWallet = {
      ...wallet,
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(tags !== undefined && { tags }),
      ...(isActive !== undefined && { isActive }),
      lastUpdated: new Date()
    };

    await db.saveWallet(updatedWallet);

    // If monitoring status changed, update the tracker
    if (isActive !== undefined && isActive !== wallet.isActive) {
      const walletTracker = getWalletTracker();
      if (isActive) {
        await walletTracker.startMonitoring(address);
      } else {
        await walletTracker.stopMonitoring(address);
      }
    }

    res.status(200).json({ 
      message: 'Wallet updated successfully',
      wallet: updatedWallet 
    });
  } catch (error) {
    console.error('Error updating wallet:', error);
    res.status(500).json({ error: 'Failed to update wallet' });
  }
}

async function handleDeleteWallet(req: NextApiRequest, res: NextApiResponse) {
  const { address } = req.query;

  if (!address || typeof address !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid wallet address' });
  }

  try {
    const walletTracker = getWalletTracker();
    const success = await walletTracker.removeWallet(address);

    if (!success) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    res.status(200).json({ 
      message: 'Wallet deleted successfully',
      address 
    });
  } catch (error) {
    console.error('Error deleting wallet:', error);
    res.status(500).json({ error: 'Failed to delete wallet' });
  }
}