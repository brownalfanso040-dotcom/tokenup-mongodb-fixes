// Multi-Wallet Management System
// Note: Using global window.solanaWeb3 from CDN instead of ES6 imports

// Function to get Solana Web3.js from global scope safely
function getSolanaWeb3() {
    if (typeof window !== 'undefined' && window.solanaWeb3) {
        return window.solanaWeb3;
    }
    throw new Error('Solana Web3.js not available. Please ensure it is loaded.');
}

// Get Solana Web3.js components when needed
function getWeb3Components() {
    console.log('🔍 Getting Web3 components...');
    const solanaWeb3 = getSolanaWeb3();
    console.log('🔍 solanaWeb3 available:', !!solanaWeb3);
    
    if (!solanaWeb3) {
        console.error('❌ Solana Web3.js not available in getWeb3Components');
        throw new Error('Solana Web3.js not available');
    }
    
    console.log('🔍 solanaWeb3.Keypair available:', !!solanaWeb3.Keypair);
    console.log('🔍 solanaWeb3.PublicKey available:', !!solanaWeb3.PublicKey);
    
    const components = {
        Keypair: solanaWeb3.Keypair,
        PublicKey: solanaWeb3.PublicKey,
        Connection: solanaWeb3.Connection
    };
    
    console.log('✅ Web3 components retrieved successfully');
    return components;
}

/**
 * Multi-Wallet Manager for creating, importing, and managing multiple wallets
 */
class MultiWalletManager {
    constructor() {
        this.wallets = new Map();
        this.activeWallet = null;
        this.connection = null;
        this.storageKey = 'multiWalletManager';
        this.storagePath = null; // For future file system storage
        this.loadWalletsFromStorage();
    }

    /**
     * Initialize connection
     * @param {Connection} connection - Solana connection
     */
    setConnection(connection) {
        this.connection = connection;
    }

    /**
     * Create a new wallet
     * @param {string} name - Wallet name
     * @returns {Object} Wallet info
     */
    createWallet(name) {
        try {
            const { Keypair } = getWeb3Components();
            const keypair = Keypair.generate();
            const walletInfo = {
                id: this.generateWalletId(),
                name: name || `Wallet ${this.wallets.size + 1}`,
                publicKey: keypair.publicKey.toString(),
                privateKey: this.encodePrivateKey(keypair.secretKey),
                balance: 0,
                tokens: [],
                created: Date.now()
            };

            this.wallets.set(walletInfo.id, walletInfo);
            this.saveWalletsToStorage();
            
            console.log(`✅ Created new wallet: ${walletInfo.name}`);
            return walletInfo;
        } catch (error) {
            console.error('Error creating wallet:', error);
            throw new Error('Failed to create wallet: ' + error.message);
        }
    }

