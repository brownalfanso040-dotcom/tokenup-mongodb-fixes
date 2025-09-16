/**
 * Rollback Service for SPL Token Creator
 * Handles rollback mechanisms for partial failure scenarios
 * Provides comprehensive cleanup and state recovery functionality
 */

// Using global window.solanaWeb3 instead of ES6 imports for browser compatibility
const { Connection, PublicKey, Transaction } = window.solanaWeb3 || {};
import { getAssociatedTokenAddress, createCloseAccountInstruction } from '@solana/spl-token';
import { MetadataService } from './metadataService.js';
import { MultiWalletCoordinator } from './multiWalletCoordinator.js';
import { sleep } from './utils.js';

export class RollbackService {
  constructor(connection, walletManager) {
    this.connection = connection;
    this.walletManager = walletManager;
    this.metadataService = new MetadataService();
    this.coordinator = new MultiWalletCoordinator(connection);
    
    // Track operations for rollback
    this.operationHistory = new Map();
    this.rollbackStrategies = new Map();
    
    this.initializeStrategies();
  }

  /**
   * Initialize rollback strategies for different operation types
   */
  initializeStrategies() {
    this.rollbackStrategies.set('TOKEN_CREATION', this.rollbackTokenCreation.bind(this));
    this.rollbackStrategies.set('METADATA_UPLOAD', this.rollbackMetadataUpload.bind(this));
    this.rollbackStrategies.set('TOKEN_DISTRIBUTION', this.rollbackTokenDistribution.bind(this));
    this.rollbackStrategies.set('LIQUIDITY_POOL', this.rollbackLiquidityPool.bind(this));
    this.rollbackStrategies.set('MULTI_WALLET_OPERATION', this.rollbackMultiWalletOperation.bind(this));
  }

  /**
   * Track an operation for potential rollback
   */
  trackOperation(operationId, operationType, context) {
    this.operationHistory.set(operationId, {
      type: operationType,
      context,
      timestamp: Date.now(),
      status: 'in_progress',
      rollbackData: []
    });
  }

