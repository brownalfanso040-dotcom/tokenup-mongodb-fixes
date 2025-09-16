// Wallet Persistence Service
// Handles wallet connection persistence across page reloads
// Maintains connection state until explicit disconnect

import walletManager from './walletManager.js';
import { getCurrentNetworkName } from './config.js';

class WalletPersistenceService {
  constructor() {
    this.storageKey = 'solana_wallet_state';
    this.connectionKey = 'solana_wallet_connection';
    this.autoReconnectEnabled = true;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    
    // Initialize on construction
    this.initialize();
  }

  /**
   * Initialize the persistence service
   */
  initialize() {
    // Listen for wallet events
    this.setupEventListeners();
    
    // Attempt auto-reconnect on page load
    this.attemptAutoReconnect();
  }

  /**
   * Setup event listeners for wallet state changes
   */
  setupEventListeners() {
    // Listen for wallet connection events
    walletManager.on('connect', (data) => {
      this.saveWalletState(data);
    });

    // Listen for wallet disconnection events
    walletManager.on('disconnect', () => {
      this.clearWalletState();
    });

    // Listen for page unload to save state
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.saveCurrentState();
      });

      // Listen for page visibility changes
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this.autoReconnectEnabled) {
          this.checkAndReconnect();
        }
      });
    }
  }

  /**
   * Save wallet connection state to localStorage
   */
  saveWalletState(walletData) {
    try {
      const state = {
        isConnected: true,
        walletType: walletData.walletType || 'phantom',
        publicKey: walletData.publicKey,
        network: getCurrentNetworkName(),
        timestamp: Date.now(),
        sessionId: this.generateSessionId()
      };

      localStorage.setItem(this.storageKey, JSON.stringify(state));
      localStorage.setItem(this.connectionKey, 'true');
      
      console.log('Wallet state saved:', state);
    } catch (error) {
      console.error('Failed to save wallet state:', error);
    }
  }

  /**
   * Load wallet state from localStorage
   */
  loadWalletState() {
    try {
      const stateStr = localStorage.getItem(this.storageKey);
      const connectionStr = localStorage.getItem(this.connectionKey);
      
      if (!stateStr || connectionStr !== 'true') {
        return null;
      }

      const state = JSON.parse(stateStr);
      
      // Check if state is not too old (24 hours)
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      if (Date.now() - state.timestamp > maxAge) {
        this.clearWalletState();
        return null;
      }

      return state;
    } catch (error) {
      console.error('Failed to load wallet state:', error);
      return null;
    }
  }

  /**
   * Clear wallet state from localStorage
   */
  clearWalletState() {
    try {
      localStorage.removeItem(this.storageKey);
      localStorage.removeItem(this.connectionKey);
      localStorage.removeItem('selectedWallet'); // Clear legacy key
      console.log('Wallet state cleared');
    } catch (error) {
      console.error('Failed to clear wallet state:', error);
    }
  }

  /**
   * Save current wallet state if connected
   */
  saveCurrentState() {
    if (walletManager.isWalletConnected()) {
      const walletData = {
        walletType: localStorage.getItem('selectedWallet') || 'phantom',
        publicKey: walletManager.getPublicKey()?.toString()
      };
      this.saveWalletState(walletData);
    }
  }

  /**
   * Attempt to auto-reconnect wallet on page load
   */
  async attemptAutoReconnect() {
    console.log('🚫 Auto-reconnect disabled - wallet popup will always appear');
    console.log('💡 Users must manually connect for security');
    
    // Clear any saved wallet state to force fresh connection
    this.clearWalletState();
    
    // Always return without attempting reconnection
    return;
  }

  /**
   * Check connection and attempt reconnect if needed
   */
  async checkAndReconnect() {
    const savedState = this.loadWalletState();
    
    if (savedState && savedState.isConnected && !walletManager.isWalletConnected()) {
      await this.attemptAutoReconnect();
    }
  }

  /**
   * Handle reconnection failure
   */
  handleReconnectFailure() {
    this.reconnectAttempts++;
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached, clearing state');
      this.clearWalletState();
      this.emitReconnectEvent({ success: false, maxAttemptsReached: true });
    }
  }

  /**
   * Emit reconnect event for UI updates
   */
  emitReconnectEvent(data) {
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('walletReconnect', { detail: data });
      window.dispatchEvent(event);
    }
  }

  /**
   * Generate a unique session ID
   */
  generateSessionId() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * Check if wallet should persist
   */
  shouldPersist() {
    const savedState = this.loadWalletState();
    return savedState && savedState.isConnected;
  }

  /**
   * Manually disconnect and clear persistence
   */
  async disconnect() {
    try {
      await walletManager.disconnectWallet();
      this.clearWalletState();
      return { success: true };
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Enable/disable auto-reconnect
   */
  setAutoReconnect(enabled) {
    this.autoReconnectEnabled = enabled;
  }

  /**
   * Get current persistence status
   */
  getStatus() {
    const savedState = this.loadWalletState();
    return {
      isPersisted: !!savedState,
      isConnected: walletManager.isWalletConnected(),
      autoReconnectEnabled: this.autoReconnectEnabled,
      reconnectAttempts: this.reconnectAttempts,
      savedState: savedState
    };
  }

  /**
   * Utility sleep function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Create and export singleton instance
export const walletPersistenceService = new WalletPersistenceService();
export default walletPersistenceService;