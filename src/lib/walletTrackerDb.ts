import { MongoClient, Db, Collection } from 'mongodb';
import { TrackedWallet, WalletTokenHolding, WalletActivity, WalletSnapshot } from './walletTracker';
import { NetworkType } from '../context/NetworkContext';

// Database Collections Interface
export interface WalletTrackerCollections {
  trackedWallets: Collection<TrackedWallet>;
  walletHoldings: Collection<WalletTokenHolding>;
  walletActivities: Collection<WalletActivity>;
  walletSnapshots: Collection<WalletSnapshot>;
  walletAlerts: Collection<WalletAlert>;
}

export interface WalletAlert {
  id: string;
  walletAddress: string;
  type: 'balance_change' | 'new_token' | 'large_transaction' | 'suspicious_activity';
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  isRead: boolean;
  createdAt: Date;
  data?: any;
  network: NetworkType;
}

export class WalletTrackerDatabase {
  private client: MongoClient;
  private db: Db;
  private collections: WalletTrackerCollections;

  constructor(client: MongoClient, dbName: string = 'tokenup') {
    this.client = client;
    this.db = client.db(dbName);
    
    this.collections = {
      trackedWallets: this.db.collection<TrackedWallet>('tracked_wallets'),
      walletHoldings: this.db.collection<WalletTokenHolding>('wallet_holdings'),
      walletActivities: this.db.collection<WalletActivity>('wallet_activities'),
      walletSnapshots: this.db.collection<WalletSnapshot>('wallet_snapshots'),
      walletAlerts: this.db.collection<WalletAlert>('wallet_alerts')
    };
  }

  // Initialize database indexes for optimal performance
  public async initializeIndexes(): Promise<void> {
    try {
      // Tracked Wallets indexes
      await this.collections.trackedWallets.createIndex({ address: 1 }, { unique: true });
      await this.collections.trackedWallets.createIndex({ network: 1 });
      await this.collections.trackedWallets.createIndex({ isActive: 1 });
      await this.collections.trackedWallets.createIndex({ tags: 1 });
      await this.collections.trackedWallets.createIndex({ createdAt: -1 });

      // Wallet Holdings indexes
      await this.collections.walletHoldings.createIndex({ walletAddress: 1, mint: 1 }, { unique: true });
      await this.collections.walletHoldings.createIndex({ walletAddress: 1 });
      await this.collections.walletHoldings.createIndex({ mint: 1 });
      await this.collections.walletHoldings.createIndex({ lastUpdated: -1 });

      // Wallet Activities indexes
      await this.collections.walletActivities.createIndex({ walletAddress: 1, signature: 1 }, { unique: true });
      await this.collections.walletActivities.createIndex({ walletAddress: 1 });
      await this.collections.walletActivities.createIndex({ type: 1 });
      await this.collections.walletActivities.createIndex({ timestamp: -1 });
      await this.collections.walletActivities.createIndex({ network: 1 });

      // Wallet Snapshots indexes
      await this.collections.walletSnapshots.createIndex({ walletAddress: 1, timestamp: -1 });
      await this.collections.walletSnapshots.createIndex({ walletAddress: 1 });
      await this.collections.walletSnapshots.createIndex({ timestamp: -1 });
      await this.collections.walletSnapshots.createIndex({ network: 1 });

      // Wallet Alerts indexes
      await this.collections.walletAlerts.createIndex({ walletAddress: 1 });
      await this.collections.walletAlerts.createIndex({ type: 1 });
      await this.collections.walletAlerts.createIndex({ severity: 1 });
      await this.collections.walletAlerts.createIndex({ isRead: 1 });
      await this.collections.walletAlerts.createIndex({ createdAt: -1 });

      console.log('Wallet tracker database indexes initialized successfully');
    } catch (error) {
      console.error('Error initializing wallet tracker database indexes:', error);
      throw error;
    }
  }

