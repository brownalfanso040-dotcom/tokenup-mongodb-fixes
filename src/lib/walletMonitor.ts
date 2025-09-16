import { getWalletTrackerDb, WalletAlert } from './walletTrackerDb';
import { getWalletTracker } from './walletTracker';
import { getHeliusService } from './helius';
import { getWeb3Service } from './web3Service';
import { NetworkType } from '@/context/NetworkContext';

export interface MonitoringRule {
  id: string;
  walletAddress: string;
  type: 'balance_change' | 'token_transfer' | 'new_token' | 'large_transaction' | 'nft_activity';
  conditions: {
    threshold?: number;
    tokenAddress?: string;
    minAmount?: number;
    percentage?: number;
  };
  isActive: boolean;
  createdAt: Date;
  network: NetworkType;
}

export interface ActivityNotification {
  id: string;
  walletAddress: string;
  type: string;
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  data: any;
  timestamp: Date;
  network: NetworkType;
}

class WalletMonitorService {
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isMonitoring = false;
  private monitoringRules: Map<string, MonitoringRule[]> = new Map();
  private lastCheckedBlocks: Map<NetworkType, number> = new Map();

  constructor() {
    this.initializeMonitoring();
  }

  private async initializeMonitoring() {
    try {
      const db = await getWalletTrackerDb();
      
      // Load existing monitoring rules from database
      const wallets = await db.getAllWallets();
      for (const wallet of wallets) {
        const rules = await this.loadMonitoringRules(wallet.address);
        if (rules.length > 0) {
          this.monitoringRules.set(wallet.address, rules);
        }
      }

      console.log('Wallet monitoring service initialized');
    } catch (error) {
      console.error('Failed to initialize wallet monitoring:', error);
    }
  }

  async startMonitoring(network: NetworkType = 'mainnet') {
    if (this.isMonitoring) {
      console.log('Monitoring already active');
      return;
    }

    this.isMonitoring = true;
    console.log(`Starting wallet monitoring for ${network}`);

    // Start periodic monitoring
    const interval = setInterval(async () => {
      await this.performMonitoringCycle(network);
    }, 30000); // Check every 30 seconds

    this.monitoringIntervals.set(network, interval);

    // Start real-time monitoring for high-priority wallets
    await this.startRealTimeMonitoring(network);
  }

  async stopMonitoring(network?: NetworkType) {
    if (network) {
      const interval = this.monitoringIntervals.get(network);
      if (interval) {
        clearInterval(interval);
        this.monitoringIntervals.delete(network);
      }
    } else {
      // Stop all monitoring
      this.monitoringIntervals.forEach(interval => clearInterval(interval));
      this.monitoringIntervals.clear();
      this.isMonitoring = false;
    }

    console.log(`Stopped wallet monitoring${network ? ` for ${network}` : ''}`);
  }

  private async performMonitoringCycle(network: NetworkType) {
    try {
      const db = await getWalletTrackerDb();
      const wallets = await db.getAllWallets(network);
      const activeWallets = wallets.filter(w => w.isActive);

      console.log(`Monitoring ${activeWallets.length} active wallets on ${network}`);

      for (const wallet of activeWallets) {
        await this.checkWalletActivity(wallet.address, network);
      }
    } catch (error) {
      console.error('Error in monitoring cycle:', error);
    }
  }

  private async checkWalletActivity(walletAddress: string, network: NetworkType) {
    try {
      const tracker = await getWalletTracker();
      const db = await getWalletTrackerDb();

      // Get current holdings
      const currentHoldings = await tracker.getWalletHoldings(walletAddress);
      const previousHoldings = await db.getWalletHoldings(walletAddress);

      // Check for balance changes
      await this.checkBalanceChanges(walletAddress, currentHoldings, previousHoldings, network);

      // Check for new tokens
      await this.checkNewTokens(walletAddress, currentHoldings, previousHoldings, network);

      // Get recent activities
      const recentActivities = await tracker.getWalletActivities(walletAddress);
      const lastStoredActivity = await db.getLatestWalletActivity(walletAddress);

      // Check for new activities
      if (recentActivities.length > 0) {
        const newActivities = lastStoredActivity 
          ? recentActivities.filter(a => a.timestamp > lastStoredActivity.timestamp)
          : recentActivities;

        for (const activity of newActivities) {
          await this.processNewActivity(walletAddress, activity, network);
        }
      }

      // Update last checked timestamp
      // await db.updateWalletLastChecked(walletAddress, new Date());

    } catch (error) {
      console.error(`Error checking wallet activity for ${walletAddress}:`, error);
    }
  }

  private async checkBalanceChanges(
    walletAddress: string, 
    currentHoldings: any[], 
    previousHoldings: any[], 
    network: NetworkType
  ) {
    const rules = this.monitoringRules.get(walletAddress) || [];
    const balanceRules = rules.filter(r => r.type === 'balance_change' && r.isActive);

    for (const rule of balanceRules) {
      for (const current of currentHoldings) {
        const previous = previousHoldings.find(p => p.tokenAddress === current.tokenAddress);
        
        if (previous) {
          const change = current.amount - previous.amount;
          const percentageChange = Math.abs(change / previous.amount) * 100;

          if (rule.conditions.threshold && Math.abs(change) >= rule.conditions.threshold) {
            await this.createAlert(walletAddress, {
              type: 'balance_change',
              title: 'Significant Balance Change',
              message: `${current.symbol} balance changed by ${change.toFixed(4)} (${percentageChange.toFixed(2)}%)`,
              severity: percentageChange > 50 ? 'high' : 'medium',
              data: { tokenAddress: current.tokenAddress, change, percentageChange },
              network
            });
          }
        }
      }
    }
  }

