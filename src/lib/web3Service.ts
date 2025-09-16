import { Connection, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { getHeliusService, HeliusService } from './helius';
import { createTokenCreationTransaction } from './web3';
import { TokenMetaDataType, LaunchedToken, TokenAnalytics, WalletTokenBalance, TransactionSummary } from './types';
import { NetworkType } from '../context/NetworkContext';
import { isPumpFunToken, fetchPumpFunTokenInfo, detectTokenType } from './pumpfunUtils';

export class Web3Service {
  private helius: HeliusService;
  private connection: Connection;
  private network: NetworkType;

  constructor(network: NetworkType = 'mainnet') {
    this.network = network;
    this.helius = getHeliusService(network);
    this.connection = this.helius.getConnection();
  }

  // Enhanced token creation with Helius verification
  public async createToken(
    tokenMetaData: TokenMetaDataType,
    publicKey: PublicKey,
    uri: string,
    onProgress?: (step: string) => void
  ): Promise<{
    success: boolean;
    signature?: string;
    mintAddress?: string;
    error?: string;
  }> {
    try {
      onProgress?.('Creating token transaction...');
      
      // Create the token transaction using existing logic
      const { transaction, signers, mint } = await createTokenCreationTransaction(
        this.connection,
        tokenMetaData,
        publicKey,
        uri
      );

      if (!transaction || !mint) {
        return { success: false, error: 'Failed to create transaction' };
      }

      onProgress?.('Sending transaction to blockchain...');

      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        signers,
        { commitment: 'confirmed' }
      );

      onProgress?.('Verifying token creation...');

      // Verify the token creation using Helius
      const verified = await this.helius.verifyTokenCreation(signature, mint.toString());

      if (!verified) {
        console.warn('Token creation could not be verified via Helius');
      }

      onProgress?.('Token created successfully!');

      return {
        success: true,
        signature,
        mintAddress: mint.toString()
      };

    } catch (error) {
      console.error('Error creating token:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  // Get enhanced token information with PumpFun detection
  public async getTokenInfo(mintAddress: string): Promise<LaunchedToken | null> {
    try {
      // First detect if this is a PumpFun token
      const tokenDetection = await detectTokenType(mintAddress);
      
      // Get Helius data
      const enhancedInfo = await this.helius.getEnhancedTokenInfo(mintAddress);
      
      if (!enhancedInfo && !tokenDetection.isPumpFun) {
        return null;
      }

      const { asset, metadata } = enhancedInfo || {};

      // If it's a PumpFun token, prioritize PumpFun data
      if (tokenDetection.isPumpFun && tokenDetection.metadata) {
        const pumpFunData = tokenDetection.metadata;
        
        return {
          id: mintAddress,
          name: pumpFunData.name || metadata?.name || asset?.content?.metadata?.name || 'Unknown Token',
          symbol: pumpFunData.symbol || metadata?.symbol || asset?.content?.metadata?.symbol || 'UNKNOWN',
          mintAddress,
          network: this.network,
          timestamp: Date.now(),
          creator: pumpFunData.creator,
          description: pumpFunData.description || metadata?.description || asset?.content?.metadata?.description,
          image: pumpFunData.image || metadata?.image || asset?.content?.files?.[0]?.uri,
          website: pumpFunData.website || metadata?.external_url || asset?.content?.links?.external_url,
          twitter: pumpFunData.twitter,
          telegram: pumpFunData.telegram,
          discord: pumpFunData.discord,
          supply: pumpFunData.totalSupply || asset?.supply?.print_max_supply,
          decimals: 6, // PumpFun tokens typically use 6 decimals
          verified: false, // PumpFun tokens are not verified in the traditional sense
          isPumpFun: true,
          tokenType: 'pumpfun',
          heliusData: enhancedInfo ? {
            asset,
            metadata,
            lastUpdated: new Date().toISOString()
          } : undefined,
          pumpFunData: {
            createdOn: pumpFunData.createdOn,
            marketCap: pumpFunData.marketCap,
            bondingCurve: pumpFunData.bondingCurve,
            associatedBondingCurve: pumpFunData.associatedBondingCurve,
            virtualTokenReserves: pumpFunData.virtualTokenReserves,
            virtualSolReserves: pumpFunData.virtualSolReserves,
            complete: pumpFunData.complete,
            lastUpdated: new Date().toISOString()
          }
        };
      }

      // For non-PumpFun tokens, use Helius data
      if (!enhancedInfo) {
        return null;
      }

      return {
        id: mintAddress,
        name: metadata?.name || asset?.content?.metadata?.name || 'Unknown Token',
        symbol: metadata?.symbol || asset?.content?.metadata?.symbol || 'UNKNOWN',
        mintAddress,
        network: this.network,
        timestamp: Date.now(),
        description: metadata?.description || asset?.content?.metadata?.description,
        image: metadata?.image || asset?.content?.files?.[0]?.uri,
        website: metadata?.external_url || asset?.content?.links?.external_url,
        supply: asset?.supply?.print_max_supply,
        decimals: 9, // Default, should be fetched from mint info
        verified: asset?.creators?.some(creator => creator.verified) || false,
        isPumpFun: false,
        tokenType: tokenDetection.tokenType,
        heliusData: {
          asset,
          metadata,
          lastUpdated: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('Error fetching token info:', error);
      return null;
    }
  }

  // Get wallet token balances with metadata
  public async getWalletTokens(walletAddress: string): Promise<WalletTokenBalance[]> {
    try {
      const [balances, assets] = await Promise.all([
        this.helius.getTokenBalances(walletAddress),
        this.helius.getAssetsByOwner(walletAddress)
      ]);

      // Create a map of mint addresses to metadata
      const metadataMap = new Map();
      if (assets && assets.items && Array.isArray(assets.items)) {
        assets.items.forEach(asset => {
          if (asset && asset.id) {
            metadataMap.set(asset.id, {
              name: asset.content?.metadata?.name,
              symbol: asset.content?.metadata?.symbol,
              image: asset.content?.files?.[0]?.uri || asset.content?.links?.image
            });
          }
        });
      }

      if (!balances || !balances.items || !Array.isArray(balances.items)) {
        console.warn('No token balances found or invalid response format');
        return [];
      }

      return balances.items.map(balance => ({
        mint: balance.mint,
        amount: balance.amount,
        decimals: balance.decimals,
        tokenAccount: balance.tokenAccount,
        metadata: metadataMap.get(balance.mint)
      }));
    } catch (error) {
      console.error('Error fetching wallet tokens:', error);
      return [];
    }
  }

  // Get transaction history with enhanced parsing
  public async getTransactionHistory(
    address: string,
    limit: number = 50
  ): Promise<TransactionSummary[]> {
    try {
      const transactions = await this.helius.getTransactionHistory(address, undefined, limit);

      return transactions.map(tx => ({
        signature: tx.signature,
        type: tx.type,
        description: tx.description,
        timestamp: tx.timestamp * 1000, // Convert to milliseconds
        fee: tx.fee,
        status: 'success' as const, // Helius only returns successful transactions
        tokenTransfers: tx.tokenTransfers?.map(transfer => ({
          mint: transfer.mint,
          amount: transfer.tokenAmount,
          from: transfer.fromUserAccount,
          to: transfer.toUserAccount
        }))
      }));
    } catch (error) {
      console.error('Error fetching transaction history:', error);
      return [];
    }
  }

  // Get token analytics (placeholder for future implementation)
  public async getTokenAnalytics(mintAddress: string): Promise<TokenAnalytics | null> {
    try {
      // This would integrate with additional APIs for market data
      // For now, we'll return basic information from Helius
      const transactions = await this.helius.getTransactionHistory(mintAddress, undefined, 100);
      
      const last24h = Date.now() - (24 * 60 * 60 * 1000);
      const recent24hTxs = transactions.filter(tx => (tx.timestamp * 1000) > last24h);

      return {
        mintAddress,
        network: this.network,
        holders: 0, // Would need additional API call
        transactions24h: recent24hTxs.length,
        volume24h: 0, // Would need market data API
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error fetching token analytics:', error);
      return null;
    }
  }

  // Validate token address with PumpFun support
  public async validateTokenAddress(address: string): Promise<boolean> {
    try {
      // First check if it's a valid Solana address format
      const publicKey = new PublicKey(address);
      
      // If it's a PumpFun token, try to fetch from PumpFun API
      if (isPumpFunToken(address)) {
        const pumpFunData = await fetchPumpFunTokenInfo(address);
        return pumpFunData !== null;
      }
      
      // For regular tokens, use Helius
      const asset = await this.helius.getAsset(address);
      return asset !== null;
    } catch (error) {
      return false;
    }
  }

  // Get network status
  public async getNetworkStatus(): Promise<{
    network: NetworkType;
    blockHeight: number;
    health: 'ok' | 'degraded' | 'down';
  }> {
    try {
      const slot = await this.connection.getSlot();
      return {
        network: this.network,
        blockHeight: slot,
        health: 'ok'
      };
    } catch (error) {
      return {
        network: this.network,
        blockHeight: 0,
        health: 'down'
      };
    }
  }

  // Switch network
  public switchNetwork(network: NetworkType): void {
    this.network = network;
    this.helius = getHeliusService(network);
    this.connection = this.helius.getConnection();
  }

  // Get connection instance
  public getConnection(): Connection {
    return this.connection;
  }

  // Get Helius service instance
  public getHeliusService(): HeliusService {
    return this.helius;
  }

  public getNetwork(): NetworkType {
    return this.network;
  }
}

// Singleton instance
let web3ServiceInstance: Web3Service | null = null;

export function getWeb3Service(network: NetworkType = 'mainnet'): Web3Service {
  if (!web3ServiceInstance || web3ServiceInstance.getNetwork() !== network) {
    web3ServiceInstance = new Web3Service(network);
  }
  return web3ServiceInstance;
}

// Utility functions for common operations
export async function createTokenWithHelius(
  tokenMetaData: TokenMetaDataType,
  publicKey: PublicKey,
  uri: string,
  network: NetworkType = 'mainnet',
  onProgress?: (step: string) => void
) {
  const service = getWeb3Service(network);
  return await service.createToken(tokenMetaData, publicKey, uri, onProgress);
}

export async function getTokenInfoWithHelius(mintAddress: string, network: NetworkType = 'mainnet') {
  const service = getWeb3Service(network);
  return await service.getTokenInfo(mintAddress);
}

export async function getWalletTokensWithHelius(walletAddress: string, network: NetworkType = 'mainnet') {
  const service = getWeb3Service(network);
  return await service.getWalletTokens(walletAddress);
}