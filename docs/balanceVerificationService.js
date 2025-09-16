// Real-time Balance Verification Service for Liquidity Creation
// Note: Using global scope for Solana Web3.js in browser environment
// import { Connection, PublicKey } from '@solana/web3.js';
// import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import walletManager from './walletManager.js';

// Use global Solana Web3.js objects
const { Connection, PublicKey, SystemProgram } = window.solanaWeb3;

// Simple implementation of getAssociatedTokenAddress for browser environment
// This is a basic version - for production use the official SPL token library
function getAssociatedTokenAddress(mint, owner) {
  // For now, we'll skip token account balance checking
  // This would need proper implementation with SPL token program
  console.warn('getAssociatedTokenAddress: Token balance checking temporarily disabled');
  return null;
}

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

// Simple EventEmitter implementation for browser
class EventEmitter {
  constructor() {
    this.events = {};
  }
  
  on(event, listener) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
  }
  
  emit(event, ...args) {
    if (this.events[event]) {
      this.events[event].forEach(listener => listener(...args));
    }
  }
  
  removeListener(event, listener) {
    if (this.events[event]) {
      this.events[event] = this.events[event].filter(l => l !== listener);
    }
  }
}

/**
 * Real-time Balance Verification Service
 * Provides live balance checking and validation for liquidity operations
 */
class BalanceVerificationService extends EventEmitter {
  constructor() {
    super();
    this.connection = null;
    this.balanceCache = new Map();
    this.updateIntervals = new Map();
    this.isMonitoring = false;
    this.refreshInterval = 5000; // 5 seconds
    this.cacheTimeout = 10000; // 10 seconds
    this.initializeConnection();
  }

  initializeConnection() {
    this.connection = walletManager.getConnection();
  }

  /**
   * Start real-time balance monitoring
   * @param {Array} tokens - Array of token addresses to monitor
   * @param {Object} options - Monitoring options
   */
  startMonitoring(tokens = [], options = {}) {
    if (this.isMonitoring) {
      this.stopMonitoring();
    }

    this.isMonitoring = true;
    this.refreshInterval = options.refreshInterval || 5000;
    
    // Always monitor SOL balance
    this.startSolMonitoring();
    
    // Monitor specified token balances
    tokens.forEach(tokenAddress => {
      this.startTokenMonitoring(tokenAddress);
    });

    this.emit('monitoringStarted', { tokens, options });
    console.log('🔍 Balance monitoring started');
  }

  /**
   * Stop all balance monitoring
   */
  stopMonitoring() {
    this.isMonitoring = false;
    
    // Clear all intervals
    this.updateIntervals.forEach(interval => clearInterval(interval));
    this.updateIntervals.clear();
    
    this.emit('monitoringStopped');
    console.log('⏹️ Balance monitoring stopped');
  }

  /**
   * Start monitoring SOL balance
   */
  startSolMonitoring() {
    const updateSolBalance = async () => {
      try {
        const publicKey = walletManager.getPublicKey();
        if (!publicKey) return;

        const balance = await this.connection.getBalance(publicKey);
        const solBalance = balance / 1e9; // Convert lamports to SOL
        
        const previousBalance = this.balanceCache.get('SOL')?.balance || 0;
        const balanceData = {
          address: 'SOL',
          balance: solBalance,
          formatted: `${solBalance.toFixed(6)} SOL`,
          timestamp: Date.now(),
          changed: Math.abs(solBalance - previousBalance) > 0.000001
        };

        this.balanceCache.set('SOL', balanceData);
        
        if (balanceData.changed) {
          this.emit('balanceUpdated', balanceData);
        }
      } catch (error) {
        console.error('Error updating SOL balance:', error);
        this.emit('balanceError', { address: 'SOL', error: error.message });
      }
    };

    // Initial update
    updateSolBalance();
    
    // Set up interval
    const interval = setInterval(updateSolBalance, this.refreshInterval);
    this.updateIntervals.set('SOL', interval);
  }