  // Tracked Wallets Operations
  public async saveWallet(wallet: TrackedWallet): Promise<void> {
    await this.collections.trackedWallets.replaceOne(
      { address: wallet.address },
      wallet,
      { upsert: true }
    );
  }

  public async getWallet(address: string): Promise<TrackedWallet | null> {
    return await this.collections.trackedWallets.findOne({ address });
  }

  public async getAllWallets(network?: NetworkType): Promise<TrackedWallet[]> {
    const filter = network ? { network } : {};
    return await this.collections.trackedWallets.find(filter).sort({ createdAt: -1 }).toArray();
  }

  public async getActiveWallets(network?: NetworkType): Promise<TrackedWallet[]> {
    const filter = { isActive: true, ...(network ? { network } : {}) };
    return await this.collections.trackedWallets.find(filter).sort({ createdAt: -1 }).toArray();
  }

  public async deleteWallet(address: string): Promise<boolean> {
    const result = await this.collections.trackedWallets.deleteOne({ address });
    
    // Also delete related data
    await Promise.all([
      this.collections.walletHoldings.deleteMany({ walletAddress: address }),
      this.collections.walletActivities.deleteMany({ walletAddress: address }),
      this.collections.walletSnapshots.deleteMany({ walletAddress: address }),
      this.collections.walletAlerts.deleteMany({ walletAddress: address })
    ]);

    return result.deletedCount > 0;
  }

  public async searchWallets(query: string, network?: NetworkType): Promise<TrackedWallet[]> {
    const searchRegex = new RegExp(query, 'i');
    const filter = {
      $or: [
        { address: searchRegex },
        { name: searchRegex },
        { description: searchRegex },
        { tags: { $in: [searchRegex] } }
      ],
      ...(network ? { network } : {})
    };

    return await this.collections.trackedWallets.find(filter).sort({ createdAt: -1 }).toArray();
  }

  // Wallet Holdings Operations
  public async saveWalletHoldings(holdings: WalletTokenHolding[]): Promise<void> {
    if (holdings.length === 0) return;

    const operations = holdings.map(holding => ({
      replaceOne: {
        filter: { walletAddress: holding.walletAddress, mint: holding.mint },
        replacement: holding,
        upsert: true
      }
    }));

    await this.collections.walletHoldings.bulkWrite(operations);
  }

  public async getWalletHoldings(walletAddress: string): Promise<WalletTokenHolding[]> {
    return await this.collections.walletHoldings
      .find({ walletAddress })
      .sort({ lastUpdated: -1 })
      .toArray();
  }

  public async getWalletsByToken(mint: string): Promise<string[]> {
    const holdings = await this.collections.walletHoldings
      .find({ mint }, { projection: { walletAddress: 1 } })
      .toArray();
    
    return [...new Set(holdings.map(h => h.walletAddress))];
  }

  public async clearWalletHoldings(walletAddress: string): Promise<void> {
    await this.collections.walletHoldings.deleteMany({ walletAddress });
  }

  // Wallet Activities Operations
  public async saveWalletActivities(activities: WalletActivity[]): Promise<void> {
    if (activities.length === 0) return;

    const operations = activities.map(activity => ({
      replaceOne: {
        filter: { walletAddress: activity.walletAddress, signature: activity.signature },
        replacement: activity,
        upsert: true
      }
    }));

    await this.collections.walletActivities.bulkWrite(operations);
  }

