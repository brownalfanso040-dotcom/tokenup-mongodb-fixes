/**
 * PumpFun Token Creation Service
 * Uses PumpFun Lightning Transaction API with proper credentials
 */

import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { TokenMetaDataType } from './types';

// PumpFun API Configuration
export const PUMPFUN_CONFIG = {
  api: {
    trade: 'https://pumpportal.fun/api/trade',
    tradeLocal: 'https://pumpportal.fun/api/trade-local',
    ipfs: 'https://pump.fun/api/ipfs'
  },
  jito: {
    mainnet: 'https://mainnet.block-engine.jito.wtf/api/v1/bundles',
    testnet: 'https://testnet.block-engine.jito.wtf/api/v1/bundles'
  }
} as const;

export interface PumpFunTokenCreationOptions {
  tokenMetadata: TokenMetaDataType;
  network: 'mainnet' | 'testnet';
  devBuyAmount?: number;
  slippage?: number;
  priorityFee?: number;
  useJitoBundling?: boolean;
  imageFile?: File | Blob;
}

export interface PumpFunMetadataUpload {
  file: File | Blob;
  name: string;
  symbol: string;
  description: string;
  twitter?: string;
  telegram?: string;
  website?: string;
}

export interface PumpFunMetadataResponse {
  metadataUri: string;
  metadata: {
    name: string;
    symbol: string;
    description: string;
    image?: string;
    website?: string;
    twitter?: string;
    telegram?: string;
  };
}

export class PumpFunService {
  private apiKey: string;
  private walletPublicKey: string;
  private walletPrivateKey: string;
  private network: 'mainnet' | 'testnet';

  constructor(network: 'mainnet' | 'testnet' = 'mainnet') {
    this.network = network;
    this.apiKey = process.env.PUMPFUN_API_KEY || process.env.NEXT_PUBLIC_PUMPFUN_API_KEY || '';
    this.walletPublicKey = process.env.PUMPFUN_WALLET_PUBLIC_KEY || '';
    this.walletPrivateKey = process.env.PUMPFUN_WALLET_PRIVATE_KEY || '';

    if (!this.apiKey || !this.walletPublicKey || !this.walletPrivateKey) {
      throw new Error('PumpFun credentials not found in environment variables');
    }
  }

