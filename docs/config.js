// Solana Network Configuration
// Using global window.solanaWeb3 instead of ES6 imports for browser compatibility

// Browser-compatible clusterApiUrl function
function clusterApiUrl(cluster) {
  const urls = {
    'mainnet-beta': 'https://api.mainnet-beta.solana.com',
    'devnet': 'https://api.devnet.solana.com',
    'testnet': 'https://api.testnet.solana.com'
  };
  return urls[cluster] || urls['devnet'];
}

// Network configurations
export const NETWORKS = {
  mainnet: {
    name: 'Mainnet Beta',
    url: (typeof window !== 'undefined' && window.env?.SOLANA_MAINNET_RPC_URL) || clusterApiUrl('mainnet-beta'),
    rpcUrl: (typeof window !== 'undefined' && window.env?.SOLANA_MAINNET_RPC_URL) || clusterApiUrl('mainnet-beta'),
    explorerUrl: 'https://explorer.solana.com',
    commitment: 'confirmed'
  },
  'mainnet-beta': {
    name: 'Mainnet Beta',
    url: (typeof window !== 'undefined' && window.env?.SOLANA_MAINNET_RPC_URL) || clusterApiUrl('mainnet-beta'),
    rpcUrl: (typeof window !== 'undefined' && window.env?.SOLANA_MAINNET_RPC_URL) || clusterApiUrl('mainnet-beta'),
    explorerUrl: 'https://explorer.solana.com',
    commitment: 'confirmed'
  },
  devnet: {
    name: 'Devnet',
    url: (typeof window !== 'undefined' && window.env?.SOLANA_DEVNET_RPC_URL) || clusterApiUrl('devnet'),
    rpcUrl: (typeof window !== 'undefined' && window.env?.SOLANA_DEVNET_RPC_URL) || clusterApiUrl('devnet'),
    explorerUrl: 'https://explorer.solana.com/?cluster=devnet',
    commitment: 'confirmed'
  },
  testnet: {
    name: 'Testnet',
    url: (typeof window !== 'undefined' && window.env?.SOLANA_TESTNET_RPC_URL) || clusterApiUrl('testnet'),
    rpcUrl: (typeof window !== 'undefined' && window.env?.SOLANA_TESTNET_RPC_URL) || clusterApiUrl('testnet'),
    explorerUrl: 'https://explorer.solana.com/?cluster=testnet',
    commitment: 'confirmed'
  },
  localhost: {
    name: 'Localhost',
    url: 'http://127.0.0.1:8899',
    rpcUrl: 'http://127.0.0.1:8899',
    explorerUrl: 'https://explorer.solana.com/?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899',
    commitment: 'confirmed'
  }
};

// Default network (can be changed based on environment)
export const DEFAULT_NETWORK = (typeof window !== 'undefined' && window.env?.DEFAULT_NETWORK) || 'devnet';

// Current network state
let currentNetwork = DEFAULT_NETWORK;

// Get current network configuration
export function getCurrentNetwork() {
  return NETWORKS[currentNetwork];
}

// Set current network
export function setCurrentNetwork(networkName) {
  if (NETWORKS[networkName]) {
    currentNetwork = networkName;
    return true;
  }
  return false;
}

// Get network name
export function getCurrentNetworkName() {
  return currentNetwork;
}

// Note: All fees have been removed for complete transparency
// Token creation now operates without any additional charges

// Fee constants (all set to 0 for transparency)
export const FEES = {
  tokenCreation: 0,
  metadataCreation: 0,
  associatedTokenAccount: 0,
  transactionFee: 0
};

// Default token decimals
export const DEFAULT_DECIMALS = 9;

// Maximum supply (for UI validation)
export const MAX_SUPPLY = 1000000000000; // 1 trillion