  /**
   * Start monitoring specific token balance
   * @param {string} tokenAddress - Token mint address
   */
  startTokenMonitoring(tokenAddress) {
    const updateTokenBalance = async () => {
      try {
        const publicKey = walletManager.getPublicKey();
        if (!publicKey) return;

        const tokenMint = new PublicKey(tokenAddress);
        const tokenAccount = getAssociatedTokenAddress(tokenMint, publicKey);
        
        let balance = 0;
        let decimals = 9;
        let exists = false;

        // Skip token balance checking if getAssociatedTokenAddress is not available
        if (!tokenAccount) {
          console.warn(`Token balance checking skipped for ${tokenAddress}`);
          const balanceData = {
            address: tokenAddress,
            balance: 0,
            formatted: '0 tokens',
            decimals: decimals,
            exists: false,
            timestamp: Date.now(),
            changed: false
          };
          this.balanceCache.set(tokenAddress, balanceData);
          return;
        }

        try {
          const tokenAccountInfo = await this.connection.getTokenAccountBalance(tokenAccount);
          balance = parseFloat(tokenAccountInfo.value.uiAmount || 0);
          decimals = tokenAccountInfo.value.decimals;
          exists = true;
        } catch (error) {
          if (!error.message.includes('could not find account')) {
            throw error;
          }
          // Account doesn't exist, balance is 0
        }

        const previousBalance = this.balanceCache.get(tokenAddress)?.balance || 0;
        const balanceData = {
          address: tokenAddress,
          balance: balance,
          formatted: `${balance.toLocaleString()} tokens`,
          decimals: decimals,
          exists: exists,
          timestamp: Date.now(),
          changed: Math.abs(balance - previousBalance) > 0.000001
        };

        this.balanceCache.set(tokenAddress, balanceData);
        
        if (balanceData.changed) {
          this.emit('balanceUpdated', balanceData);
        }
      } catch (error) {
        console.error(`Error updating token balance for ${tokenAddress}:`, error);
        this.emit('balanceError', { address: tokenAddress, error: error.message });
      }
    };

    // Initial update
    updateTokenBalance();
    
    // Set up interval
    const interval = setInterval(updateTokenBalance, this.refreshInterval);
    this.updateIntervals.set(tokenAddress, interval);
  }

  /**
   * Get current balance for an address
   * @param {string} address - Token address or 'SOL'
   * @param {boolean} forceRefresh - Force refresh from blockchain
   * @returns {Object} Balance data
   */
  async getBalance(address, forceRefresh = false) {
    const cached = this.balanceCache.get(address);
    const now = Date.now();
    
    // Return cached if recent and not forcing refresh
    if (!forceRefresh && cached && (now - cached.timestamp) < this.cacheTimeout) {
      return cached;
    }

    // Refresh balance
    if (address === 'SOL') {
      return await this.refreshSolBalance();
    } else {
      return await this.refreshTokenBalance(address);
    }
  }

  /**
   * Refresh SOL balance
   */
  async refreshSolBalance() {
    const publicKey = walletManager.getPublicKey();
    if (!publicKey) {
      throw new Error('Wallet not connected');
    }

    const balance = await this.connection.getBalance(publicKey);
    const solBalance = balance / 1e9;
    
    const balanceData = {
      address: 'SOL',
      balance: solBalance,
      formatted: `${solBalance.toFixed(6)} SOL`,
      timestamp: Date.now(),
      changed: false
    };

    this.balanceCache.set('SOL', balanceData);
    return balanceData;
  }