    /**
     * Import wallet from private key
     * @param {string} privateKeyString - Private key as base58 or array
     * @param {string} name - Wallet name
     * @returns {Object} Wallet info
     */
    importWallet(privateKeyString, name) {
        try {
            const { Keypair } = getWeb3Components();
            let secretKey;
            
            // Handle different private key formats
            if (privateKeyString.startsWith('[') && privateKeyString.endsWith(']')) {
                // Array format: [1,2,3,...]
                secretKey = new Uint8Array(JSON.parse(privateKeyString));
            } else if (privateKeyString.includes(',')) {
                // Comma-separated format: 1,2,3,...
                secretKey = new Uint8Array(privateKeyString.split(',').map(n => parseInt(n.trim())));
            } else {
                // Base58 format (most common wallet format)
                try {
                    // Try to decode as base58 using Solana's built-in decoder
                    const bs58 = window.solanaWeb3.bs58 || window.bs58;
                    if (bs58) {
                        secretKey = bs58.decode(privateKeyString);
                    } else {
                        // Fallback: try to parse as base58 manually
                        secretKey = Keypair.fromSecretKey(new Uint8Array(Buffer.from(privateKeyString, 'base64'))).secretKey;
                    }
                } catch (base58Error) {
                    // If base58 fails, try as hex
                    try {
                        secretKey = new Uint8Array(privateKeyString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
                    } catch (hexError) {
                        throw new Error('Invalid private key format. Supported formats: base58, array [1,2,3,...], comma-separated 1,2,3,..., or hex');
                    }
                }
            }

            const keypair = Keypair.fromSecretKey(secretKey);
            const walletInfo = {
                id: this.generateWalletId(),
                name: name || `Imported Wallet ${this.wallets.size + 1}`,
                publicKey: keypair.publicKey.toString(),
                privateKey: this.encodePrivateKey(keypair.secretKey),
                balance: 0,
                tokens: [],
                created: Date.now(),
                imported: true
            };

            this.wallets.set(walletInfo.id, walletInfo);
            this.saveWalletsToStorage();
            
            console.log(`✅ Imported wallet: ${walletInfo.name}`);
            return walletInfo;
        } catch (error) {
            console.error('Error importing wallet:', error);
            throw new Error('Invalid private key format');
        }
    }

    /**
     * Encode private key as base58 string
     * @param {Uint8Array} secretKey - Secret key bytes
     * @returns {string} Base58 encoded private key
     */
    encodePrivateKey(secretKey) {
        try {
            // Try to use Solana's built-in base58 encoder
            const bs58 = window.solanaWeb3.bs58 || window.bs58;
            if (bs58) {
                return bs58.encode(secretKey);
            } else {
                // Fallback: convert to base64 for now
                return Buffer.from(secretKey).toString('base64');
            }
        } catch (error) {
            // Final fallback: store as JSON array string
            return JSON.stringify(Array.from(secretKey));
        }
    }

    /**
     * Decode private key from string
     * @param {string} privateKeyString - Private key as string
     * @returns {Uint8Array} Secret key bytes
     */
    decodePrivateKey(privateKeyString) {
        try {
            // Handle different formats
            if (privateKeyString.startsWith('[') && privateKeyString.endsWith(']')) {
                // Array format: [1,2,3,...]
                return new Uint8Array(JSON.parse(privateKeyString));
            } else if (privateKeyString.includes(',')) {
                // Comma-separated format: 1,2,3,...
                return new Uint8Array(privateKeyString.split(',').map(n => parseInt(n.trim())));
            } else {
                // Base58 or base64 format
                try {
                    const bs58 = window.solanaWeb3.bs58 || window.bs58;
                    if (bs58) {
                        return bs58.decode(privateKeyString);
                    } else {
                        // Try base64
                        return new Uint8Array(Buffer.from(privateKeyString, 'base64'));
                    }
                } catch (decodeError) {
                    // Try hex format
                    return new Uint8Array(privateKeyString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
                }
            }
        } catch (error) {
            throw new Error('Invalid private key format');
        }
    }

    /**
     * Get wallet keypair
     * @param {string} walletId - Wallet ID
     * @returns {Keypair} Solana keypair
     */
    getKeypair(walletId) {
        try {
            const { Keypair } = getWeb3Components();
            const wallet = this.wallets.get(walletId);
            if (!wallet) {
                throw new Error('Wallet not found');
            }
            
            // Handle both old array format and new string format
            let secretKey;
            if (Array.isArray(wallet.privateKey)) {
                // Legacy format: array of numbers
                secretKey = new Uint8Array(wallet.privateKey);
            } else {
                // New format: string
                secretKey = this.decodePrivateKey(wallet.privateKey);
            }
            
            return Keypair.fromSecretKey(secretKey);
        } catch (error) {
            console.error('Error getting keypair:', error);
            throw new Error('Failed to get keypair: ' + error.message);
        }
    }

    /**
     * Get all wallets
     * @returns {Array} Array of wallet info
     */
    getAllWallets() {
        return Array.from(this.wallets.values());
    }

    /**
     * Get wallet by ID
     * @param {string} walletId - Wallet ID
     * @returns {Object} Wallet info
     */
    getWallet(walletId) {
        return this.wallets.get(walletId);
    }

    /**
     * Set active wallet
     * @param {string} walletId - Wallet ID
     */
    setActiveWallet(walletId) {
        const wallet = this.wallets.get(walletId);
        if (!wallet) {
            throw new Error('Wallet not found');
        }
        this.activeWallet = walletId;
        console.log(`🔄 Switched to wallet: ${wallet.name}`);
    }

    /**
     * Get active wallet
     * @returns {Object} Active wallet info
     */
    getActiveWallet() {
        if (!this.activeWallet) {
            return null;
        }
        return this.wallets.get(this.activeWallet);
    }

    /**
     * Update wallet balance
     * @param {string} walletId - Wallet ID
     */
    async updateWalletBalance(walletId) {
        if (!this.connection) {
            throw new Error('Connection not initialized');
        }

        const wallet = this.wallets.get(walletId);
        if (!wallet) {
            throw new Error('Wallet not found');
        }

        try {
            const { PublicKey } = getWeb3Components();
            const publicKey = new PublicKey(wallet.publicKey);
            const balance = await this.connection.getBalance(publicKey);
            wallet.balance = balance / 1e9; // Convert to SOL
            
            // Update token balances
            await this.updateTokenBalances(walletId);
            
            this.saveWalletsToStorage();
            return wallet.balance;
        } catch (error) {
            console.error(`Error updating balance for wallet ${wallet.name}:`, error);
            throw error;
        }
    }

    /**
     * Update token balances for wallet
     * @param {string} walletId - Wallet ID
     */
    async updateTokenBalances(walletId) {
        if (!this.connection) {
            return;
        }

        const wallet = this.wallets.get(walletId);
        if (!wallet) {
            return;
        }

        try {
            const publicKey = new PublicKey(wallet.publicKey);
            const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
                publicKey,
                { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
            );

            wallet.tokens = tokenAccounts.value
                .filter(account => account.account.data.parsed.info.tokenAmount.uiAmount > 0)
                .map(account => {
                    const info = account.account.data.parsed.info;
                    return {
                        mint: info.mint,
                        balance: info.tokenAmount.uiAmount,
                        decimals: info.tokenAmount.decimals,
                        account: account.pubkey.toString()
                    };
                });
        } catch (error) {
            console.error(`Error updating token balances for wallet ${wallet.name}:`, error);
        }
    }

    /**
     * Delete wallet
     * @param {string} walletId - Wallet ID
     */
    deleteWallet(walletId) {
        const wallet = this.wallets.get(walletId);
        if (!wallet) {
            throw new Error('Wallet not found');
        }

        this.wallets.delete(walletId);
        
        // If this was the active wallet, clear it
        if (this.activeWallet === walletId) {
            this.activeWallet = null;
        }
        
        this.saveWalletsToStorage();
        console.log(`🗑️ Deleted wallet: ${wallet.name}`);
    }

    /**
     * Export wallet private key
     * @param {string} walletId - Wallet ID
     * @param {string} format - Export format ('array', 'base58', or 'string')
     * @returns {string} Private key
     */
    exportPrivateKey(walletId, format = 'array') {
        const wallet = this.wallets.get(walletId);
        if (!wallet) {
            throw new Error('Wallet not found');
        }

        // Handle both old array format and new string format
        let secretKey;
        if (Array.isArray(wallet.privateKey)) {
            // Legacy format: array of numbers
            secretKey = new Uint8Array(wallet.privateKey);
        } else {
            // New format: string - decode it first
            secretKey = this.decodePrivateKey(wallet.privateKey);
        }

        if (format === 'base58') {
            try {
                const bs58 = window.solanaWeb3.bs58 || window.bs58;
                if (bs58) {
                    return bs58.encode(secretKey);
                } else {
                    return Buffer.from(secretKey).toString('base64');
                }
            } catch (error) {
                return JSON.stringify(Array.from(secretKey));
            }
        } else if (format === 'string') {
            // Return the stored string format
            return Array.isArray(wallet.privateKey) ? JSON.stringify(wallet.privateKey) : wallet.privateKey;
        } else {
            // Default array format
            return JSON.stringify(Array.from(secretKey));
        }
    }

    /**
     * Generate unique wallet ID
     * @returns {string} Wallet ID
     */
    generateWalletId() {
        return 'wallet_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Set custom storage path for wallet files
     * @param {string} path - Storage path (for future file system implementation)
     */
    setStoragePath(path) {
        this.storagePath = path;
        console.log(`📁 Storage path set to: ${path}`);
    }

    /**
     * Get current storage path
     * @returns {string} Current storage path or default
     */
    getStoragePath() {
        return this.storagePath || 'C:\\Users\\user\\Desktop\\spl-token-creator\\wallets';
    }

    /**
     * Save wallets to localStorage (and optionally to file system)
     */
    saveWalletsToStorage() {
        try {
            const walletsData = {
                wallets: Object.fromEntries(this.wallets),
                activeWallet: this.activeWallet,
                storagePath: this.storagePath,
                lastSaved: Date.now()
            };
            
            // Save to localStorage
            localStorage.setItem(this.storageKey, JSON.stringify(walletsData));
            
            // Log storage info
            console.log(`💾 Wallets saved to localStorage (${this.wallets.size} wallets)`);
            console.log(`📁 Configured storage path: ${this.getStoragePath()}`);
            
        } catch (error) {
            console.error('Error saving wallets to storage:', error);
        }
    }

    /**
     * Load wallets from localStorage
     */
    loadWalletsFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const walletsData = JSON.parse(stored);
                this.wallets = new Map(Object.entries(walletsData.wallets || {}));
                this.activeWallet = walletsData.activeWallet;
                this.storagePath = walletsData.storagePath;
                
                console.log(`📂 Loaded ${this.wallets.size} wallets from storage`);
                console.log(`📁 Storage path: ${this.getStoragePath()}`);
            } else {
                console.log('📂 No existing wallets found in storage');
            }
        } catch (error) {
            console.error('Error loading wallets from storage:', error);
            this.wallets = new Map();
            this.activeWallet = null;
        }
    }

    /**
     * Export wallet data for backup
     * @returns {Object} Complete wallet data
     */
    exportWalletData() {
        const walletsData = {
            wallets: Object.fromEntries(this.wallets),
            activeWallet: this.activeWallet,
            storagePath: this.storagePath,
            exportedAt: Date.now(),
            version: '1.0'
        };
        return walletsData;
    }

    /**
     * Import wallet data from backup
     * @param {Object} walletsData - Wallet data to import
     */
    importWalletData(walletsData) {
        try {
            this.wallets = new Map(Object.entries(walletsData.wallets || {}));
            this.activeWallet = walletsData.activeWallet;
            this.storagePath = walletsData.storagePath;
            this.saveWalletsToStorage();
            console.log(`📥 Imported ${this.wallets.size} wallets`);
        } catch (error) {
            console.error('Error importing wallet data:', error);
            throw new Error('Failed to import wallet data: ' + error.message);
        }
    }

    /**
     * Clear all wallets (use with caution)
     */
    clearAllWallets() {
        this.wallets.clear();
        this.activeWallet = null;
        localStorage.removeItem(this.storageKey);
        console.log('🧹 Cleared all wallets');
    }
}

// Create singleton instance
const multiWalletManager = new MultiWalletManager();
export default multiWalletManager;