  public async getWalletActivities(
    walletAddress: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<WalletActivity[]> {
    return await this.collections.walletActivities
      .find({ walletAddress })
      .sort({ timestamp: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();
  }

  public async getRecentActivities(
    network?: NetworkType,
    limit: number = 50
  ): Promise<WalletActivity[]> {
    const filter = network ? { network } : {};
    return await this.collections.walletActivities
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }

  public async getActivitiesByType(
    type: WalletActivity['type'],
    network?: NetworkType,
    limit: number = 100
  ): Promise<WalletActivity[]> {
    const filter = { type, ...(network ? { network } : {}) };
    return await this.collections.walletActivities
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }

  public async getLatestWalletActivity(walletAddress: string): Promise<WalletActivity | null> {
    return await this.collections.walletActivities
      .findOne({ walletAddress }, { sort: { timestamp: -1 } });
  }

  // Wallet Snapshots Operations
  public async saveWalletSnapshot(snapshot: WalletSnapshot): Promise<void> {
    await this.collections.walletSnapshots.insertOne(snapshot);
  }

  public async getWalletSnapshots(
    walletAddress: string,
    limit: number = 30
  ): Promise<WalletSnapshot[]> {
    return await this.collections.walletSnapshots
      .find({ walletAddress })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }

  public async getLatestSnapshot(walletAddress: string): Promise<WalletSnapshot | null> {
    return await this.collections.walletSnapshots
      .findOne({ walletAddress }, { sort: { timestamp: -1 } });
  }

  public async cleanupOldSnapshots(daysToKeep: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    await this.collections.walletSnapshots.deleteMany({
      timestamp: { $lt: cutoffDate }
    });
  }

  // Wallet Alerts Operations
  public async saveWalletAlert(alert: WalletAlert): Promise<void> {
    await this.collections.walletAlerts.insertOne(alert);
  }

  public async getWalletAlerts(
    walletAddress?: string,
    isRead?: boolean,
    limit: number = 100
  ): Promise<WalletAlert[]> {
    const filter: any = {};
    if (walletAddress) filter.walletAddress = walletAddress;
    if (typeof isRead === 'boolean') filter.isRead = isRead;

    return await this.collections.walletAlerts
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  public async markAlertAsRead(alertId: string): Promise<boolean> {
    const result = await this.collections.walletAlerts.updateOne(
      { id: alertId },
      { $set: { isRead: true } }
    );
    return result.modifiedCount > 0;
  }

  public async markAllAlertsAsRead(walletAddress?: string): Promise<number> {
    const filter = walletAddress ? { walletAddress, isRead: false } : { isRead: false };
    const result = await this.collections.walletAlerts.updateMany(
      filter,
      { $set: { isRead: true } }
    );
    return result.modifiedCount;
  }

  public async deleteAlert(alertId: string): Promise<boolean> {
    const result = await this.collections.walletAlerts.deleteOne({ id: alertId });
    return result.deletedCount > 0;
  }

  // Analytics and Statistics
  public async getWalletStats(network?: NetworkType): Promise<{
    totalWallets: number;
    activeWallets: number;
    totalActivities: number;
    totalAlerts: number;
    unreadAlerts: number;
  }> {
    const filter = network ? { network } : {};

    const [
      totalWallets,
      activeWallets,
      totalActivities,
      totalAlerts,
      unreadAlerts
    ] = await Promise.all([
      this.collections.trackedWallets.countDocuments(filter),
      this.collections.trackedWallets.countDocuments({ ...filter, isActive: true }),
      this.collections.walletActivities.countDocuments(filter),
      this.collections.walletAlerts.countDocuments(filter),
      this.collections.walletAlerts.countDocuments({ ...filter, isRead: false })
    ]);

    return {
      totalWallets,
      activeWallets,
      totalActivities,
      totalAlerts,
      unreadAlerts
    };
  }

  public async getTopTokensByWalletCount(limit: number = 10): Promise<Array<{
    mint: string;
    walletCount: number;
    totalAmount: number;
  }>> {
    const pipeline = [
      {
        $group: {
          _id: '$mint',
          walletCount: { $addToSet: '$walletAddress' },
          totalAmount: { $sum: '$amount' }
        }
      },
      {
        $project: {
          mint: '$_id',
          walletCount: { $size: '$walletCount' },
          totalAmount: 1,
          _id: 0
        }
      },
      { $sort: { walletCount: -1 } },
      { $limit: limit }
    ];

    return await this.collections.walletHoldings.aggregate(pipeline).toArray() as { mint: string; walletCount: number; totalAmount: number; }[];
  }

  public async getWalletActivitySummary(
    walletAddress: string,
    days: number = 30
  ): Promise<Array<{
    date: string;
    activityCount: number;
    types: Record<string, number>;
  }>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const pipeline = [
      {
        $match: {
          walletAddress,
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            type: '$type'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.date',
          activityCount: { $sum: '$count' },
          types: {
            $push: {
              k: '$_id.type',
              v: '$count'
            }
          }
        }
      },
      {
        $project: {
          date: '$_id',
          activityCount: 1,
          types: { $arrayToObject: '$types' },
          _id: 0
        }
      },
      { $sort: { date: 1 } }
    ];

    return await this.collections.walletActivities.aggregate(pipeline).toArray() as { date: string; activityCount: number; types: Record<string, number>; }[];
  }

  // Maintenance Operations
  public async cleanupOldData(daysToKeep: number = 90): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    await Promise.all([
      this.collections.walletActivities.deleteMany({
        timestamp: { $lt: cutoffDate }
      }),
      this.collections.walletAlerts.deleteMany({
        createdAt: { $lt: cutoffDate },
        isRead: true
      }),
      this.cleanupOldSnapshots(daysToKeep)
    ]);
  }

  public async getCollectionStats(): Promise<Record<string, number>> {
    const stats: Record<string, number> = {};

    for (const [name, collection] of Object.entries(this.collections)) {
      stats[name] = await collection.countDocuments();
    }

    return stats;
  }

  // Backup and Export
  public async exportWalletData(walletAddress?: string): Promise<any> {
    if (walletAddress) {
      const [wallet, holdings, activities, snapshots, alerts] = await Promise.all([
        this.getWallet(walletAddress),
        this.getWalletHoldings(walletAddress),
        this.getWalletActivities(walletAddress, 1000),
        this.getWalletSnapshots(walletAddress, 100),
        this.getWalletAlerts(walletAddress)
      ]);

      return {
        wallet,
        holdings,
        activities,
        snapshots,
        alerts,
        exportedAt: new Date()
      };
    }

    // Export all data
    const [wallets, holdings, activities, snapshots, alerts] = await Promise.all([
      this.getAllWallets(),
      this.collections.walletHoldings.find({}).toArray(),
      this.collections.walletActivities.find({}).limit(10000).toArray(),
      this.collections.walletSnapshots.find({}).limit(5000).toArray(),
      this.collections.walletAlerts.find({}).toArray()
    ]);

    return {
      wallets,
      holdings,
      activities,
      snapshots,
      alerts,
      exportedAt: new Date()
    };
  }
}

// Singleton instance
let walletTrackerDbInstance: WalletTrackerDatabase | null = null;

export async function getWalletTrackerDb(): Promise<WalletTrackerDatabase> {
  if (!walletTrackerDbInstance) {
    const { getMongoClient } = await import('./mongodb');
    const client = await getMongoClient();
    walletTrackerDbInstance = new WalletTrackerDatabase(client);
    await walletTrackerDbInstance.initializeIndexes();
  }
  return walletTrackerDbInstance;
}

// Utility functions for common operations
export async function saveTrackedWallet(wallet: TrackedWallet): Promise<void> {
  const db = await getWalletTrackerDb();
  await db.saveWallet(wallet);
}

export async function getTrackedWalletFromDb(address: string): Promise<TrackedWallet | null> {
  const db = await getWalletTrackerDb();
  return await db.getWallet(address);
}

export async function saveWalletHoldingsToDb(holdings: WalletTokenHolding[]): Promise<void> {
  const db = await getWalletTrackerDb();
  await db.saveWalletHoldings(holdings);
}

export async function saveWalletActivitiesToDb(activities: WalletActivity[]): Promise<void> {
  const db = await getWalletTrackerDb();
  await db.saveWalletActivities(activities);
}