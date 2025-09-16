// Liquidity Operations Version Control System
import { EventEmitter } from 'events';
import walletManager from './walletManager.js';

/**
 * Version Control System for Liquidity Operations
 * Tracks all liquidity creation operations with comprehensive versioning
 */
class LiquidityVersionControl extends EventEmitter {
  constructor() {
    super();
    this.operations = new Map();
    this.versions = new Map();
    this.currentVersion = '1.0.0';
    this.operationCounter = 0;
    this.changeLog = [];
    this.rollbackHistory = [];
  }

  /**
   * Initialize a new liquidity operation with version tracking
   * @param {Object} config - Operation configuration
   * @returns {Object} Operation tracking data
   */
  initializeOperation(config) {
    const operationId = this.generateOperationId();
    const version = this.generateVersion();
    const timestamp = new Date().toISOString();
    
    const operation = {
      id: operationId,
      version: version,
      status: 'initialized',
      config: { ...config },
      timestamp: timestamp,
      wallet: walletManager.getPublicKey()?.toString(),
      changes: [],
      checkpoints: [],
      metadata: {
        dex: 'OpenBook', // Based on research, OpenBook is the preferred choice
        mevProtection: config.useMevProtection !== false,
        bundleEnabled: config.bundleEnabled !== false
      }
    };

    this.operations.set(operationId, operation);
    this.versions.set(version, operationId);
    
    this.logChange({
      operationId,
      version,
      action: 'operation_initialized',
      description: `Liquidity operation ${operationId} initialized with version ${version}`,
      timestamp,
      config: config
    });

    this.emit('operationInitialized', operation);
    return operation;
  }

  /**
   * Update operation status with version tracking
   * @param {string} operationId - Operation identifier
   * @param {string} status - New status
   * @param {Object} data - Additional data
   */
  updateOperationStatus(operationId, status, data = {}) {
    const operation = this.operations.get(operationId);
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    const previousStatus = operation.status;
    const timestamp = new Date().toISOString();
    
    // Create checkpoint before major status changes
    if (this.isMajorStatusChange(previousStatus, status)) {
      this.createCheckpoint(operationId, `Status change: ${previousStatus} -> ${status}`);
    }

    operation.status = status;
    operation.lastUpdated = timestamp;
    
    if (data.signature) {
      operation.signatures = operation.signatures || [];
      operation.signatures.push({
        signature: data.signature,
        status: status,
        timestamp: timestamp
      });
    }

    if (data.bundleId) {
      operation.bundleId = data.bundleId;
    }

    if (data.poolId) {
      operation.poolId = data.poolId;
    }

    this.logChange({
      operationId,
      version: operation.version,
      action: 'status_updated',
      description: `Status changed from ${previousStatus} to ${status}`,
      timestamp,
      previousStatus,
      newStatus: status,
      data
    });

    this.emit('statusUpdated', { operationId, status, previousStatus, data });
  }

  /**
   * Create a checkpoint for rollback purposes
   * @param {string} operationId - Operation identifier
   * @param {string} description - Checkpoint description
   */
  createCheckpoint(operationId, description) {
    const operation = this.operations.get(operationId);
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    const checkpoint = {
      id: this.generateCheckpointId(),
      timestamp: new Date().toISOString(),
      description,
      operationState: JSON.parse(JSON.stringify(operation)),
      version: operation.version
    };

    operation.checkpoints.push(checkpoint);
    
    this.logChange({
      operationId,
      version: operation.version,
      action: 'checkpoint_created',
      description: `Checkpoint created: ${description}`,
      timestamp: checkpoint.timestamp,
      checkpointId: checkpoint.id
    });

    return checkpoint.id;
  }

  /**
   * Rollback operation to a specific checkpoint
   * @param {string} operationId - Operation identifier
   * @param {string} checkpointId - Checkpoint to rollback to
   */
  rollbackToCheckpoint(operationId, checkpointId) {
    const operation = this.operations.get(operationId);
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    const checkpoint = operation.checkpoints.find(cp => cp.id === checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }

    const currentState = JSON.parse(JSON.stringify(operation));
    const rollbackTimestamp = new Date().toISOString();

    // Store rollback history
    this.rollbackHistory.push({
      operationId,
      checkpointId,
      timestamp: rollbackTimestamp,
      previousState: currentState,
      restoredState: checkpoint.operationState
    });

    // Restore operation state
    const restoredOperation = { ...checkpoint.operationState };
    restoredOperation.lastRollback = {
      timestamp: rollbackTimestamp,
      checkpointId,
      reason: 'Manual rollback'
    };

    this.operations.set(operationId, restoredOperation);

    this.logChange({
      operationId,
      version: operation.version,
      action: 'rollback_executed',
      description: `Rolled back to checkpoint: ${checkpoint.description}`,
      timestamp: rollbackTimestamp,
      checkpointId
    });

    this.emit('rollbackExecuted', { operationId, checkpointId, timestamp: rollbackTimestamp });
    return restoredOperation;
  }

