/**
 * Comprehensive Error Handling and Revert Protection for Bundle Operations
 * Provides robust error handling, fallback strategies, and transaction safety
 */

// Using global window.solanaWeb3 instead of ES6 imports for browser compatibility
const { Connection, Transaction, sendAndConfirmTransaction } = window.solanaWeb3 || {};
import { sleep } from './utils.js';
import { JITO_CONFIG } from './config.js';

/**
 * Custom error classes for different types of failures
 */
export class BundleError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'BundleError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

export class NetworkError extends Error {
  constructor(message, networkInfo = {}) {
    super(message);
    this.name = 'NetworkError';
    this.networkInfo = networkInfo;
    this.timestamp = new Date().toISOString();
  }
}

export class WalletError extends Error {
  constructor(message, walletType = null) {
    super(message);
    this.name = 'WalletError';
    this.walletType = walletType;
    this.timestamp = new Date().toISOString();
  }
}

export class ValidationError extends Error {
  constructor(message, field = null, value = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Error codes for different failure scenarios
 */
export const ERROR_CODES = {
  // Bundle-specific errors
  BUNDLE_REJECTED: 'BUNDLE_REJECTED',
  BUNDLE_TIMEOUT: 'BUNDLE_TIMEOUT',
  BUNDLE_PARTIAL_FAILURE: 'BUNDLE_PARTIAL_FAILURE',
  BUNDLE_SIZE_EXCEEDED: 'BUNDLE_SIZE_EXCEEDED',
  
  // Network errors
  NETWORK_CONGESTION: 'NETWORK_CONGESTION',
  RPC_ERROR: 'RPC_ERROR',
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  
  // Jito-specific errors
  JITO_UNAVAILABLE: 'JITO_UNAVAILABLE',
  NO_LEADER_SLOTS: 'NO_LEADER_SLOTS',
  AUTH_FAILED: 'AUTH_FAILED',
  
  // Transaction errors
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
  SIMULATION_FAILED: 'SIMULATION_FAILED',
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  PROGRAM_ERROR: 'PROGRAM_ERROR',
  
  // Validation errors
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_SIGNATURE: 'MISSING_SIGNATURE',
  INVALID_ACCOUNT: 'INVALID_ACCOUNT'
};

/**
 * Retry strategies for different error types
 */
const RETRY_STRATEGIES = {
  [ERROR_CODES.NETWORK_CONGESTION]: {
    maxRetries: 5,
    baseDelay: 2000,
    backoffMultiplier: 2,
    jitter: true
  },
  [ERROR_CODES.BUNDLE_REJECTED]: {
    maxRetries: 3,
    baseDelay: 1000,
    backoffMultiplier: 1.5,
    increaseTip: true
  },
  [ERROR_CODES.RPC_ERROR]: {
    maxRetries: 4,
    baseDelay: 1500,
    backoffMultiplier: 2,
    switchEndpoint: true
  },
  // TIP_TOO_LOW retry strategy removed
};

/**
 * Main error handler class
 */
export class ErrorHandler {
  constructor(options = {}) {
    this.options = {
      enableLogging: true,
      enableFallback: true,
      maxGlobalRetries: 3,
      fallbackToRegular: true,
      ...options
    };
    
    this.errorLog = [];
    this.retryCount = new Map();
    this.lastErrors = new Map();
  }

  /**
   * Handle bundle operation with comprehensive error handling
   */
  async handleBundleOperation(operation, context = {}) {
    const operationId = this.generateOperationId();
    
    try {
      this.log('info', `Starting bundle operation: ${operationId}`, context);
      
      // Pre-operation validation
      await this.validateOperation(operation, context);
      
      // Execute with retry logic
      const result = await this.executeWithRetry(operation, context, operationId);
      
      this.log('success', `Bundle operation completed: ${operationId}`, result);
      return {
        success: true,
        result,
        operationId,
        method: 'bundle'
      };
      
    } catch (error) {
      this.log('error', `Bundle operation failed: ${operationId}`, error);
      
      // Attempt fallback if enabled
      if (this.options.enableFallback) {
        return await this.handleFallback(operation, context, error, operationId);
      }
      
      throw this.enhanceError(error, context, operationId);
    }
  }

  /**
   * Execute operation with retry logic
   */
  async executeWithRetry(operation, context, operationId) {
    let lastError;
    let currentTip = context.tipLamports || JITO_CONFIG.defaultTipLamports;
    
    for (let attempt = 1; attempt <= this.options.maxGlobalRetries; attempt++) {
      try {
        this.log('info', `Attempt ${attempt}/${this.options.maxGlobalRetries} for ${operationId}`);
        
        // Update context with current attempt info
        const attemptContext = {
          ...context,
          attempt,
          tipLamports: currentTip,
          operationId
        };
        
        const result = await operation(attemptContext);
        
        // Reset retry count on success
        this.retryCount.delete(operationId);
        return result;
        
      } catch (error) {
        lastError = error;
        this.log('warn', `Attempt ${attempt} failed for ${operationId}:`, error.message);
        
        // Determine if we should retry
        const shouldRetry = this.shouldRetry(error, attempt);
        if (!shouldRetry || attempt === this.options.maxGlobalRetries) {
          break;
        }
        
        // Apply retry strategy
        const strategy = this.getRetryStrategy(error);
        if (strategy) {
          await this.applyRetryStrategy(strategy, attempt, context);
          
          // Increase tip if strategy suggests it
          if (strategy.increaseTip) {
            currentTip = Math.floor(currentTip * (strategy.tipMultiplier || 1.5));
            this.log('info', `Increasing tip to ${currentTip} lamports`);
          }
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Handle fallback to regular transactions
   */
  async handleFallback(operation, context, originalError, operationId) {
    try {
      this.log('info', `Attempting fallback for ${operationId}`);
      
      // Check if fallback is appropriate
      if (!this.shouldFallback(originalError)) {
        throw originalError;
      }
      
      // Execute fallback operation
      const fallbackContext = {
        ...context,
        fallback: true,
        originalError: originalError.message,
        operationId
      };
      
      const result = await this.executeFallback(operation, fallbackContext);
      
      this.log('success', `Fallback completed for ${operationId}`);
      return {
        success: true,
        result,
        operationId,
        method: 'fallback',
        originalError: originalError.message
      };
      
    } catch (fallbackError) {
      this.log('error', `Fallback failed for ${operationId}:`, fallbackError.message);
      
      // Return comprehensive error information
      throw new BundleError(
        'Both bundle and fallback operations failed',
        ERROR_CODES.BUNDLE_PARTIAL_FAILURE,
        {
          originalError: originalError.message,
          fallbackError: fallbackError.message,
          operationId
        }
      );
    }
  }

  /**
   * Execute fallback operation (regular transactions)
   */
  async executeFallback(operation, context) {
    // This would be implemented based on the specific operation type
    // For now, we'll simulate a fallback execution
    if (typeof operation.fallback === 'function') {
      return await operation.fallback(context);
    }
    
    throw new Error('No fallback implementation available');
  }

  /**
   * Validate operation before execution
   */
  async validateOperation(operation, context) {
    // Check if operation is valid
    if (!operation || typeof operation !== 'function') {
      throw new ValidationError('Invalid operation provided', 'operation', operation);
    }
    
    // Check bundle size
    if (context.transactions && context.transactions.length > JITO_CONFIG.maxBundleSize) {
      throw new BundleError(
        `Bundle size ${context.transactions.length} exceeds maximum ${JITO_CONFIG.maxBundleSize}`,
        ERROR_CODES.BUNDLE_SIZE_EXCEEDED
      );
    }
    
    // Check wallet connection
    if (context.wallet && !context.wallet.connected) {
      throw new WalletError('Wallet not connected', context.wallet.type);
    }
    
    // Check network connection
    if (context.connection) {
      try {
        await context.connection.getLatestBlockhash();
      } catch (error) {
        throw new NetworkError('Failed to connect to Solana network', {
          endpoint: context.connection.rpcEndpoint
        });
      }
    }
  }

  /**
   * Determine if operation should be retried
   */
  shouldRetry(error, attempt) {
    // Don't retry validation errors
    if (error instanceof ValidationError) {
      return false;
    }
    
    // Don't retry wallet errors
    if (error instanceof WalletError) {
      return false;
    }
    
    // Check if error type is retryable
    const strategy = this.getRetryStrategy(error);
    if (!strategy) {
      return false;
    }
    
    return attempt < strategy.maxRetries;
  }

  /**
   * Determine if fallback should be attempted
   */
  shouldFallback(error) {
    if (!this.options.fallbackToRegular) {
      return false;
    }
    
    // Fallback for bundle-specific errors
    const fallbackCodes = [
      ERROR_CODES.BUNDLE_REJECTED,
      ERROR_CODES.BUNDLE_TIMEOUT,
      ERROR_CODES.JITO_UNAVAILABLE,
      ERROR_CODES.NO_LEADER_SLOTS
    ];
    
    return fallbackCodes.includes(error.code) || error.name === 'BundleError';
  }

  /**
   * Get retry strategy for error type
   */
  getRetryStrategy(error) {
    if (error.code && RETRY_STRATEGIES[error.code]) {
      return RETRY_STRATEGIES[error.code];
    }
    
    // Default strategy for unknown errors
    return {
      maxRetries: 2,
      baseDelay: 1000,
      backoffMultiplier: 1.5
    };
  }

  /**
   * Apply retry strategy (delays, etc.)
   */
  async applyRetryStrategy(strategy, attempt, context) {
    let delay = strategy.baseDelay * Math.pow(strategy.backoffMultiplier, attempt - 1);
    
    // Add jitter if enabled
    if (strategy.jitter) {
      delay += Math.random() * 1000;
    }
    
    this.log('info', `Waiting ${delay}ms before retry`);
    await sleep(delay);
  }

  /**
   * Enhance error with additional context
   */
  enhanceError(error, context, operationId) {
    if (error instanceof BundleError || error instanceof NetworkError || 
        error instanceof WalletError || error instanceof ValidationError) {
      return error;
    }
    
    // Convert generic errors to BundleError
    return new BundleError(
      error.message || 'Unknown error occurred',
      ERROR_CODES.TRANSACTION_FAILED,
      {
        originalError: error,
        context,
        operationId,
        stack: error.stack
      }
    );
  }

  /**
   * Generate unique operation ID
   */
  generateOperationId() {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Log messages with different levels
   */
  log(level, message, data = null) {
    if (!this.options.enableLogging) {
      return;
    }
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    };
    
    this.errorLog.push(logEntry);
    
    // Console output
    const logMethod = console[level] || console.log;
    if (data) {
      logMethod(`[${level.toUpperCase()}] ${message}`, data);
    } else {
      logMethod(`[${level.toUpperCase()}] ${message}`);
    }
  }

  /**
   * Get error statistics
   */
  getErrorStats() {
    const stats = {
      totalErrors: this.errorLog.filter(log => log.level === 'error').length,
      totalWarnings: this.errorLog.filter(log => log.level === 'warn').length,
      totalOperations: this.errorLog.filter(log => log.message.includes('Starting bundle operation')).length,
      successfulOperations: this.errorLog.filter(log => log.message.includes('Bundle operation completed')).length,
      fallbacksUsed: this.errorLog.filter(log => log.message.includes('Fallback completed')).length
    };
    
    stats.successRate = stats.totalOperations > 0 
      ? (stats.successfulOperations / stats.totalOperations) * 100 
      : 0;
    
    return stats;
  }

  /**
   * Clear error log
   */
  clearLog() {
    this.errorLog = [];
    this.retryCount.clear();
    this.lastErrors.clear();
  }

  /**
   * Export error log
   */
  exportLog() {
    return {
      timestamp: new Date().toISOString(),
      stats: this.getErrorStats(),
      logs: this.errorLog
    };
  }
}

/**
 * Utility functions for error handling
 */
export const ErrorUtils = {
  /**
   * Check if error is retryable
   */
  isRetryable(error) {
    const retryableCodes = [
      ERROR_CODES.NETWORK_CONGESTION,
      ERROR_CODES.RPC_ERROR,
      ERROR_CODES.BUNDLE_REJECTED
    ];
    
    return retryableCodes.includes(error.code);
  },

  /**
   * Extract error code from various error types
   */
  extractErrorCode(error) {
    if (error.code) {
      return error.code;
    }
    
    // Try to extract from message
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('insufficient')) {
      return ERROR_CODES.INSUFFICIENT_BALANCE;
    }
    if (message.includes('network') || message.includes('connection')) {
      return ERROR_CODES.CONNECTION_FAILED;
    }
    if (message.includes('simulation')) {
      return ERROR_CODES.SIMULATION_FAILED;
    }
    if (message.includes('account')) {
      return ERROR_CODES.ACCOUNT_NOT_FOUND;
    }
    
    return ERROR_CODES.TRANSACTION_FAILED;
  },

  /**
   * Format error for user display
   */
  formatUserError(error) {
    const userFriendlyMessages = {
      [ERROR_CODES.INSUFFICIENT_BALANCE]: 'Insufficient SOL balance for transaction fees',
      [ERROR_CODES.NETWORK_CONGESTION]: 'Network is congested, please try again',
      [ERROR_CODES.BUNDLE_REJECTED]: 'Transaction bundle was rejected, retrying',
      [ERROR_CODES.JITO_UNAVAILABLE]: 'Bundle service temporarily unavailable, using regular transactions',
      [ERROR_CODES.WALLET_ERROR]: 'Wallet connection issue, please reconnect',
      [ERROR_CODES.VALIDATION_ERROR]: 'Invalid input provided, please check your data'
    };
    
    return userFriendlyMessages[error.code] || error.message || 'An unexpected error occurred';
  }
};

// Create default error handler instance
export const defaultErrorHandler = new ErrorHandler();

export default ErrorHandler;