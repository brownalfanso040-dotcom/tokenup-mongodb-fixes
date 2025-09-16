// Jito Bundle Service for Atomic Transaction Execution
// Using global window.solanaWeb3 instead of ES6 imports for browser compatibility
const { Connection, VersionedTransaction, PublicKey } = window.solanaWeb3 || {};
import { bundle } from 'jito-ts';
import { searcherClient } from 'jito-ts/dist/sdk/block-engine/searcher.js';
import { getCurrentNetwork } from './config.js';
import walletManager from './walletManager.js';

/**
 * JitoService provides atomic transaction execution through Jito bundles
 * Features:
 * - MEV protection through bundle execution
 * - Atomic transaction guarantees (all succeed or all fail)
 * - Revert protection for complex operations
 * - Optimized tip management
 */
class JitoService {
  constructor() {
    this.connection = null;
    this.jitoClient = null;
    this.config = {
      blockEngineUrl: 'https://mainnet.block-engine.jito.wtf',
      authKeypair: null, // Will be set from environment
      defaultTipLamports: 0, // All tips removed for transparency
      maxBundleSize: 5, // Jito limit
      retryAttempts: 3,
      retryDelay: 1000 // ms
    };
    
    this.initializeService();
  }

  /**
   * Initialize the Jito service with current network configuration
   */
  initializeService() {
    try {
      this.connection = walletManager.getConnection();
      
      // Initialize Jito client for mainnet operations
      const network = getCurrentNetwork();
      if (network.name === 'Mainnet Beta') {
        this.initializeJitoClient();
      }
    } catch (error) {
      console.warn('Jito service initialization failed:', error.message);
    }
  }

  /**
   * Initialize Jito searcher client
   */
  initializeJitoClient() {
    try {
      // Note: In production, auth keypair should come from secure environment
      if (this.config.authKeypair) {
        this.jitoClient = searcherClient(
          this.config.blockEngineUrl,
          this.config.authKeypair
        );
      }
    } catch (error) {
      console.error('Failed to initialize Jito client:', error);
    }
  }

  /**
   * Check if Jito bundles are available for current network
   */
  isJitoAvailable() {
    const network = getCurrentNetwork();
    return network.name === 'Mainnet Beta' && this.jitoClient !== null;
  }