  /**
   * Refresh token balance
   * @param {string} tokenAddress - Token mint address
   */
  async refreshTokenBalance(tokenAddress) {
    const publicKey = walletManager.getPublicKey();
    if (!publicKey) {
      throw new Error('Wallet not connected');
    }

    const tokenMint = new PublicKey(tokenAddress);
    const tokenAccount = getAssociatedTokenAddress(tokenMint, publicKey);
    
    let balance = 0;
    let decimals = 9;
    let exists = false;

    // Skip token balance checking if getAssociatedTokenAddress is not available
    if (!tokenAccount) {
      console.warn(`Token balance checking skipped for ${tokenAddress}`);
      const balanceData = {
        address: tokenAddress,
        balance: 0,
        formatted: '0 tokens',
        decimals: decimals,
        exists: false,
        timestamp: Date.now(),
        changed: false
      };
      this.balanceCache.set(tokenAddress, balanceData);
      return balanceData;
    }

    try {
      const tokenAccountInfo = await this.connection.getTokenAccountBalance(tokenAccount);
      balance = parseFloat(tokenAccountInfo.value.uiAmount || 0);
      decimals = tokenAccountInfo.value.decimals;
      exists = true;
    } catch (error) {
      if (!error.message.includes('could not find account')) {
        throw error;
      }
    }

    const balanceData = {
      address: tokenAddress,
      balance: balance,
      formatted: `${balance.toLocaleString()} tokens`,
      decimals: decimals,
      exists: exists,
      timestamp: Date.now(),
      changed: false
    };

    this.balanceCache.set(tokenAddress, balanceData);
    return balanceData;
  }

  /**
   * Validate balances for liquidity creation
   * @param {Object} requirements - Required balances
   * @returns {Object} Validation result
   */
  async validateLiquidityRequirements(requirements) {
    const validation = {
      valid: true,
      errors: [],
      warnings: [],
      balances: {},
      requirements: requirements
    };

    try {
      // Validate SOL balance
      if (requirements.solAmount) {
        const solBalance = await this.getBalance('SOL', true);
        validation.balances.SOL = solBalance;
        
        const requiredSol = requirements.solAmount + (requirements.fees || 0.01);
        if (solBalance.balance < requiredSol) {
          validation.valid = false;
          validation.errors.push({
            type: 'insufficient_sol',
            message: `Insufficient SOL balance. Required: ${requiredSol.toFixed(6)} SOL, Available: ${solBalance.balance.toFixed(6)} SOL`,
            required: requiredSol,
            available: solBalance.balance,
            deficit: requiredSol - solBalance.balance
          });
        } else if (solBalance.balance < requiredSol * 1.1) {
          validation.warnings.push({
            type: 'low_sol_buffer',
            message: `SOL balance is close to minimum required. Consider having more SOL for transaction fees.`,
            available: solBalance.balance,
            recommended: requiredSol * 1.2
          });
        }
      }

      // Validate token balance
      if (requirements.tokenAddress && requirements.tokenAmount) {
        const tokenBalance = await this.getBalance(requirements.tokenAddress, true);
        validation.balances[requirements.tokenAddress] = tokenBalance;
        
        if (!tokenBalance.exists) {
          validation.valid = false;
          validation.errors.push({
            type: 'token_account_not_found',
            message: 'Token account not found. Please ensure you have the required tokens.',
            tokenAddress: requirements.tokenAddress
          });
        } else if (tokenBalance.balance < requirements.tokenAmount) {
          validation.valid = false;
          validation.errors.push({
            type: 'insufficient_tokens',
            message: `Insufficient token balance. Required: ${requirements.tokenAmount.toLocaleString()}, Available: ${tokenBalance.balance.toLocaleString()}`,
            required: requirements.tokenAmount,
            available: tokenBalance.balance,
            deficit: requirements.tokenAmount - tokenBalance.balance,
            tokenAddress: requirements.tokenAddress
          });
        }
      }

      // Additional validations
      if (requirements.minimumSolReserve) {
        const solBalance = validation.balances.SOL || await this.getBalance('SOL', true);
        const remainingSol = solBalance.balance - (requirements.solAmount || 0);
        
        if (remainingSol < requirements.minimumSolReserve) {
          validation.warnings.push({
            type: 'low_sol_reserve',
            message: `Remaining SOL after operation will be below recommended reserve.`,
            remaining: remainingSol,
            recommended: requirements.minimumSolReserve
          });
        }
      }

    } catch (error) {
      validation.valid = false;
      validation.errors.push({
        type: 'validation_error',
        message: `Error during balance validation: ${error.message}`,
        error: error.message
      });
    }

    this.emit('validationCompleted', validation);
    return validation;
  }