// Supported wallets
export const SUPPORTED_WALLETS = [
  {
    name: 'Phantom',
    key: 'phantom',
    icon: '👻',
    adapter: 'PhantomWalletAdapter'
  },
  {
    name: 'Solflare',
    key: 'solflare',
    icon: '🔥',
    adapter: 'SolflareWalletAdapter'
  },
  {
    name: 'Backpack',
    key: 'backpack',
    icon: '🎒',
    adapter: 'BackpackWalletAdapter'
  },
  {
    name: 'Sollet',
    key: 'sollet',
    icon: '💼',
    adapter: 'SolletWalletAdapter'
  },
  {
    name: 'Ledger',
    key: 'ledger',
    icon: '🔐',
    adapter: 'LedgerWalletAdapter'
  }
];

// Jito Bundle Configuration
export const JITO_CONFIG = {
  mainnet: {
    blockEngineUrl: (typeof window !== 'undefined' && window.env?.JITO_MAINNET_BLOCK_ENGINE_URL) || 'https://mainnet.block-engine.jito.wtf',
    tipAccount: (typeof window !== 'undefined' && window.env?.JITO_MAINNET_TIP_ACCOUNT) || '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
    enabled: true
  },
  testnet: {
    blockEngineUrl: (typeof window !== 'undefined' && window.env?.JITO_TESTNET_BLOCK_ENGINE_URL) || 'https://testnet.block-engine.jito.wtf',
    tipAccount: (typeof window !== 'undefined' && window.env?.JITO_TESTNET_TIP_ACCOUNT) || 'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
    enabled: true
  },
  devnet: {
    blockEngineUrl: null, // Jito doesn't support devnet
    tipAccount: null,
    enabled: false
  },
  // Common settings
  authKeypair: null, // Should be set from environment variables
  defaultTipLamports: 0, // No tips - completely free service
  maxBundleSize: 5,
  retryAttempts: 3,
  retryDelay: 1000
};

// Get Jito configuration for current network
export function getJitoConfig(network = currentNetwork) {
  const networkKey = network === 'mainnet-beta' ? 'mainnet' : network;
  return JITO_CONFIG[networkKey] || JITO_CONFIG.devnet;
}

// Bundle operation types
export const BUNDLE_OPERATIONS = {
  TOKEN_CREATION: 'token_creation',
  LIQUIDITY_POOL: 'liquidity_pool',
  METADATA_UPDATE: 'metadata_update',
  AUTHORITY_REVOKE: 'authority_revoke'
};

// Metadata service configuration
export const METADATA_CONFIG = {
  // IPFS Configuration
  ipfs: {
    enabled: false, // Set to true when API keys are configured
    pinataEndpoint: 'https://api.pinata.cloud/pinning/pinFileToIPFS',
    pinataGateway: 'https://gateway.pinata.cloud/ipfs/',
    infuraEndpoint: 'https://ipfs.infura.io:5001/api/v0/add',
    infuraGateway: 'https://ipfs.infura.io/ipfs/',
    timeout: 30000,
    maxRetries: 3
  },
  
  // Arweave Configuration
  arweave: {
    enabled: false, // Set to true when wallet is configured
    endpoint: 'https://arweave.net',
    timeout: 60000,
    maxRetries: 2
  },
  
  // Fallback options
  fallback: {
    useInlineDataUri: true,
    maxInlineSize: 10000, // Max size for inline data URIs in bytes
    compressionEnabled: true
  },
  
  // Validation settings
  validation: {
    maxNameLength: 32,
    maxSymbolLength: 10,
    maxDescriptionLength: 1000,
    maxUriLength: 200,
    requiredFields: ['name', 'symbol'],
    allowedImageFormats: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']
  }
};

// Multi-wallet configuration
export const MULTI_WALLET_CONFIG = {
  maxContributors: 10,
  minContributionSol: 0.001, // Minimum SOL contribution in SOL
  minContributionTokens: 1, // Minimum token contribution
  maxTransactionSize: 1232, // Max transaction size in bytes
  coordinationTimeout: 30000, // Timeout for multi-wallet coordination
  balanceValidation: {
    includeRentExemption: true,
    bufferPercentage: 0.0 // No buffer needed - no fees
  }
};
