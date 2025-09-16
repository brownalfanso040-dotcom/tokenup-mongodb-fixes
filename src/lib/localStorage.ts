export interface LaunchedToken {
  id: string;
  name: string;
  symbol: string;
  supply: number;
  decimals: number;
  mintAddress: string;
  transactionSignature: string;
  network: string;
  timestamp: string;
  status: 'completed' | 'pending' | 'failed';
  logoUrl?: string;
  description?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  metadataUri?: string;
  explorerUrl: string;
}

const STORAGE_KEY = 'tokenup_launched_tokens';
const BACKUP_KEY = 'tokenup_backup_tokens';

export class TokenStorage {
  // Save a new token to local storage
  static saveToken(tokenData: LaunchedToken): void {
    try {
      console.log('Saving token to localStorage:', tokenData);
      const existingTokens = this.getAllTokens();
      console.log('Existing tokens before save:', existingTokens.length);
      const updatedTokens = [tokenData, ...existingTokens];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedTokens));
      console.log('Token saved successfully. Total tokens:', updatedTokens.length);
      
      // Also save to a backup file for persistence
      this.saveToFile(updatedTokens);
      
      // Create auto-backup
      this.createAutoBackup();
    } catch (error) {
      console.error('Error saving token to localStorage:', error);
    }
  }

  // Get all saved tokens
  static getAllTokens(): LaunchedToken[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      console.log('Raw localStorage data:', stored);
      const tokens = stored ? JSON.parse(stored) : [];
      console.log('Parsed tokens from localStorage:', tokens);
      return tokens;
    } catch (error) {
      console.error('Error retrieving tokens from localStorage:', error);
      return [];
    }
  }

  // Get tokens by network
  static getTokensByNetwork(network: string): LaunchedToken[] {
    return this.getAllTokens().filter(token => token.network === network);
  }

  // Get a specific token by mint address
  static getTokenByMintAddress(mintAddress: string): LaunchedToken | null {
    const tokens = this.getAllTokens();
    return tokens.find(token => token.mintAddress === mintAddress) || null;
  }

  // Update token status
  static updateTokenStatus(mintAddress: string, status: LaunchedToken['status']): void {
    try {
      const tokens = this.getAllTokens();
      const tokenIndex = tokens.findIndex(token => token.mintAddress === mintAddress);
      
      if (tokenIndex !== -1) {
        tokens[tokenIndex].status = status;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
        this.saveToFile(tokens);
      }
    } catch (error) {
      console.error('Error updating token status:', error);
    }
  }

  // Delete a token
  static deleteToken(mintAddress: string): void {
    try {
      const tokens = this.getAllTokens();
      const filteredTokens = tokens.filter(token => token.mintAddress !== mintAddress);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filteredTokens));
      this.saveToFile(filteredTokens);
    } catch (error) {
      console.error('Error deleting token:', error);
    }
  }

  // Clear all tokens
  static clearAllTokens(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
      this.saveToFile([]);
    } catch (error) {
      console.error('Error clearing tokens:', error);
    }
  }

  // Export tokens as JSON
  static exportTokens(): string {
    const tokens = this.getAllTokens();
    return JSON.stringify(tokens, null, 2);
  }

  // Import tokens from JSON
  static importTokens(jsonData: string): boolean {
    try {
      const tokens = JSON.parse(jsonData) as LaunchedToken[];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
      this.saveToFile(tokens);
      return true;
    } catch (error) {
      console.error('Error importing tokens:', error);
      return false;
    }
  }

  // Save to local file for persistence (browser download)
  private static saveToFile(tokens: LaunchedToken[]): void {
    try {
      // Create a backup file that can be downloaded
      const dataStr = JSON.stringify(tokens, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      
      // Store the blob URL for potential download
      const url = URL.createObjectURL(dataBlob);
      
      // Save to sessionStorage for potential recovery
      sessionStorage.setItem('tokenup_backup', dataStr);
      
      // Clean up the URL after a delay
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('Error creating backup file:', error);
    }
  }

  // Download backup file
  static downloadBackup(): void {
    try {
      const tokens = this.getAllTokens();
      const dataStr = JSON.stringify(tokens, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `tokenup-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading backup:', error);
    }
  }

  // Get a specific token by ID
  static getToken(id: string): LaunchedToken | null {
    const tokens = this.getAllTokens();
    return tokens.find(token => token.id === id) || null;
  }

  // Export all tokens to a JSON file
  static exportToFile(): void {
    try {
      const tokens = this.getAllTokens();
      const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        totalTokens: tokens.length,
        tokens: tokens
      };
      
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(dataBlob);
      link.download = `tokenup-tokens-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log('Tokens exported successfully');
    } catch (error) {
      console.error('Error exporting tokens:', error);
    }
  }

  // Import tokens from a JSON file
  static importFromFile(file: File): Promise<{ success: boolean; imported: number; skipped: number; error?: string }> {
    return new Promise((resolve) => {
      try {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const content = e.target?.result as string;
            const data = JSON.parse(content);
            
            // Handle both old format (array) and new format (object with tokens array)
            const tokens = Array.isArray(data) ? data : data.tokens || [];
            
            if (!Array.isArray(tokens)) {
              resolve({ success: false, imported: 0, skipped: 0, error: 'Invalid file format' });
              return;
            }

            let imported = 0;
            let skipped = 0;

            tokens.forEach((token: LaunchedToken) => {
              // Validate token structure
              if (token.id && token.name && token.symbol && token.mintAddress) {
                const existingToken = this.getToken(token.id);
                if (!existingToken) {
                  this.saveToken(token);
                  imported++;
                } else {
                  skipped++;
                }
              } else {
                skipped++;
              }
            });

            resolve({ success: true, imported, skipped });
          } catch (parseError) {
            resolve({ success: false, imported: 0, skipped: 0, error: 'Invalid JSON format' });
          }
        };

        reader.onerror = () => {
          resolve({ success: false, imported: 0, skipped: 0, error: 'Failed to read file' });
        };

        reader.readAsText(file);
      } catch (error) {
        resolve({ success: false, imported: 0, skipped: 0, error: 'Unexpected error occurred' });
      }
    });
  }

  // Auto-backup functionality - saves to localStorage with timestamp
  static createAutoBackup(): void {
    try {
      const tokens = this.getAllTokens();
      const backupData = {
        version: '1.0',
        backupDate: new Date().toISOString(),
        totalTokens: tokens.length,
        tokens: tokens
      };
      
      localStorage.setItem(BACKUP_KEY, JSON.stringify(backupData));
      console.log('Auto-backup created successfully');
    } catch (error) {
      console.error('Error creating auto-backup:', error);
    }
  }

  // Restore from auto-backup
  static restoreFromBackup(): { success: boolean; restored: number; error?: string } {
    try {
      const backupData = localStorage.getItem(BACKUP_KEY);
      if (!backupData) {
        return { success: false, restored: 0, error: 'No backup found' };
      }

      const data = JSON.parse(backupData);
      const tokens = data.tokens || [];
      
      // Clear current data and restore from backup
      localStorage.removeItem(STORAGE_KEY);
      
      let restored = 0;
      tokens.forEach((token: LaunchedToken) => {
        this.saveToken(token);
        restored++;
      });

      return { success: true, restored };
    } catch (error) {
      return { success: false, restored: 0, error: 'Failed to restore from backup' };
    }
  }

  // Get statistics
  static getStats(): {
    totalTokens: number;
    completedTokens: number;
    networks: { [key: string]: number };
    recentTokens: LaunchedToken[];
  } {
    const tokens = this.getAllTokens();
    const completedTokens = tokens.filter(token => token.status === 'completed');
    const networks: { [key: string]: number } = {};
    
    tokens.forEach(token => {
      networks[token.network] = (networks[token.network] || 0) + 1;
    });

    return {
      totalTokens: tokens.length,
      completedTokens: completedTokens.length,
      networks,
      recentTokens: tokens.slice(0, 5)
    };
  }
}