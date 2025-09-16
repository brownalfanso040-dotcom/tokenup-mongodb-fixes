import { Connection, PublicKey } from '@solana/web3.js';
import { NetworkType } from '../context/NetworkContext';

// Helius API Types
export interface HeliusTokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  description?: string;
  image?: string;
  external_url?: string;
  attributes?: Array<{
    trait_type: string;
    value: string;
  }>;
  properties?: {
    files?: Array<{
      uri: string;
      type: string;
    }>;
    category?: string;
    creators?: Array<{
      address: string;
      verified: boolean;
      share: number;
    }>;
  };
}

export interface HeliusAsset {
  id: string;
  content: {
    $schema: string;
    json_uri: string;
    files: Array<{
      uri: string;
      cdn_uri?: string;
      mime: string;
    }>;
    metadata: HeliusTokenMetadata;
    links?: {
      external_url?: string;
      image?: string;
    };
  };
  authorities: Array<{
    address: string;
    scopes: string[];
  }>;
  compression: {
    eligible: boolean;
    compressed: boolean;
    data_hash?: string;
    creator_hash?: string;
    asset_hash?: string;
    tree?: string;
    seq?: number;
    leaf_id?: number;
  };
  grouping: Array<{
    group_key: string;
    group_value: string;
  }>;
  royalty: {
    royalty_model: string;
    target?: string;
    percent: number;
    basis_points: number;
    primary_sale_happened: boolean;
    locked: boolean;
  };
  creators: Array<{
    address: string;
    verified: boolean;
    share: number;
  }>;
  ownership: {
    frozen: boolean;
    delegated: boolean;
    delegate?: string;
    ownership_model: string;
    owner: string;
  };
  supply: {
    print_max_supply?: number;
    print_current_supply?: number;
    edition_nonce?: number;
  };
  mutable: boolean;
  burnt: boolean;
}

export interface HeliusTransaction {
  accountData: Array<{
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges: Array<{
      userAccount: string;
      tokenAccount: string;
      rawTokenAmount: {
        tokenAmount: string;
        decimals: number;
      };
      mint: string;
    }>;
  }>;
  description: string;
  type: string;
  source: string;
  fee: number;
  feePayer: string;
  signature: string;
  slot: number;
  timestamp: number;
  tokenTransfers: Array<{
    fromTokenAccount: string;
    toTokenAccount: string;
    fromUserAccount: string;
    toUserAccount: string;
    tokenAmount: number;
    mint: string;
    tokenStandard: string;
  }>;
  nativeTransfers: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
  events: {
    nft?: {
      description: string;
      type: string;
      source: string;
      amount: number;
      fee: number;
      feePayer: string;
      signature: string;
      slot: number;
      timestamp: number;
      saleType?: string;
      buyer?: string;
      seller?: string;
      staker?: string;
      nfts: Array<{
        mint: string;
        tokenStandard: string;
      }>;
    };
  };
}

export interface HeliusBalanceResponse {
  total: number;
  limit: number;
  page: number;
  items: Array<{
    mint: string;
    amount: number;
    decimals: number;
    tokenAccount: string;
  }>;
}

export class HeliusService {
  private apiKey: string;
  private network: NetworkType;
  private baseUrl: string;

  constructor(network: NetworkType = 'mainnet') {
    this.network = network;
    this.apiKey = this.getApiKey();
    this.baseUrl = this.getBaseUrl();
  }

  private getApiKey(): string {
    // In production, this should come from environment variables
    const apiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY || process.env.HELIUS_API_KEY || '';
    if (!apiKey) {
      // Fallback gracefully when no API key is configured. We will use public Solana RPC for limited functionality.
      try { console.warn('Helius API key not found. Falling back to public Solana RPC; some features will be limited.'); } catch {}
    }
    return apiKey;
  }

  private getBaseUrl(): string {
    return this.network === 'mainnet' 
      ? 'https://api.helius.xyz' 
      : 'https://api-devnet.helius.xyz';
  }

  private getDasRpcUrl(): string {
    return this.network === 'mainnet'
      ? `https://mainnet.helius-rpc.com/?api-key=${this.apiKey}`
      : `https://devnet.helius-rpc.com/?api-key=${this.apiKey}`;
  }