  private async checkNewTokens(
    walletAddress: string, 
    currentHoldings: any[], 
    previousHoldings: any[], 
    network: NetworkType
  ) {
    const newTokens = currentHoldings.filter(current => 
      !previousHoldings.some(previous => previous.tokenAddress === current.tokenAddress)
    );

    if (newTokens.length > 0) {
      for (const token of newTokens) {
        await this.createAlert(walletAddress, {
          type: 'new_token',
          title: 'New Token Detected',
          message: `New token ${token.symbol} (${token.amount.toFixed(4)}) added to wallet`,
          severity: 'medium',
          data: { tokenAddress: token.tokenAddress, amount: token.amount },
          network
        });
      }
    }
  }

  private async processNewActivity(walletAddress: string, activity: any, network: NetworkType) {
    const rules = this.monitoringRules.get(walletAddress) || [];

    // Check for large transactions
    const largeTransactionRules = rules.filter(r => r.type === 'large_transaction' && r.isActive);
    for (const rule of largeTransactionRules) {
      if (activity.amount && rule.conditions.minAmount && activity.amount >= rule.conditions.minAmount) {
        await this.createAlert(walletAddress, {
          type: 'large_transaction',
          title: 'Large Transaction Detected',
          message: `${activity.type} of ${activity.amount} ${activity.symbol || 'tokens'}`,
          severity: activity.amount > rule.conditions.minAmount * 10 ? 'high' : 'medium',
          data: activity,
          network
        });
      }
    }

    // Check for NFT activities
    if (activity.type === 'nft_transfer' || activity.type === 'nft_mint') {
      await this.createAlert(walletAddress, {
        type: 'nft_activity',
        title: 'NFT Activity',
        message: `NFT ${activity.type}: ${activity.nftName || 'Unknown NFT'}`,
        severity: 'low',
        data: activity,
        network
      });
    }
  }

  private async createAlert(walletAddress: string, notification: Omit<ActivityNotification, 'id' | 'timestamp' | 'walletAddress'>) {
    try {
      const alert: WalletAlert = {
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        walletAddress,
        type: notification.type as 'balance_change' | 'large_transaction' | 'new_token' | 'suspicious_activity',
        title: notification.title,
        message: notification.message,
        severity: notification.severity,
        isRead: false,
        createdAt: new Date(),
        network: notification.network,
        data: notification.data
      };

      const db = await getWalletTrackerDb();
      await db.saveWalletAlert(alert);

      console.log(`Alert created for wallet ${walletAddress}: ${notification.title}`);

      // Emit real-time notification if WebSocket is available
      this.emitRealTimeNotification(alert);

    } catch (error) {
      console.error('Error creating alert:', error);
    }
  }

  private emitRealTimeNotification(alert: WalletAlert) {
    // This would integrate with WebSocket or Server-Sent Events
    // For now, we'll just log it
    console.log('Real-time notification:', {
      walletAddress: alert.walletAddress,
      type: alert.type,
      title: alert.title,
      severity: alert.severity
    });
  }

  private async startRealTimeMonitoring(network: NetworkType) {
    try {
      // This would set up WebSocket connections to blockchain providers
      // for real-time transaction monitoring
      console.log(`Starting real-time monitoring for ${network}`);
      
      // For demonstration, we'll simulate real-time monitoring
      // In production, this would connect to Helius webhooks or similar
    } catch (error) {
      console.error('Error starting real-time monitoring:', error);
    }
  }

  async addMonitoringRule(walletAddress: string, rule: Omit<MonitoringRule, 'id' | 'createdAt'>) {
    const newRule: MonitoringRule = {
      ...rule,
      id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date()
    };

    const existingRules = this.monitoringRules.get(walletAddress) || [];
    existingRules.push(newRule);
    this.monitoringRules.set(walletAddress, existingRules);

    // Save to database
    await this.saveMonitoringRule(newRule);

    return newRule;
  }

  async removeMonitoringRule(walletAddress: string, ruleId: string) {
    const rules = this.monitoringRules.get(walletAddress) || [];
    const updatedRules = rules.filter(r => r.id !== ruleId);
    this.monitoringRules.set(walletAddress, updatedRules);

    // Remove from database
    await this.deleteMonitoringRule(ruleId);
  }

  async getMonitoringRules(walletAddress: string): Promise<MonitoringRule[]> {
    return this.monitoringRules.get(walletAddress) || [];
  }

  private async loadMonitoringRules(walletAddress: string): Promise<MonitoringRule[]> {
    // This would load from database
    // For now, return empty array
    return [];
  }

  private async saveMonitoringRule(rule: MonitoringRule) {
    // This would save to database
    console.log('Saving monitoring rule:', rule.id);
  }

  private async deleteMonitoringRule(ruleId: string) {
    // This would delete from database
    console.log('Deleting monitoring rule:', ruleId);
  }

  getMonitoringStatus() {
    return {
      isMonitoring: this.isMonitoring,
      activeNetworks: Array.from(this.monitoringIntervals.keys()),
      totalRules: Array.from(this.monitoringRules.values()).reduce((sum, rules) => sum + rules.length, 0),
      totalWallets: this.monitoringRules.size
    };
  }
}

// Singleton instance
let walletMonitorInstance: WalletMonitorService | null = null;

export function getWalletMonitor(): WalletMonitorService {
  if (!walletMonitorInstance) {
    walletMonitorInstance = new WalletMonitorService();
  }
  return walletMonitorInstance;
}

export default WalletMonitorService;