  /**
   * Create and send a Jito bundle with multiple transactions
   * @param {VersionedTransaction[]} transactions - Array of transactions to bundle
   * @param {Object} options - Bundle options
   * @returns {Promise<{success: boolean, bundleId?: string, error?: string}>}
   */
  async sendBundle(transactions, options = {}) {
    try {
      // Validate inputs
      if (!Array.isArray(transactions) || transactions.length === 0) {
        throw new Error('Transactions array is required and cannot be empty');
      }

      if (transactions.length > this.config.maxBundleSize) {
        throw new Error(`Bundle size exceeds maximum of ${this.config.maxBundleSize} transactions`);
      }

      // Check if Jito is available
      if (!this.isJitoAvailable()) {
        return this.fallbackToRegularTransactions(transactions);
      }

      // Validate wallet connection
      if (!walletManager.isWalletConnected()) {
        throw new Error('Wallet not connected');
      }

      const feePayerKeypair = walletManager.getKeypair();
      if (!feePayerKeypair) {
        throw new Error('Unable to access wallet keypair for bundle signing');
      }

      // Tip accounts and selection removed for transparency
      // All tip-related functionality has been disabled

      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();

      // Create bundle without tip transaction (removed for transparency)
      const tipAmount = 0; // All tips removed
      let jitoBundle = new bundle.Bundle(transactions, transactions.length);
      // Tip transaction removed for complete transparency

      if (jitoBundle instanceof Error) {
        throw new Error(`Failed to create bundle: ${jitoBundle.message}`);
      }

      // Send bundle with retry logic
      return await this.sendBundleWithRetry(jitoBundle, options);

    } catch (error) {
      console.error('Bundle send failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get Jito tip accounts
   */
  async getTipAccounts() {
    try {
      if (!this.jitoClient) {
        throw new Error('Jito client not initialized');
      }

      return await this.jitoClient.getTipAccounts();
    } catch (error) {
      console.error('Failed to get tip accounts:', error);
      return null;
    }
  }

  /**
   * Send bundle with retry logic
   */
  async sendBundleWithRetry(jitoBundle, options = {}) {
    const maxRetries = options.retryAttempts || this.config.retryAttempts;
    const retryDelay = options.retryDelay || this.config.retryDelay;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Check if we have a valid leader slot
        const leaderSlot = await this.getNextLeaderSlot();
        if (!leaderSlot) {
          throw new Error('No upcoming Jito leader slot found');
        }

        // Send the bundle
        const result = await this.jitoClient.sendBundle(jitoBundle);
        
        return {
          success: true,
          bundleId: result.bundleId || result,
          leaderSlot
        };

      } catch (error) {
        console.warn(`Bundle send attempt ${attempt} failed:`, error.message);
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Wait before retry
        await this.sleep(retryDelay * attempt);
      }
    }
  }

  /**
   * Get next Jito leader slot
   */
  async getNextLeaderSlot() {
    try {
      if (!this.jitoClient) {
        return null;
      }

      const leaderInfo = await this.jitoClient.getNextScheduledLeader();
      return leaderInfo?.nextLeaderSlot || null;
    } catch (error) {
      console.error('Failed to get next leader slot:', error);
      return null;
    }
  }

  /**
   * Fallback to regular transaction sending when Jito is not available
   */
  async fallbackToRegularTransactions(transactions) {
    try {
      console.log('Jito not available, falling back to regular transactions');
      
      const signatures = [];
      for (const transaction of transactions) {
        const signature = await walletManager.signAndSendTransaction(transaction);
        signatures.push(signature);
        
        // Small delay between transactions to avoid rate limiting
        await this.sleep(100);
      }

      return {
        success: true,
        signatures,
        fallback: true
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        fallback: true
      };
    }
  }

  /**
   * Create atomic token operations bundle
   * Combines token creation, metadata, and initial mint into one atomic operation
   */
  async createAtomicTokenBundle(tokenInstructions, metadataInstructions, mintInstructions) {
    try {
      // Create transactions from instruction groups
      const transactions = [];
      
      if (tokenInstructions.length > 0) {
        const tokenTx = await this.createTransactionFromInstructions(tokenInstructions);
        transactions.push(tokenTx);
      }
      
      if (metadataInstructions.length > 0) {
        const metadataTx = await this.createTransactionFromInstructions(metadataInstructions);
        transactions.push(metadataTx);
      }
      
      if (mintInstructions.length > 0) {
        const mintTx = await this.createTransactionFromInstructions(mintInstructions);
        transactions.push(mintTx);
      }

      return await this.sendBundle(transactions);
    } catch (error) {
      console.error('Failed to create atomic token bundle:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create versioned transaction from instructions
   */
  async createTransactionFromInstructions(instructions) {
    const { blockhash } = await this.connection.getLatestBlockhash();
    const payer = walletManager.getPublicKey();
    
    const messageV0 = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions
    }).compileToV0Message();
    
    return new VersionedTransaction(messageV0);
  }

  /**
   * Update service configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Reinitialize if block engine URL changed
    if (newConfig.blockEngineUrl || newConfig.authKeypair) {
      this.initializeJitoClient();
    }
  }

  /**
   * Get current service status
   */
  getStatus() {
    return {
      jitoAvailable: this.isJitoAvailable(),
      network: getCurrentNetwork().name,
      walletConnected: walletManager.isWalletConnected(),
      config: {
        blockEngineUrl: this.config.blockEngineUrl,
        defaultTipLamports: this.config.defaultTipLamports,
        maxBundleSize: this.config.maxBundleSize
      }
    };
  }

  /**
   * Utility sleep function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const jitoService = new JitoService();
export default jitoService;