  /**
   * Add rollback data to an operation
   */
  addRollbackData(operationId, rollbackItem) {
    const operation = this.operationHistory.get(operationId);
    if (operation) {
      operation.rollbackData.push({
        ...rollbackItem,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Mark operation as completed (no rollback needed)
   */
  markOperationComplete(operationId) {
    const operation = this.operationHistory.get(operationId);
    if (operation) {
      operation.status = 'completed';
    }
  }

  /**
   * Execute rollback for a specific operation
   */
  async executeRollback(operationId, options = {}) {
    const operation = this.operationHistory.get(operationId);
    if (!operation) {
      throw new Error(`Operation ${operationId} not found in history`);
    }

    if (operation.status === 'completed') {
      console.log(`Operation ${operationId} already completed, no rollback needed`);
      return { success: true, message: 'No rollback needed' };
    }

    const strategy = this.rollbackStrategies.get(operation.type);
    if (!strategy) {
      throw new Error(`No rollback strategy found for operation type: ${operation.type}`);
    }

    try {
      console.log(`Executing rollback for operation ${operationId} (${operation.type})`);
      
      const result = await strategy(operation, options);
      
      operation.status = 'rolled_back';
      operation.rollbackResult = result;
      
      console.log(`Rollback completed for operation ${operationId}`);
      return result;
      
    } catch (error) {
      operation.status = 'rollback_failed';
      operation.rollbackError = error.message;
      
      console.error(`Rollback failed for operation ${operationId}:`, error);
      throw error;
    }
  }

  /**
   * Rollback token creation (close accounts, cleanup metadata)
   */
  async rollbackTokenCreation(operation, options = {}) {
    const { context, rollbackData } = operation;
    const results = [];

    // Rollback metadata uploads
    const metadataUris = rollbackData
      .filter(item => item.type === 'metadata_upload')
      .map(item => item.uri);
    
    if (metadataUris.length > 0) {
      try {
        const metadataRollback = await this.metadataService.rollbackUploads(metadataUris);
        results.push({
          type: 'metadata_cleanup',
          success: true,
          details: metadataRollback
        });
      } catch (error) {
        results.push({
          type: 'metadata_cleanup',
          success: false,
          error: error.message
        });
      }
    }

    // Close token accounts if created
    const tokenAccounts = rollbackData
      .filter(item => item.type === 'token_account')
      .map(item => item.account);
    
    if (tokenAccounts.length > 0 && !options.skipAccountClosure) {
      try {
        const accountClosureResult = await this.closeTokenAccounts(tokenAccounts);
        results.push({
          type: 'account_closure',
          success: true,
          details: accountClosureResult
        });
      } catch (error) {
        results.push({
          type: 'account_closure',
          success: false,
          error: error.message
        });
      }
    }

    return {
      success: true,
      operationType: 'TOKEN_CREATION',
      rollbackActions: results
    };
  }

  /**
   * Rollback metadata upload
   */
  async rollbackMetadataUpload(operation, options = {}) {
    const { rollbackData } = operation;
    
    const metadataUris = rollbackData
      .filter(item => item.type === 'metadata_upload')
      .map(item => item.uri);
    
    if (metadataUris.length === 0) {
      return {
        success: true,
        message: 'No metadata uploads to rollback'
      };
    }

    const rollbackResults = await this.metadataService.rollbackUploads(metadataUris);
    
    return {
      success: true,
      operationType: 'METADATA_UPLOAD',
      rollbackResults
    };
  }

  /**
   * Rollback token distribution
   */
  async rollbackTokenDistribution(operation, options = {}) {
    const { rollbackData } = operation;
    const results = [];

    // Reverse successful token transfers
    const successfulTransfers = rollbackData.filter(item => 
      item.type === 'token_transfer' && item.status === 'success'
    );

    for (const transfer of successfulTransfers) {
      try {
        // Note: In practice, token transfers cannot be reversed
        // This would require the recipients to send tokens back
        // For now, we'll just log the transfers that would need manual reversal
        results.push({
          type: 'transfer_reversal_needed',
          success: false,
          message: 'Manual reversal required',
          details: {
            from: transfer.from,
            to: transfer.to,
            amount: transfer.amount,
            signature: transfer.signature
          }
        });
      } catch (error) {
        results.push({
          type: 'transfer_reversal_failed',
          success: false,
          error: error.message,
          transfer
        });
      }
    }

    return {
      success: true,
      operationType: 'TOKEN_DISTRIBUTION',
      rollbackActions: results,
      manualActionsRequired: results.filter(r => r.type === 'transfer_reversal_needed')
    };
  }

  /**
   * Rollback liquidity pool creation
   */
  async rollbackLiquidityPool(operation, options = {}) {
    const { rollbackData } = operation;
    const results = [];

    // Close pool accounts if created
    const poolAccounts = rollbackData
      .filter(item => item.type === 'pool_account')
      .map(item => item.account);
    
    if (poolAccounts.length > 0) {
      try {
        const closureResult = await this.closeTokenAccounts(poolAccounts);
        results.push({
          type: 'pool_account_closure',
          success: true,
          details: closureResult
        });
      } catch (error) {
        results.push({
          type: 'pool_account_closure',
          success: false,
          error: error.message
        });
      }
    }

    // Reverse liquidity contributions (if possible)
    const contributions = rollbackData.filter(item => 
      item.type === 'liquidity_contribution'
    );

    for (const contribution of contributions) {
      results.push({
        type: 'contribution_reversal_needed',
        success: false,
        message: 'Manual reversal required for liquidity contribution',
        details: contribution
      });
    }

    return {
      success: true,
      operationType: 'LIQUIDITY_POOL',
      rollbackActions: results
    };
  }

  /**
   * Rollback multi-wallet operation
   */
  async rollbackMultiWalletOperation(operation, options = {}) {
    const { rollbackData } = operation;
    const results = [];

    // Group rollback data by wallet
    const walletGroups = new Map();
    rollbackData.forEach(item => {
      if (!walletGroups.has(item.wallet)) {
        walletGroups.set(item.wallet, []);
      }
      walletGroups.get(item.wallet).push(item);
    });

    // Process rollback for each wallet
    for (const [wallet, items] of walletGroups) {
      try {
        const walletRollback = await this.rollbackWalletOperations(wallet, items);
        results.push({
          wallet,
          success: true,
          details: walletRollback
        });
      } catch (error) {
        results.push({
          wallet,
          success: false,
          error: error.message
        });
      }
    }

    return {
      success: true,
      operationType: 'MULTI_WALLET_OPERATION',
      walletResults: results
    };
  }

  /**
   * Rollback operations for a specific wallet
   */
  async rollbackWalletOperations(wallet, operations) {
    const results = [];

    for (const operation of operations) {
      switch (operation.type) {
        case 'token_account_creation':
          // Token accounts can be closed if empty
          results.push({
            type: 'token_account',
            action: 'closure_needed',
            account: operation.account
          });
          break;
          
        case 'token_transfer':
          // Transfers require manual reversal
          results.push({
            type: 'token_transfer',
            action: 'manual_reversal_needed',
            details: operation
          });
          break;
          
        default:
          results.push({
            type: operation.type,
            action: 'no_rollback_strategy',
            details: operation
          });
      }
    }

    return results;
  }

  /**
   * Close token accounts
   */
  async closeTokenAccounts(accounts) {
    const results = [];
    const payer = this.walletManager.getPublicKey();

    for (const accountInfo of accounts) {
      try {
        const accountPubkey = new PublicKey(accountInfo.address);
        const owner = new PublicKey(accountInfo.owner);
        
        // Check if account has zero balance before closing
        const accountData = await this.connection.getTokenAccountBalance(accountPubkey);
        
        if (accountData.value.uiAmount > 0) {
          results.push({
            account: accountInfo.address,
            success: false,
            reason: 'Account has non-zero balance',
            balance: accountData.value.uiAmount
          });
          continue;
        }

        // Create close account instruction
        const closeInstruction = createCloseAccountInstruction(
          accountPubkey,
          payer,
          owner
        );

        const transaction = new Transaction().add(closeInstruction);
        const signature = await this.walletManager.signAndSendTransaction(transaction);
        
        results.push({
          account: accountInfo.address,
          success: true,
          signature
        });
        
        // Small delay between closures
        await sleep(100);
        
      } catch (error) {
        results.push({
          account: accountInfo.address,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get operation history
   */
  getOperationHistory(operationId = null) {
    if (operationId) {
      return this.operationHistory.get(operationId);
    }
    return Array.from(this.operationHistory.entries()).map(([id, operation]) => ({
      id,
      ...operation
    }));
  }

  /**
   * Clear operation history
   */
  clearHistory(olderThanMs = null) {
    if (olderThanMs) {
      const cutoffTime = Date.now() - olderThanMs;
      for (const [id, operation] of this.operationHistory) {
        if (operation.timestamp < cutoffTime) {
          this.operationHistory.delete(id);
        }
      }
    } else {
      this.operationHistory.clear();
    }
  }

  /**
   * Get rollback statistics
   */
  getStats() {
    const operations = Array.from(this.operationHistory.values());
    
    return {
      totalOperations: operations.length,
      inProgress: operations.filter(op => op.status === 'in_progress').length,
      completed: operations.filter(op => op.status === 'completed').length,
      rolledBack: operations.filter(op => op.status === 'rolled_back').length,
      rollbackFailed: operations.filter(op => op.status === 'rollback_failed').length,
      operationTypes: {
        TOKEN_CREATION: operations.filter(op => op.type === 'TOKEN_CREATION').length,
        METADATA_UPLOAD: operations.filter(op => op.type === 'METADATA_UPLOAD').length,
        TOKEN_DISTRIBUTION: operations.filter(op => op.type === 'TOKEN_DISTRIBUTION').length,
        LIQUIDITY_POOL: operations.filter(op => op.type === 'LIQUIDITY_POOL').length,
        MULTI_WALLET_OPERATION: operations.filter(op => op.type === 'MULTI_WALLET_OPERATION').length
      }
    };
  }

  /**
   * Generate unique operation ID
   */
  generateOperationId() {
    return `rollback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export default new RollbackService();