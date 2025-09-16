// Token Tracking Service
// Manages created tokens, saves contract addresses, and provides portfolio tracking
// Includes secure storage for sensitive information

import { getCurrentNetworkName } from './config.js';
import walletManager from './walletManager.js';

class TokenTrackingService {
  constructor() {
    this.storageKey = 'solana_created_tokens';
    this.portfolioKey = 'solana_token_portfolio';
    this.encryptionKey = 'solana_token_encryption';
    this.maxTokensPerWallet = 1000;
    
    // Initialize encryption key
    this.initializeEncryption();
  }

  /**
   * Initialize encryption for sensitive data
   */
  initializeEncryption() {
    try {
      let encKey = localStorage.getItem(this.encryptionKey);
      if (!encKey) {
        // Generate a simple encryption key (for basic obfuscation)
        encKey = this.generateEncryptionKey();
        localStorage.setItem(this.encryptionKey, encKey);
      }
      this.encKey = encKey;
    } catch (error) {
      console.error('Failed to initialize encryption:', error);
      this.encKey = 'default_key_' + Date.now();
    }
  }

  /**
   * Generate a simple encryption key
   */
  generateEncryptionKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Simple encryption for sensitive data (basic obfuscation)
   */
  encrypt(text) {
    try {
      const encoded = btoa(text + '|' + this.encKey);
      return encoded;
    } catch (error) {
      console.error('Encryption failed:', error);
      return text;
    }
  }

  /**
   * Simple decryption for sensitive data
   */
  decrypt(encryptedText) {
    try {
      const decoded = atob(encryptedText);
      const parts = decoded.split('|');
      if (parts.length === 2 && parts[1] === this.encKey) {
        return parts[0];
      }
      return null;
    } catch (error) {
      console.error('Decryption failed:', error);
      return null;
    }
  }

