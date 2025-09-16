import { Connection, PublicKey } from '@solana/web3.js';
import { getHeliusService, HeliusService } from './helius';
import { getWeb3Service, Web3Service } from './web3Service';
import { NetworkType } from '../context/NetworkContext';

export interface TrackedWallet {
  id: string;
  address: string;
  name?: string;
  description?: string;
  tags: string[];
  isActive: boolean;
  createdAt: Date;
  lastUpdated: Date;
  lastActivity: Date;
  tokenCount: number;
  totalValue?: number;
  activityCount?: number;
  network: NetworkType;
}

export interface WalletTokenHolding {
  walletAddress: string;
  mint: string;
  amount: number;
  decimals: number;
  tokenAccount: string;
  metadata?: {
    name?: string;
    symbol?: string;
    image?: string;
    description?: string;
  };
  usdValue?: number;
  lastUpdated: Date;
}

export interface WalletActivity {
  id: string;
  walletAddress: string;
  type: 'token_transfer' | 'token_mint' | 'token_burn' | 'sol_transfer' | 'nft_transfer';
  signature: string;
  timestamp: Date;
  amount?: number;
  mint?: string;
  fromAddress?: string;
  toAddress?: string;
  description: string;
  network: NetworkType;
}

export interface WalletSnapshot {
  walletAddress: string;
  timestamp: Date;
  totalTokens: number;
  totalUsdValue: number;
  solBalance: number;
  tokenHoldings: WalletTokenHolding[];
  network: NetworkType;
}

export interface WalletTrackerStats {
  totalWallets: number;
  activeWallets: number;
  totalTokensTracked: number;
  totalUsdValue: number;
  lastUpdateTime: Date;
  network: NetworkType;
}

export interface WalletAlert {
  id: string;
  walletAddress: string;
  type: 'balance_change' | 'token_transfer' | 'large_transaction' | 'new_token' | 'suspicious_activity';
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  isRead: boolean;
  metadata?: {
    amount?: number;
    token?: string;
    transactionSignature?: string;
    [key: string]: any;
  };
}

export class WalletTrackerService {
  private helius: HeliusService;
  private web3Service: Web3Service;
  private connection: Connection;
  private network: NetworkType;
  private trackedWallets: Map<string, TrackedWallet> = new Map();
  private walletHoldings: Map<string, WalletTokenHolding[]> = new Map();
  private walletActivities: Map<string, WalletActivity[]> = new Map();
  private updateIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(network: NetworkType = 'mainnet') {
    this.network = network;
    this.helius = getHeliusService(network);
    this.web3Service = getWeb3Service(network);
    this.connection = this.helius.getConnection();
  }