  /**
   * Get operation history and version information
   * @param {string} operationId - Operation identifier
   * @returns {Object} Complete operation history
   */
  getOperationHistory(operationId) {
    const operation = this.operations.get(operationId);
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    const changes = this.changeLog.filter(change => change.operationId === operationId);
    const rollbacks = this.rollbackHistory.filter(rb => rb.operationId === operationId);

    return {
      operation: { ...operation },
      changes,
      rollbacks,
      totalCheckpoints: operation.checkpoints.length,
      currentVersion: operation.version,
      createdAt: operation.timestamp,
      lastUpdated: operation.lastUpdated || operation.timestamp
    };
  }

  /**
   * Get all operations with filtering options
   * @param {Object} filters - Filter criteria
   * @returns {Array} Filtered operations
   */
  getOperations(filters = {}) {
    let operations = Array.from(this.operations.values());

    if (filters.status) {
      operations = operations.filter(op => op.status === filters.status);
    }

    if (filters.wallet) {
      operations = operations.filter(op => op.wallet === filters.wallet);
    }

    if (filters.dateFrom) {
      operations = operations.filter(op => new Date(op.timestamp) >= new Date(filters.dateFrom));
    }

    if (filters.dateTo) {
      operations = operations.filter(op => new Date(op.timestamp) <= new Date(filters.dateTo));
    }

    return operations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Generate comprehensive operation report
   * @param {string} operationId - Operation identifier
   * @returns {Object} Detailed operation report
   */
  generateOperationReport(operationId) {
    const history = this.getOperationHistory(operationId);
    const operation = history.operation;

    return {
      summary: {
        operationId,
        version: operation.version,
        status: operation.status,
        dex: operation.metadata.dex,
        mevProtected: operation.metadata.mevProtection,
        bundleEnabled: operation.metadata.bundleEnabled,
        duration: this.calculateOperationDuration(operation),
        success: operation.status === 'completed'
      },
      timeline: this.buildOperationTimeline(history.changes),
      checkpoints: operation.checkpoints.map(cp => ({
        id: cp.id,
        description: cp.description,
        timestamp: cp.timestamp
      })),
      rollbacks: history.rollbacks.length,
      configuration: operation.config,
      results: {
        poolId: operation.poolId,
        signatures: operation.signatures || [],
        bundleId: operation.bundleId
      }
    };
  }

  // Helper methods
  generateOperationId() {
    this.operationCounter++;
    return `LIQ_${Date.now()}_${this.operationCounter.toString().padStart(4, '0')}`;
  }

  generateVersion() {
    const [major, minor, patch] = this.currentVersion.split('.').map(Number);
    return `${major}.${minor}.${patch + 1}`;
  }

  generateCheckpointId() {
    return `CP_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  isMajorStatusChange(from, to) {
    const majorStatuses = ['initialized', 'validating', 'executing', 'completed', 'failed'];
    return majorStatuses.includes(from) && majorStatuses.includes(to) && from !== to;
  }

  logChange(change) {
    this.changeLog.push(change);
    // Keep only last 1000 changes to prevent memory issues
    if (this.changeLog.length > 1000) {
      this.changeLog = this.changeLog.slice(-1000);
    }
  }

  calculateOperationDuration(operation) {
    const start = new Date(operation.timestamp);
    const end = new Date(operation.lastUpdated || operation.timestamp);
    return Math.round((end - start) / 1000); // Duration in seconds
  }

  buildOperationTimeline(changes) {
    return changes.map(change => ({
      timestamp: change.timestamp,
      action: change.action,
      description: change.description
    })).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  /**
   * Export operation data for backup or analysis
   * @param {string} operationId - Operation identifier (optional)
   * @returns {Object} Exportable data
   */
  exportData(operationId = null) {
    if (operationId) {
      return this.getOperationHistory(operationId);
    }

    return {
      operations: Array.from(this.operations.values()),
      changeLog: this.changeLog,
      rollbackHistory: this.rollbackHistory,
      currentVersion: this.currentVersion,
      exportTimestamp: new Date().toISOString()
    };
  }

  /**
   * Clear old operations (cleanup)
   * @param {number} daysOld - Remove operations older than this many days
   */
  cleanup(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    let removedCount = 0;
    for (const [operationId, operation] of this.operations.entries()) {
      if (new Date(operation.timestamp) < cutoffDate) {
        this.operations.delete(operationId);
        this.versions.delete(operation.version);
        removedCount++;
      }
    }

    // Clean change log
    this.changeLog = this.changeLog.filter(
      change => new Date(change.timestamp) >= cutoffDate
    );

    // Clean rollback history
    this.rollbackHistory = this.rollbackHistory.filter(
      rollback => new Date(rollback.timestamp) >= cutoffDate
    );

    console.log(`Cleaned up ${removedCount} old operations`);
    return removedCount;
  }
}

// Create and export singleton instance
export const liquidityVersionControl = new LiquidityVersionControl();
export default liquidityVersionControl;