  /**
   * Save a newly created token
   */
  async saveCreatedToken(tokenInfo, transactionData = {}) {
    try {
      const walletAddress = walletManager.getPublicKey()?.toString();
      if (!walletAddress) {
        throw new Error('No wallet connected');
      }

      const network = getCurrentNetworkName();
      const tokenRecord = {
        // Basic token information
        mint: tokenInfo.mint,
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        decimals: tokenInfo.decimals || 9,
        supply: tokenInfo.supply || 0,
        
        // Creation metadata
        createdAt: Date.now(),
        createdBy: walletAddress,
        network: network,
        
        // Transaction information
        signature: transactionData.signature,
        explorerUrl: tokenInfo.explorerUrl,
        
        // Additional metadata
        description: tokenInfo.description || '',
        imageUrl: tokenInfo.imageUrl || '',
        websiteUrl: tokenInfo.websiteUrl || '',
        
        // Status tracking
        status: 'created',
        isActive: true,
        
        // Security
        id: this.generateTokenId(),
        version: '1.0'
      };

      // Encrypt sensitive information
      if (tokenInfo.privateKey) {
        tokenRecord.encryptedPrivateKey = this.encrypt(tokenInfo.privateKey);
      }

      // Save to storage
      await this.addTokenToStorage(tokenRecord, walletAddress, network);
      
      // Update portfolio
      await this.updatePortfolio(walletAddress, network);
      
      console.log('Token saved successfully:', tokenRecord.mint);
      
      // Emit event for UI updates
      this.emitTokenSavedEvent(tokenRecord);
      
      return {
        success: true,
        tokenId: tokenRecord.id,
        mint: tokenRecord.mint
      };
    } catch (error) {
      console.error('Failed to save token:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Add token to storage
   */
  async addTokenToStorage(tokenRecord, walletAddress, network) {
    const storageData = this.loadTokenStorage();
    
    // Initialize wallet data if needed
    if (!storageData[walletAddress]) {
      storageData[walletAddress] = {};
    }
    if (!storageData[walletAddress][network]) {
      storageData[walletAddress][network] = [];
    }

    // Check for duplicates
    const existingIndex = storageData[walletAddress][network].findIndex(
      token => token.mint === tokenRecord.mint
    );

    if (existingIndex >= 0) {
      // Update existing token
      storageData[walletAddress][network][existingIndex] = {
        ...storageData[walletAddress][network][existingIndex],
        ...tokenRecord,
        updatedAt: Date.now()
      };
    } else {
      // Add new token
      storageData[walletAddress][network].unshift(tokenRecord);
      
      // Limit number of tokens per wallet
      if (storageData[walletAddress][network].length > this.maxTokensPerWallet) {
        storageData[walletAddress][network] = storageData[walletAddress][network].slice(0, this.maxTokensPerWallet);
      }
    }

    // Save back to localStorage
    localStorage.setItem(this.storageKey, JSON.stringify(storageData));
  }

  /**
   * Load token storage data
   */
  loadTokenStorage() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('Failed to load token storage:', error);
      return {};
    }
  }

  /**
   * Get created tokens for current wallet
   */
  getCreatedTokens(walletAddress = null, network = null) {
    try {
      const currentWallet = walletAddress || walletManager.getPublicKey()?.toString();
      const currentNetwork = network || getCurrentNetworkName();
      
      if (!currentWallet) {
        return [];
      }

      const storageData = this.loadTokenStorage();
      const walletTokens = storageData[currentWallet]?.[currentNetwork] || [];
      
      // Sort by creation date (newest first)
      return walletTokens.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      console.error('Failed to get created tokens:', error);
      return [];
    }
  }

  /**
   * Get all tokens across all wallets and networks
   */
  getAllTokens() {
    try {
      const storageData = this.loadTokenStorage();
      const allTokens = [];
      
      Object.keys(storageData).forEach(walletAddress => {
        Object.keys(storageData[walletAddress]).forEach(network => {
          const tokens = storageData[walletAddress][network] || [];
          tokens.forEach(token => {
            allTokens.push({
              ...token,
              walletAddress,
              network
            });
          });
        });
      });
      
      return allTokens.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      console.error('Failed to get all tokens:', error);
      return [];
    }
  }

  /**
   * Get token by mint address
   */
  getTokenByMint(mintAddress, walletAddress = null, network = null) {
    try {
      const tokens = this.getCreatedTokens(walletAddress, network);
      return tokens.find(token => token.mint === mintAddress) || null;
    } catch (error) {
      console.error('Failed to get token by mint:', error);
      return null;
    }
  }

  /**
   * Update token information
   */
  async updateToken(mintAddress, updates, walletAddress = null, network = null) {
    try {
      const currentWallet = walletAddress || walletManager.getPublicKey()?.toString();
      const currentNetwork = network || getCurrentNetworkName();
      
      if (!currentWallet) {
        throw new Error('No wallet connected');
      }

      const storageData = this.loadTokenStorage();
      const walletTokens = storageData[currentWallet]?.[currentNetwork] || [];
      
      const tokenIndex = walletTokens.findIndex(token => token.mint === mintAddress);
      if (tokenIndex === -1) {
        throw new Error('Token not found');
      }

      // Update token
      walletTokens[tokenIndex] = {
        ...walletTokens[tokenIndex],
        ...updates,
        updatedAt: Date.now()
      };

      // Save back to storage
      storageData[currentWallet][currentNetwork] = walletTokens;
      localStorage.setItem(this.storageKey, JSON.stringify(storageData));
      
      return { success: true };
    } catch (error) {
      console.error('Failed to update token:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a token record
   */
  async deleteToken(mintAddress, walletAddress = null, network = null) {
    try {
      const currentWallet = walletAddress || walletManager.getPublicKey()?.toString();
      const currentNetwork = network || getCurrentNetworkName();
      
      if (!currentWallet) {
        throw new Error('No wallet connected');
      }

      const storageData = this.loadTokenStorage();
      const walletTokens = storageData[currentWallet]?.[currentNetwork] || [];
      
      const filteredTokens = walletTokens.filter(token => token.mint !== mintAddress);
      
      if (filteredTokens.length === walletTokens.length) {
        throw new Error('Token not found');
      }

      // Save filtered tokens back
      storageData[currentWallet][currentNetwork] = filteredTokens;
      localStorage.setItem(this.storageKey, JSON.stringify(storageData));
      
      return { success: true };
    } catch (error) {
      console.error('Failed to delete token:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update portfolio summary
   */
  async updatePortfolio(walletAddress, network) {
    try {
      const tokens = this.getCreatedTokens(walletAddress, network);
      const portfolio = {
        walletAddress,
        network,
        totalTokens: tokens.length,
        activeTokens: tokens.filter(t => t.isActive).length,
        lastUpdated: Date.now(),
        tokens: tokens.map(token => ({
          mint: token.mint,
          symbol: token.symbol,
          name: token.name,
          createdAt: token.createdAt,
          status: token.status
        }))
      };

      // Save portfolio summary
      const portfolioData = this.loadPortfolioData();
      const portfolioKey = `${walletAddress}_${network}`;
      portfolioData[portfolioKey] = portfolio;
      
      localStorage.setItem(this.portfolioKey, JSON.stringify(portfolioData));
    } catch (error) {
      console.error('Failed to update portfolio:', error);
    }
  }

  /**
   * Load portfolio data
   */
  loadPortfolioData() {
    try {
      const data = localStorage.getItem(this.portfolioKey);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('Failed to load portfolio data:', error);
      return {};
    }
  }

  /**
   * Get portfolio summary
   */
  getPortfolioSummary(walletAddress = null, network = null) {
    try {
      const currentWallet = walletAddress || walletManager.getPublicKey()?.toString();
      const currentNetwork = network || getCurrentNetworkName();
      
      if (!currentWallet) {
        return null;
      }

      const portfolioData = this.loadPortfolioData();
      const portfolioKey = `${currentWallet}_${currentNetwork}`;
      
      return portfolioData[portfolioKey] || null;
    } catch (error) {
      console.error('Failed to get portfolio summary:', error);
      return null;
    }
  }

  /**
   * Export tokens data
   */
  exportTokens(format = 'json') {
    try {
      const tokens = this.getCreatedTokens();
      
      if (format === 'csv') {
        return this.exportToCSV(tokens);
      }
      
      return JSON.stringify(tokens, null, 2);
    } catch (error) {
      console.error('Failed to export tokens:', error);
      return null;
    }
  }

  /**
   * Export to CSV format
   */
  exportToCSV(tokens) {
    const headers = ['Mint Address', 'Name', 'Symbol', 'Decimals', 'Supply', 'Created At', 'Network', 'Status'];
    const rows = tokens.map(token => [
      token.mint,
      token.name,
      token.symbol,
      token.decimals,
      token.supply,
      new Date(token.createdAt).toISOString(),
      token.network,
      token.status
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  /**
   * Clear all token data
   */
  clearAllData() {
    try {
      localStorage.removeItem(this.storageKey);
      localStorage.removeItem(this.portfolioKey);
      return { success: true };
    } catch (error) {
      console.error('Failed to clear token data:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate unique token ID
   */
  generateTokenId() {
    return 'token_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
  }

  /**
   * Emit token saved event
   */
  emitTokenSavedEvent(tokenRecord) {
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('tokenSaved', { detail: tokenRecord });
      window.dispatchEvent(event);
    }
  }

  /**
   * Get storage statistics
   */
  getStorageStats() {
    try {
      const storageData = this.loadTokenStorage();
      const portfolioData = this.loadPortfolioData();
      
      let totalTokens = 0;
      let totalWallets = 0;
      let totalNetworks = 0;
      
      Object.keys(storageData).forEach(wallet => {
        totalWallets++;
        Object.keys(storageData[wallet]).forEach(network => {
          totalNetworks++;
          totalTokens += storageData[wallet][network].length;
        });
      });
      
      return {
        totalTokens,
        totalWallets,
        totalNetworks: new Set(Object.values(storageData).flatMap(wallet => Object.keys(wallet))).size,
        storageSize: JSON.stringify(storageData).length,
        portfolioSize: JSON.stringify(portfolioData).length
      };
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      return null;
    }
  }
}

// Create and export singleton instance
export const tokenTrackingService = new TokenTrackingService();
export default tokenTrackingService;