  // Wallet Management
  public async addWallet(
    address: string,
    name?: string,
    description?: string,
    tags: string[] = []
  ): Promise<TrackedWallet> {
    try {
      // Validate wallet address
      new PublicKey(address);
    } catch (error) {
      throw new Error('Invalid wallet address');
    }

    const wallet: TrackedWallet = {
      id: `wallet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      address,
      name: name || `Wallet ${address.slice(0, 8)}...`,
      description,
      tags,
      isActive: true,
      createdAt: new Date(),
      lastUpdated: new Date(),
      lastActivity: new Date(),
      tokenCount: 0,
      network: this.network
    };

    this.trackedWallets.set(address, wallet);
    
    // Start monitoring this wallet
    await this.startWalletMonitoring(address);
    
    // Initial data fetch
    await this.updateWalletData(address);

    return wallet;
  }

  public async removeWallet(address: string): Promise<boolean> {
    const wallet = this.trackedWallets.get(address);
    if (!wallet) {
      return false;
    }

    // Stop monitoring
    this.stopWalletMonitoring(address);
    
    // Remove from maps
    this.trackedWallets.delete(address);
    this.walletHoldings.delete(address);
    this.walletActivities.delete(address);

    return true;
  }

  public getTrackedWallets(): TrackedWallet[] {
    return Array.from(this.trackedWallets.values());
  }

  public getAllWallets(): TrackedWallet[] {
    return this.getTrackedWallets();
  }

  public getWallet(address: string): TrackedWallet | undefined {
    return this.trackedWallets.get(address);
  }

  public async updateWalletInfo(
    address: string,
    updates: Partial<Pick<TrackedWallet, 'name' | 'description' | 'tags' | 'isActive'>>
  ): Promise<TrackedWallet | null> {
    const wallet = this.trackedWallets.get(address);
    if (!wallet) {
      return null;
    }

    const updatedWallet = {
      ...wallet,
      ...updates,
      lastUpdated: new Date()
    };

    this.trackedWallets.set(address, updatedWallet);
    return updatedWallet;
  }

  // Token Holdings Management
  public async updateWalletData(address: string): Promise<void> {
    try {
      const wallet = this.trackedWallets.get(address);
      if (!wallet || !wallet.isActive) {
        return;
      }

      // Get token holdings
      const tokenBalances = await this.web3Service.getWalletTokens(address);
      
      const holdings: WalletTokenHolding[] = tokenBalances.map(balance => ({
        walletAddress: address,
        mint: balance.mint,
        amount: balance.amount,
        decimals: balance.decimals,
        tokenAccount: balance.tokenAccount,
        metadata: balance.metadata,
        lastUpdated: new Date()
      }));

      this.walletHoldings.set(address, holdings);

      // Update wallet properties
      wallet.lastUpdated = new Date();
      wallet.tokenCount = holdings.length;
      
      // Update lastActivity if there are recent activities
      const activities = this.walletActivities.get(address) || [];
      if (activities.length > 0) {
        const latestActivity = activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
        wallet.lastActivity = latestActivity.timestamp;
      }
      
      this.trackedWallets.set(address, wallet);

    } catch (error) {
      console.error(`Error updating wallet data for ${address}:`, error);
    }
  }

  public getWalletHoldings(address: string): WalletTokenHolding[] {
    return this.walletHoldings.get(address) || [];
  }

  public async getWalletSnapshot(address: string): Promise<WalletSnapshot | null> {
    const holdings = this.getWalletHoldings(address);
    if (!holdings) {
      return null;
    }

    try {
      // Get SOL balance
      const solBalance = await this.connection.getBalance(new PublicKey(address));

      return {
        walletAddress: address,
        timestamp: new Date(),
        totalTokens: holdings.length,
        totalUsdValue: holdings.reduce((sum, holding) => sum + (holding.usdValue || 0), 0),
        solBalance: solBalance / 1e9, // Convert lamports to SOL
        tokenHoldings: holdings,
        network: this.network
      };
    } catch (error) {
      console.error(`Error creating wallet snapshot for ${address}:`, error);
      return null;
    }
  }

  // Activity Monitoring
  public async fetchWalletActivities(address: string, limit: number = 50): Promise<WalletActivity[]> {
    try {
      const transactions = await this.helius.getTransactionHistory(address, undefined, limit);
      
      const activities: WalletActivity[] = transactions.map(tx => ({
        id: tx.signature,
        walletAddress: address,
        type: this.determineActivityType(tx),
        signature: tx.signature,
        timestamp: new Date(tx.timestamp * 1000),
        description: tx.description,
        network: this.network
      }));

      // Store activities
      const existingActivities = this.walletActivities.get(address) || [];
      const mergedActivities = this.mergeActivities(existingActivities, activities);
      this.walletActivities.set(address, mergedActivities);

      return activities;
    } catch (error) {
      console.error(`Error fetching activities for ${address}:`, error);
      return [];
    }
  }

  public getWalletActivities(address: string): WalletActivity[] {
    return this.walletActivities.get(address) || [];
  }

  private determineActivityType(tx: any): WalletActivity['type'] {
    if (tx.type?.includes('TOKEN')) {
      if (tx.type.includes('TRANSFER')) return 'token_transfer';
      if (tx.type.includes('MINT')) return 'token_mint';
      if (tx.type.includes('BURN')) return 'token_burn';
    }
    if (tx.type?.includes('NFT')) return 'nft_transfer';
    return 'sol_transfer';
  }

  private mergeActivities(existing: WalletActivity[], newActivities: WalletActivity[]): WalletActivity[] {
    const merged = [...existing];
    
    for (const activity of newActivities) {
      if (!merged.find(a => a.signature === activity.signature)) {
        merged.push(activity);
      }
    }

    // Sort by timestamp (newest first) and limit to 1000 activities
    return merged
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 1000);
  }

  // Real-time Monitoring
  public async startWalletMonitoring(address: string, intervalMs: number = 30000): Promise<void> {
    // Stop existing monitoring if any
    this.stopWalletMonitoring(address);

    // Start new monitoring interval
    const interval = setInterval(async () => {
      await this.updateWalletData(address);
      await this.fetchWalletActivities(address, 10); // Fetch recent activities
    }, intervalMs);

    this.updateIntervals.set(address, interval);
  }

  public stopWalletMonitoring(address: string): void {
    const interval = this.updateIntervals.get(address);
    if (interval) {
      clearInterval(interval);
      this.updateIntervals.delete(address);
    }
  }

  public async startAllWalletMonitoring(intervalMs: number = 30000): Promise<void> {
    for (const wallet of this.trackedWallets.values()) {
      if (wallet.isActive) {
        await this.startWalletMonitoring(wallet.address, intervalMs);
      }
    }
  }

  public stopAllWalletMonitoring(): void {
    for (const address of this.updateIntervals.keys()) {
      this.stopWalletMonitoring(address);
    }
  }

  public async startMonitoring(address: string, intervalMs: number = 30000): Promise<void> {
    return this.startWalletMonitoring(address, intervalMs);
  }

  public stopMonitoring(address: string): void {
    return this.stopWalletMonitoring(address);
  }

  // Analytics and Statistics
  public async getTrackerStats(): Promise<WalletTrackerStats> {
    const wallets = Array.from(this.trackedWallets.values());
    const activeWallets = wallets.filter(w => w.isActive);
    
    let totalTokens = 0;
    let totalUsdValue = 0;

    for (const wallet of activeWallets) {
      const holdings = this.walletHoldings.get(wallet.address) || [];
      totalTokens += holdings.length;
      totalUsdValue += holdings.reduce((sum, holding) => sum + (holding.usdValue || 0), 0);
    }

    return {
      totalWallets: wallets.length,
      activeWallets: activeWallets.length,
      totalTokensTracked: totalTokens,
      totalUsdValue,
      lastUpdateTime: new Date(),
      network: this.network
    };
  }

  public async searchWallets(query: string): Promise<TrackedWallet[]> {
    const wallets = Array.from(this.trackedWallets.values());
    const lowerQuery = query.toLowerCase();

    return wallets.filter(wallet => 
      wallet.address.toLowerCase().includes(lowerQuery) ||
      wallet.name?.toLowerCase().includes(lowerQuery) ||
      wallet.description?.toLowerCase().includes(lowerQuery) ||
      wallet.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  public async getWalletsByToken(mint: string): Promise<TrackedWallet[]> {
    const walletsWithToken: TrackedWallet[] = [];

    for (const [address, holdings] of this.walletHoldings.entries()) {
      if (holdings.some(holding => holding.mint === mint)) {
        const wallet = this.trackedWallets.get(address);
        if (wallet) {
          walletsWithToken.push(wallet);
        }
      }
    }

    return walletsWithToken;
  }

  // Bulk Operations
  public async refreshAllWallets(): Promise<void> {
    const promises = Array.from(this.trackedWallets.keys()).map(address => 
      this.updateWalletData(address)
    );
    
    await Promise.allSettled(promises);
  }

  public async refreshWalletData(address: string): Promise<void> {
    return this.updateWalletData(address);
  }

  public async exportWalletData(address?: string): Promise<any> {
    if (address) {
      const wallet = this.trackedWallets.get(address);
      const holdings = this.walletHoldings.get(address) || [];
      const activities = this.walletActivities.get(address) || [];
      
      return {
        wallet,
        holdings,
        activities,
        exportedAt: new Date()
      };
    }

    // Export all data
    return {
      wallets: Array.from(this.trackedWallets.values()),
      holdings: Object.fromEntries(this.walletHoldings),
      activities: Object.fromEntries(this.walletActivities),
      stats: await this.getTrackerStats(),
      exportedAt: new Date()
    };
  }

  // Network Management
  public switchNetwork(network: NetworkType): void {
    this.stopAllWalletMonitoring();
    this.network = network;
    this.helius = getHeliusService(network);
    this.web3Service = getWeb3Service(network);
    this.connection = this.helius.getConnection();
    
    // Update all wallets to new network
    for (const wallet of this.trackedWallets.values()) {
      wallet.network = network;
    }
  }

  public getNetwork(): NetworkType {
    return this.network;
  }

  // Cleanup
  public destroy(): void {
    this.stopAllWalletMonitoring();
    this.trackedWallets.clear();
    this.walletHoldings.clear();
    this.walletActivities.clear();
  }
}

// Singleton instance
let walletTrackerInstance: WalletTrackerService | null = null;

export function getWalletTracker(network: NetworkType = 'mainnet'): WalletTrackerService {
  if (!walletTrackerInstance || walletTrackerInstance.getNetwork() !== network) {
    walletTrackerInstance = new WalletTrackerService(network);
  }
  return walletTrackerInstance;
}

// Utility functions
export async function addWalletToTracker(
  address: string,
  name?: string,
  description?: string,
  tags: string[] = [],
  network: NetworkType = 'mainnet'
): Promise<TrackedWallet> {
  const tracker = getWalletTracker(network);
  return await tracker.addWallet(address, name, description, tags);
}

export async function getTrackedWalletData(
  address: string,
  network: NetworkType = 'mainnet'
): Promise<{
  wallet: TrackedWallet | undefined;
  holdings: WalletTokenHolding[];
  activities: WalletActivity[];
  snapshot: WalletSnapshot | null;
}> {
  const tracker = getWalletTracker(network);
  
  return {
    wallet: tracker.getWallet(address),
    holdings: tracker.getWalletHoldings(address),
    activities: tracker.getWalletActivities(address),
    snapshot: await tracker.getWalletSnapshot(address)
  };
}