  /**
   * Get all cached balances
   * @returns {Object} All cached balance data
   */
  getAllBalances() {
    const balances = {};
    this.balanceCache.forEach((balance, address) => {
      balances[address] = balance;
    });
    return balances;
  }

  /**
   * Clear balance cache
   */
  clearCache() {
    this.balanceCache.clear();
    this.emit('cacheCleared');
  }

  /**
   * Get monitoring status
   * @returns {Object} Current monitoring status
   */
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      monitoredAddresses: Array.from(this.updateIntervals.keys()),
      cachedBalances: this.balanceCache.size,
      refreshInterval: this.refreshInterval,
      lastUpdate: Math.max(...Array.from(this.balanceCache.values()).map(b => b.timestamp))
    };
  }

  /**
   * Update monitoring settings
   * @param {Object} settings - New settings
   */
  updateSettings(settings) {
    if (settings.refreshInterval && settings.refreshInterval !== this.refreshInterval) {
      this.refreshInterval = settings.refreshInterval;
      
      // Restart monitoring with new interval if currently monitoring
      if (this.isMonitoring) {
        const monitoredTokens = Array.from(this.updateIntervals.keys()).filter(addr => addr !== 'SOL');
        this.stopMonitoring();
        this.startMonitoring(monitoredTokens, { refreshInterval: this.refreshInterval });
      }
    }

    if (settings.cacheTimeout) {
      this.cacheTimeout = settings.cacheTimeout;
    }

    this.emit('settingsUpdated', settings);
  }

  /**
   * Format balance for display
   * @param {number} balance - Balance amount
   * @param {string} type - 'SOL' or 'TOKEN'
   * @param {number} decimals - Token decimals
   * @returns {string} Formatted balance string
   */
  formatBalance(balance, type = 'TOKEN', decimals = 9) {
    if (type === 'SOL') {
      return `${balance.toFixed(6)} SOL`;
    } else {
      if (balance >= 1000000) {
        return `${(balance / 1000000).toFixed(2)}M tokens`;
      } else if (balance >= 1000) {
        return `${(balance / 1000).toFixed(2)}K tokens`;
      } else {
        return `${balance.toLocaleString()} tokens`;
      }
    }
  }

  /**
   * Calculate estimated transaction costs
   * @param {Object} operation - Operation details
   * @returns {Object} Cost estimation
   */
  estimateTransactionCosts(operation) {
    const baseFee = 0.000005; // Base transaction fee
    const accountCreationFee = 0.00203928; // Rent for token account creation
    
    let estimatedCost = baseFee;
    
    // Add account creation costs if needed
    if (operation.createTokenAccount) {
      estimatedCost += accountCreationFee;
    }
    
    // Add pool creation costs (estimated)
    if (operation.createPool) {
      estimatedCost += 0.01; // Estimated pool creation cost
    }
    
    // Add buffer for priority fees
    estimatedCost += 0.001;
    
    return {
      baseFee,
      accountCreationFee: operation.createTokenAccount ? accountCreationFee : 0,
      poolCreationFee: operation.createPool ? 0.01 : 0,
      priorityFeeBuffer: 0.001,
      total: estimatedCost,
      formatted: `${estimatedCost.toFixed(6)} SOL`
    };
  }
}

// Create and export singleton instance
export const balanceVerificationService = new BalanceVerificationService();
export default balanceVerificationService;