  /**
   * Upload metadata to IPFS using PumpFun API
   */
  async uploadMetadata(metadata: PumpFunMetadataUpload): Promise<PumpFunMetadataResponse> {
    const formData = new FormData();
    formData.append('file', metadata.file);
    formData.append('name', metadata.name);
    formData.append('symbol', metadata.symbol);
    formData.append('description', metadata.description);
    formData.append('twitter', metadata.twitter || '');
    formData.append('telegram', metadata.telegram || '');
    formData.append('website', metadata.website || '');
    formData.append('showName', 'true');

    const response = await fetch(PUMPFUN_CONFIG.api.ipfs, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload metadata: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Create token using Lightning Transaction API
   */
  async createTokenWithLightning(
    options: PumpFunTokenCreationOptions,
    mintKeypair: Keypair
  ): Promise<{ signature: string; mint: string }> {
    // Upload metadata first
    const imageFile = options.imageFile || new Blob([''], { type: 'image/png' });
    
    const metadataResponse = await this.uploadMetadata({
      file: imageFile,
      name: options.tokenMetadata.name,
      symbol: options.tokenMetadata.symbol,
      description: options.tokenMetadata.description || '',
      website: options.tokenMetadata.website,
      twitter: options.tokenMetadata.twitter,
      telegram: options.tokenMetadata.telegram,
    });

    // Create token using Lightning API
    const requestBody = {
      action: 'create',
      tokenMetadata: {
        name: metadataResponse.metadata.name,
        symbol: metadataResponse.metadata.symbol,
        uri: metadataResponse.metadataUri
      },
      mint: bs58.encode(mintKeypair.secretKey), // Use secret key for Lightning API
      denominatedInSol: 'true',
      amount: options.devBuyAmount || 1,
      slippage: options.slippage || 10,
      priorityFee: options.priorityFee || 0.0005,
      pool: 'pump'
    };

    const response = await fetch(`${PUMPFUN_CONFIG.api.trade}?api-key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PumpFun Lightning API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    
    if (!result.signature) {
      throw new Error(`PumpFun Lightning API did not return a signature: ${JSON.stringify(result)}`);
    }

    return {
      signature: result.signature,
      mint: mintKeypair.publicKey.toBase58()
    };
  }

  /**
   * Create token using Local Transaction API (for custom RPC)
   */
  async createTokenLocal(
    options: PumpFunTokenCreationOptions,
    mintKeypair: Keypair,
    connection: Connection
  ): Promise<{ signature: string; mint: string }> {
    // Upload metadata first
    const imageFile = options.imageFile || new Blob([''], { type: 'image/png' });
    
    const metadataResponse = await this.uploadMetadata({
      file: imageFile,
      name: options.tokenMetadata.name,
      symbol: options.tokenMetadata.symbol,
      description: options.tokenMetadata.description || '',
      website: options.tokenMetadata.website,
      twitter: options.tokenMetadata.twitter,
      telegram: options.tokenMetadata.telegram,
    });

    // Get transaction from Local API
    const requestBody = {
      publicKey: this.walletPublicKey,
      action: 'create',
      tokenMetadata: {
        name: metadataResponse.metadata.name,
        symbol: metadataResponse.metadata.symbol,
        uri: metadataResponse.metadataUri
      },
      mint: mintKeypair.publicKey.toBase58(),
      denominatedInSol: 'true',
      amount: options.devBuyAmount || 1,
      slippage: options.slippage || 10,
      priorityFee: options.priorityFee || 0.0005,
      pool: 'pump'
    };

    const response = await fetch(PUMPFUN_CONFIG.api.tradeLocal, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PumpFun Local API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    // Get transaction data
    const data = await response.arrayBuffer();
    const tx = VersionedTransaction.deserialize(new Uint8Array(data));
    
    // Sign with both mint keypair and wallet keypair
    const walletKeypair = Keypair.fromSecretKey(bs58.decode(this.walletPrivateKey));
    tx.sign([mintKeypair, walletKeypair]);
    
    // Send transaction
    const signature = await connection.sendTransaction(tx);
    
    return {
      signature,
      mint: mintKeypair.publicKey.toBase58()
    };
  }

  /**
   * Create token with Jito bundling
   */
  async createTokenWithJitoBundle(
    options: PumpFunTokenCreationOptions,
    additionalSigners: Keypair[],
    mintKeypair: Keypair
  ): Promise<{ signatures: string[]; mint: string }> {
    // Upload metadata first
    const imageFile = options.imageFile || new Blob([''], { type: 'image/png' });
    
    const metadataResponse = await this.uploadMetadata({
      file: imageFile,
      name: options.tokenMetadata.name,
      symbol: options.tokenMetadata.symbol,
      description: options.tokenMetadata.description || '',
      website: options.tokenMetadata.website,
      twitter: options.tokenMetadata.twitter,
      telegram: options.tokenMetadata.telegram,
    });

    // Create bundle transactions
    const bundledTxArgs = [
      {
        publicKey: this.walletPublicKey,
        action: 'create',
        tokenMetadata: {
          name: metadataResponse.metadata.name,
          symbol: metadataResponse.metadata.symbol,
          uri: metadataResponse.metadataUri
        },
        mint: mintKeypair.publicKey.toBase58(),
        denominatedInSol: 'true',
        amount: options.devBuyAmount || 1,
        slippage: options.slippage || 10,
        priorityFee: options.priorityFee || 0.0005,
        pool: 'pump'
      }
    ];

    // Add additional buy transactions if there are additional signers
    additionalSigners.forEach((signer, index) => {
      bundledTxArgs.push({
        publicKey: signer.publicKey.toBase58(),
        action: 'buy',
        mint: mintKeypair.publicKey.toBase58(),
        denominatedInSol: 'true',
        amount: 0.1, // Small buy amount
        slippage: options.slippage || 10,
        priorityFee: index === 0 ? options.priorityFee || 0.0005 : 0, // Only first tx gets priority fee
        pool: 'pump'
      });
    });

    // Get bundled transactions
    const response = await fetch(PUMPFUN_CONFIG.api.tradeLocal, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bundledTxArgs)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PumpFun Bundle API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const transactions = await response.json();
    let encodedSignedTransactions: string[] = [];
    let signatures: string[] = [];

    // Sign each transaction
    const walletKeypair = Keypair.fromSecretKey(bs58.decode(this.walletPrivateKey));
    
    for (let i = 0; i < bundledTxArgs.length; i++) {
      const tx = VersionedTransaction.deserialize(new Uint8Array(bs58.decode(transactions[i])));
      
      if (bundledTxArgs[i].action === 'create') {
        // Creation transaction needs mint and wallet keypairs
        tx.sign([mintKeypair, walletKeypair]);
      } else {
        // Buy transactions need signer keypair
        tx.sign([additionalSigners[i - 1]]);
      }
      
      encodedSignedTransactions.push(bs58.encode(tx.serialize()));
      signatures.push(bs58.encode(tx.signatures[0]));
    }

    // Send bundle to Jito
    const jitoEndpoint = this.network === 'mainnet' ? PUMPFUN_CONFIG.jito.mainnet : PUMPFUN_CONFIG.jito.testnet;
    
    const jitoResponse = await fetch(jitoEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sendBundle',
        params: [encodedSignedTransactions]
      })
    });

    if (!jitoResponse.ok) {
      throw new Error(`Jito bundle submission failed: ${jitoResponse.statusText}`);
    }

    return {
      signatures,
      mint: mintKeypair.publicKey.toBase58()
    };
  }
}

/**
 * Create PumpFun service instance
 */
export function createPumpFunService(network: 'mainnet' | 'testnet' = 'mainnet'): PumpFunService {
  return new PumpFunService(network);
}