  private getRpcUrl(): string {
    // Use Helius RPC when apiKey exists, otherwise fallback to public Solana RPC
    if (!this.apiKey) {
      return this.network === 'mainnet'
        ? 'https://api.mainnet-beta.solana.com'
        : 'https://api.devnet.solana.com';
    }
    return this.network === 'mainnet'
      ? `https://mainnet.helius-rpc.com/?api-key=${this.apiKey}`
      : `https://devnet.helius-rpc.com/?api-key=${this.apiKey}`;
  }

  // Get enhanced connection with Helius RPC
  public getConnection(): Connection {
    return new Connection(this.getRpcUrl(), 'confirmed');
  }

  public getNetwork(): NetworkType {
    return this.network;
  }

  // New: expose whether an API key is configured
  public hasApiKey(): boolean {
    return !!this.apiKey && this.apiKey.trim().length > 0;
  }

  // Get asset information by mint address
  public async getAsset(mintAddress: string): Promise<HeliusAsset | null> {
    if (!this.hasApiKey()) {
      // Without API key, Helius REST endpoints are unavailable
      return null;
    }
    try {
      const response = await fetch(`${this.baseUrl}/v0/assets/${mintAddress}?api-key=${this.apiKey}`);
      if (!response.ok) {
        console.error(`Failed to fetch asset: ${response.status} ${response.statusText}`);
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching asset from Helius:', error);
      return null;
    }
  }

  // Get multiple assets by mint addresses
  public async getAssets(mintAddresses: string[]): Promise<HeliusAsset[]> {
    if (!this.hasApiKey()) {
      return [];
    }
    try {
      const response = await fetch(`${this.baseUrl}/v0/assets?api-key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: mintAddresses }),
      });
      if (!response.ok) {
        console.error(`Failed to fetch assets: ${response.status} ${response.statusText}`);
        return [];
      }
      const data = await response.json();
      return data.items || [];
    } catch (error) {
      console.error('Error fetching assets from Helius:', error);
      return [];
    }
  }

  // Get assets owned by a wallet
  public async getAssetsByOwner(
    ownerAddress: string,
    page: number = 1,
    limit: number = 1000
  ): Promise<{ items: HeliusAsset[]; total: number; page: number; limit: number }> {
    if (!this.hasApiKey()) {
      return { items: [], total: 0, page: 1, limit };
    }
    try {
      const response = await fetch(this.getDasRpcUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'get-assets-by-owner',
          method: 'getAssetsByOwner',
          params: {
            ownerAddress,
            page,
            limit,
            options: { showFungible: true, showNativeBalance: false }
          }
        })
      });
      if (!response.ok) {
        console.error(`Failed to fetch assets by owner: ${response.status} ${response.statusText}`);
        return { items: [], total: 0, page: 1, limit: 1000 };
      }
      const data = await response.json();
      if (data.error) {
        console.error('Helius API error:', data.error);
        return { items: [], total: 0, page: 1, limit: 1000 };
      }
      return {
        items: data.result?.items || [],
        total: data.result?.total || 0,
        page: data.result?.page || page,
        limit: data.result?.limit || limit
      };
    } catch (error) {
      console.error('Error fetching assets by owner from Helius:', error);
      return { items: [], total: 0, page: 1, limit: 1000 };
    }
  }

  // Get token balances for a wallet
  public async getTokenBalances(walletAddress: string): Promise<HeliusBalanceResponse> {
    try {
      const response = await fetch(this.getRpcUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'get-token-accounts',
          method: 'getTokenAccountsByOwner',
          params: [
            walletAddress,
            {
              programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
            },
            {
              encoding: 'jsonParsed'
            }
          ]
        })
      });
      
      if (!response.ok) {
        console.error(`Failed to fetch token balances: ${response.status} ${response.statusText}`);
        return { total: 0, limit: 0, page: 1, items: [] };
      }

      const data = await response.json();
      
      if (data.error) {
        console.error('RPC error:', data.error);
        return { total: 0, limit: 0, page: 1, items: [] };
      }

      const tokenAccounts = data.result?.value || [];
      const items = tokenAccounts
        .filter((account: any) => {
          const amount = parseInt(account.account.data.parsed.info.tokenAmount.amount);
          return amount > 0; // Only include accounts with positive balance
        })
        .map((account: any) => ({
          mint: account.account.data.parsed.info.mint,
          amount: parseInt(account.account.data.parsed.info.tokenAmount.amount),
          decimals: account.account.data.parsed.info.tokenAmount.decimals,
          tokenAccount: account.pubkey
        }));

      return {
        total: items.length,
        limit: items.length,
        page: 1,
        items
      };
    } catch (error) {
      console.error('Error fetching token balances from Helius:', error);
      return { total: 0, limit: 0, page: 1, items: [] };
    }
  }

  // Get transaction history for an address
  public async getTransactionHistory(
    address: string,
    before?: string,
    limit: number = 100
  ): Promise<HeliusTransaction[]> {
    try {
      const params = new URLSearchParams({
        'api-key': this.apiKey,
        limit: limit.toString(),
      });

      if (before) {
        params.append('before', before);
      }

      const response = await fetch(`${this.baseUrl}/v0/addresses/${address}/transactions?${params}`);
      
      if (!response.ok) {
        console.error(`Failed to fetch transaction history: ${response.status} ${response.statusText}`);
        return [];
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching transaction history from Helius:', error);
      return [];
    }
  }

  // Parse transaction details
  public async parseTransaction(signature: string): Promise<HeliusTransaction | null> {
    try {
      const response = await fetch(`${this.baseUrl}/v0/transactions/${signature}?api-key=${this.apiKey}`);
      
      if (!response.ok) {
        console.error(`Failed to parse transaction: ${response.status} ${response.statusText}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Error parsing transaction from Helius:', error);
      return null;
    }
  }

  // Get token metadata using Helius
  public async getTokenMetadata(mintAddress: string): Promise<HeliusTokenMetadata | null> {
    const asset = await this.getAsset(mintAddress);
    return asset?.content?.metadata || null;
  }

  // Verify token creation transaction
  public async verifyTokenCreation(signature: string, expectedMint: string): Promise<boolean> {
    try {
      const transaction = await this.parseTransaction(signature);
      
      if (!transaction) {
        return false;
      }

      // Check if the transaction contains token creation events
      const hasTokenCreation = transaction.tokenTransfers.some(
        transfer => transfer.mint === expectedMint
      );

      return hasTokenCreation;
    } catch (error) {
      console.error('Error verifying token creation:', error);
      return false;
    }
  }

  // Get enhanced token information with market data
  public async getEnhancedTokenInfo(mintAddress: string) {
    try {
      const [asset, metadata] = await Promise.all([
        this.getAsset(mintAddress),
        this.getTokenMetadata(mintAddress)
      ]);

      return {
        asset,
        metadata,
        mintAddress,
        network: this.network,
        fetchedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error fetching enhanced token info:', error);
      return null;
    }
  }

  // Webhook setup for real-time updates (for production use)
  public async setupWebhook(webhookUrl: string, addresses: string[]) {
    try {
      const response = await fetch(`${this.baseUrl}/v0/webhooks?api-key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhookURL: webhookUrl,
          transactionTypes: ['Any'],
          accountAddresses: addresses,
          webhookType: 'enhanced',
        }),
      });

      if (!response.ok) {
        console.error(`Failed to setup webhook: ${response.status} ${response.statusText}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Error setting up webhook:', error);
      return null;
    }
  }
}

// Singleton instance for easy access
let heliusServiceInstance: HeliusService | null = null;

export function getHeliusService(network: NetworkType = 'mainnet'): HeliusService {
  if (!heliusServiceInstance || heliusServiceInstance.getNetwork() !== network) {
    heliusServiceInstance = new HeliusService(network);
  }
  return heliusServiceInstance;
}

// Utility functions for common operations
export async function fetchTokenMetadata(mintAddress: string, network: NetworkType = 'mainnet') {
  const helius = getHeliusService(network);
  return await helius.getTokenMetadata(mintAddress);
}

export async function fetchWalletTokens(walletAddress: string, network: NetworkType = 'mainnet') {
  const helius = getHeliusService(network);
  return await helius.getAssetsByOwner(walletAddress);
}

export async function verifyTransaction(signature: string, expectedMint: string, network: NetworkType = 'mainnet') {
  const helius = getHeliusService(network);
  return await helius.verifyTokenCreation(signature, expectedMint);
}