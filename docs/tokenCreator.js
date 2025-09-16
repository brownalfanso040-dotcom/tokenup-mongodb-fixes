// Real SPL Token Creator
import {
  Connection,
  Keypair,
  Transaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  PublicKey
} from '@solana/web3.js';
import {
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress
} from '@solana/spl-token';
import {
  createCreateMetadataAccountV3Instruction,
  PROGRAM_ID as METADATA_PROGRAM_ID
} from '@metaplex-foundation/mpl-token-metadata';
import walletManager from './walletManager.js';
import { getCurrentNetwork, FEES, DEFAULT_DECIMALS } from './config.js';

class TokenCreator {
  constructor() {
    this.connection = null;
    this.initializeConnection();
  }

  initializeConnection() {
    this.connection = walletManager.getConnection();
  }

  // Create SPL Token with metadata
  async createToken(tokenData) {
    try {
      // Validate wallet connection
      if (!walletManager.isWalletConnected()) {
        throw new Error('Wallet not connected');
      }

      const payer = walletManager.getPublicKey();
      const mintKeypair = Keypair.generate();
      const mint = mintKeypair.publicKey;

      // Validate token data
      this.validateTokenData(tokenData);

      // Calculate required balance
      const requiredBalance = await this.calculateRequiredBalance();
      const currentBalance = await walletManager.getBalance();

      if (currentBalance < requiredBalance) {
        throw new Error(`Insufficient balance. Required: ${requiredBalance} SOL, Available: ${currentBalance} SOL`);
      }

      // Create transaction
      const transaction = new Transaction();

      // Add create mint account instruction
      const mintRent = await getMinimumBalanceForRentExemptMint(this.connection);
      transaction.add(
        SystemProgram.createAccount({
          fromPubkey: payer,
          newAccountPubkey: mint,
          space: MINT_SIZE,
          lamports: mintRent,
          programId: TOKEN_PROGRAM_ID
        })
      );

      // Add initialize mint instruction
      transaction.add(
        createInitializeMintInstruction(
          mint,
          tokenData.decimals || DEFAULT_DECIMALS,
          payer, // mint authority
          payer  // freeze authority (optional)
        )
      );

      // Create metadata if provided
      if (tokenData.name || tokenData.symbol || tokenData.description || tokenData.image) {
        const metadataInstruction = await this.createMetadataInstruction(
          mint,
          payer,
          tokenData
        );
        transaction.add(metadataInstruction);
      }

      // Create associated token account for initial supply
      if (tokenData.initialSupply && tokenData.initialSupply > 0) {
        const associatedTokenAccount = await getAssociatedTokenAddress(
          mint,
          payer
        );

        // Add create associated token account instruction
        transaction.add(
          createAssociatedTokenAccountInstruction(
            payer,
            associatedTokenAccount,
            payer,
            mint
          )
        );

        // Add mint to instruction
        const mintAmount = tokenData.initialSupply * Math.pow(10, tokenData.decimals || DEFAULT_DECIMALS);
        transaction.add(
          createMintToInstruction(
            mint,
            associatedTokenAccount,
            payer,
            mintAmount
          )
        );
      }

      // Add mint keypair as signer
      transaction.partialSign(mintKeypair);

      // Sign and send transaction
      const result = await walletManager.signAndSendTransaction(transaction);

      if (result.confirmed) {
        return {
          success: true,
          mintAddress: mint.toString(),
          signature: result.signature,
          explorerUrl: this.getExplorerUrl(result.signature),
          tokenData: {
            ...tokenData,
            mintAddress: mint.toString(),
            creator: payer.toString()
          }
        };
      } else {
        throw new Error('Transaction failed to confirm');
      }
    } catch (error) {
      console.error('Token creation failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Create metadata instruction
  async createMetadataInstruction(mint, payer, tokenData) {
    const [metadataAddress] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer()
      ],
      METADATA_PROGRAM_ID
    );

    const metadata = {
      name: tokenData.name || '',
      symbol: tokenData.symbol || '',
      uri: tokenData.metadataUri || '',
      sellerFeeBasisPoints: 0,
      creators: null,
      collection: null,
      uses: null
    };

    return createCreateMetadataAccountV3Instruction(
      {
        metadata: metadataAddress,
        mint: mint,
        mintAuthority: payer,
        payer: payer,
        updateAuthority: payer,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY
      },
      {
        createMetadataAccountArgsV3: {
          data: metadata,
          isMutable: true,
          collectionDetails: null
        }
      }
    );
  }

  // Validate token data
  validateTokenData(tokenData) {
    if (!tokenData.name || tokenData.name.trim().length === 0) {
      throw new Error('Token name is required');
    }
    
    if (!tokenData.symbol || tokenData.symbol.trim().length === 0) {
      throw new Error('Token symbol is required');
    }

    if (tokenData.symbol.length > 10) {
      throw new Error('Token symbol must be 10 characters or less');
    }

    if (tokenData.decimals < 0 || tokenData.decimals > 9) {
      throw new Error('Decimals must be between 0 and 9');
    }

    if (tokenData.initialSupply < 0) {
      throw new Error('Initial supply cannot be negative');
    }
  }

  // Calculate required balance for token creation
  async calculateRequiredBalance() {
    const mintRent = await getMinimumBalanceForRentExemptMint(this.connection);
    const metadataRent = FEES.metadataCreation * 1e9; // Convert SOL to lamports
    const associatedTokenRent = FEES.associatedTokenAccount * 1e9;
    
    const totalLamports = mintRent + metadataRent + associatedTokenRent + 5000; // Add small buffer for transaction fees
    return totalLamports / 1e9; // Convert back to SOL
  }

  // Get explorer URL for transaction
  getExplorerUrl(signature) {
    const network = getCurrentNetwork();
    return `${network.explorerUrl}/tx/${signature}`;
  }

  // Upload metadata to IPFS (placeholder - would need actual IPFS integration)
  async uploadMetadata(tokenData) {
    // This is a placeholder. In a real implementation, you would:
    // 1. Upload image to IPFS
    // 2. Create metadata JSON
    // 3. Upload metadata JSON to IPFS
    // 4. Return the IPFS URI
    
    const metadata = {
      name: tokenData.name,
      symbol: tokenData.symbol,
      description: tokenData.description || '',
      image: tokenData.image || '',
      attributes: tokenData.attributes || [],
      properties: {
        files: tokenData.image ? [{
          uri: tokenData.image,
          type: 'image/png'
        }] : [],
        category: 'image'
      }
    };

    // For demo purposes, return a placeholder URI
    // In production, implement actual IPFS upload
    console.log('Metadata to upload:', metadata);
    return 'https://placeholder-ipfs-uri.com/metadata.json';
  }

  // Get token info
  async getTokenInfo(mintAddress) {
    try {
      const mint = new PublicKey(mintAddress);
      const mintInfo = await this.connection.getParsedAccountInfo(mint);
      
      if (!mintInfo.value) {
        throw new Error('Token not found');
      }

      const data = mintInfo.value.data.parsed.info;
      
      return {
        mintAddress: mintAddress,
        decimals: data.decimals,
        supply: data.supply,
        mintAuthority: data.mintAuthority,
        freezeAuthority: data.freezeAuthority,
        isInitialized: data.isInitialized
      };
    } catch (error) {
      console.error('Failed to get token info:', error);
      throw error;
    }
  }

  // Update network connection
  updateNetwork() {
    this.initializeConnection();
  }
}

// Create singleton instance
export const tokenCreator = new TokenCreator();
export default tokenCreator;