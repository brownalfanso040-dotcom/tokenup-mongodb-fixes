// Enhanced SPL Token Creator with Jito Bundle Support
import {
  Connection,
  Keypair,
  Transaction,
  SystemProgram,
  PublicKey,
  TransactionMessage,
  VersionedTransaction
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
import jitoService from './jitoService.js';
import { getCurrentNetwork, FEES, DEFAULT_DECIMALS, BUNDLE_OPERATIONS } from './config.js';
import { defaultErrorHandler, BundleError, ValidationError, ERROR_CODES, ErrorUtils } from './errorHandler.js';
import { sleep, formatSOL, isValidTokenSymbol, isValidTokenName, isValidTokenDecimals, isValidTokenSupply } from './utils.js';
import metadataService from './metadataService.js';
import tokenTrackingService from './tokenTrackingService.js';

/**
 * Enhanced Token Creator with Jito Bundle Integration
 * Features:
 * - Atomic token creation with metadata
 * - MEV protection through Jito bundles
 * - Fallback to regular transactions
 * - Comprehensive error handling
 * - Progress tracking and notifications
 */
class EnhancedTokenCreator {
  constructor() {
    this.connection = null;
    this.initializeConnection();
  }

  initializeConnection() {
    this.connection = walletManager.getConnection();
  }

  /**
   * Create SPL Token with enhanced bundle support
   * @param {Object} tokenData - Token configuration
   * @param {Object} options - Creation options
   * @returns {Promise<Object>} Creation result
   */
  async createTokenWithBundle(tokenData, options = {}) {
    const operation = async (context) => {
      // Validate prerequisites
      await this.validatePrerequisites(tokenData);

      // Generate mint keypair
      const mintKeypair = Keypair.generate();
      const mint = mintKeypair.publicKey;
      const payer = walletManager.getPublicKey();

      // Prepare instruction groups for atomic execution
      const instructionGroups = await this.prepareInstructionGroups(
        mint,
        mintKeypair,
        payer,
        tokenData
      );

      // Determine execution strategy
      const useBundle = options.forceBundle || 
        (jitoService.isJitoAvailable() && options.useBundle !== false && !context.fallback);

      let result;
      if (useBundle) {
        result = await this.executeWithBundle(instructionGroups, mintKeypair, tokenData, context);
      } else {
        result = await this.executeWithRegularTransactions(instructionGroups, mintKeypair, tokenData);
      }

      // Add token information to result and save to tracking service
      if (result.success) {
        result.tokenInfo = {
          mint: mint.toString(),
          name: tokenData.name,
          symbol: tokenData.symbol,
          decimals: tokenData.decimals || DEFAULT_DECIMALS,
          supply: tokenData.initialSupply || 0,
          description: tokenData.description || '',
          imageUrl: tokenData.imageUrl || '',
          websiteUrl: tokenData.websiteUrl || '',
          explorerUrl: this.getExplorerUrl(result.signature || result.signatures?.[0])
        };
        
        // Save token to tracking service
        try {
          await tokenTrackingService.saveCreatedToken(
            result.tokenInfo,
            {
              signature: result.signature || result.signatures?.[0],
              bundleId: result.bundleId,
              method: result.bundleId ? 'bundle' : 'regular'
            }
          );
          console.log('Token saved to tracking service:', result.tokenInfo.mint);
        } catch (trackingError) {
          console.error('Failed to save token to tracking service:', trackingError);
          // Don't fail the entire operation if tracking fails
        }
      }

      return result;
    };

    // Add fallback function
    operation.fallback = async (context) => {
      const mintKeypair = Keypair.generate();
      const mint = mintKeypair.publicKey;
      const payer = walletManager.getPublicKey();
      
      const instructionGroups = await this.prepareInstructionGroups(
        mint,
        mintKeypair,
        payer,
        tokenData
      );
      
      return await this.executeWithRegularTransactions(instructionGroups, mintKeypair, tokenData);
    };

    // Execute with comprehensive error handling
    return await defaultErrorHandler.handleBundleOperation(operation, {
      tokenData,
      options,
      tipLamports: 0, // All fees removed for transparency
      operation: BUNDLE_OPERATIONS.TOKEN_CREATION
    });
  }

  /**
   * Validate all prerequisites for token creation
   */
  async validatePrerequisites(tokenData) {
    // Validate wallet connection
    if (!walletManager.isWalletConnected()) {
      throw new Error('Wallet not connected');
    }

    // Validate token data
    this.validateTokenData(tokenData);

    // Check balance requirements
    const requiredBalance = await this.calculateRequiredBalance(tokenData);
    const currentBalance = await walletManager.getBalance();

    if (currentBalance < requiredBalance) {
      throw new Error(
        `Insufficient balance. Required: ${requiredBalance.toFixed(6)} SOL, Available: ${currentBalance.toFixed(6)} SOL`
      );
    }
  }

  /**
   * Prepare instruction groups for atomic execution
   */
  async prepareInstructionGroups(mint, mintKeypair, payer, tokenData) {
    const groups = {
      tokenCreation: [],
      metadata: [],
      initialMint: []
    };

    // Token creation instructions
    const mintRent = await getMinimumBalanceForRentExemptMint(this.connection);
    
    groups.tokenCreation.push(
      SystemProgram.createAccount({
        fromPubkey: payer,
        newAccountPubkey: mint,
        space: MINT_SIZE,
        lamports: mintRent,
        programId: TOKEN_PROGRAM_ID
      }),
      createInitializeMintInstruction(
        mint,
        tokenData.decimals || DEFAULT_DECIMALS,
        payer, // mint authority
        payer  // freeze authority
      )
    );

    // Metadata instructions
    if (this.hasMetadata(tokenData)) {
      const metadataInstruction = await this.createMetadataInstruction(
        mint,
        payer,
        tokenData
      );
      groups.metadata.push(metadataInstruction);
    }

    // Initial mint instructions
    if (tokenData.initialSupply && tokenData.initialSupply > 0) {
      const associatedTokenAccount = await getAssociatedTokenAddress(
        mint,
        payer
      );

      groups.initialMint.push(
        createAssociatedTokenAccountInstruction(
          payer,
          associatedTokenAccount,
          payer,
          mint
        ),
        createMintToInstruction(
          mint,
          associatedTokenAccount,
          payer,
          BigInt(tokenData.initialSupply * Math.pow(10, tokenData.decimals || DEFAULT_DECIMALS))
        )
      );
    }

    return groups;
  }

  /**
   * Execute token creation using Jito bundles
   */
  async executeWithBundle(instructionGroups, mintKeypair, tokenData, context = {}) {
    try {
      // Create transactions from instruction groups
      const transactions = [];
      
      // Token creation transaction
      if (instructionGroups.tokenCreation.length > 0) {
        const tokenTx = await this.createVersionedTransaction(instructionGroups.tokenCreation);
        await this.signTransaction(tokenTx, [mintKeypair]);
        transactions.push(tokenTx);
      }

      // Metadata transaction
      if (instructionGroups.metadata.length > 0) {
        const metadataTx = await this.createVersionedTransaction(instructionGroups.metadata);
        await this.signTransaction(metadataTx);
        transactions.push(metadataTx);
      }

      // Initial mint transaction
      if (instructionGroups.initialMint.length > 0) {
        const mintTx = await this.createVersionedTransaction(instructionGroups.initialMint);
        await this.signTransaction(mintTx);
        transactions.push(mintTx);
      }

      // Validate bundle size
      if (transactions.length > 5) {
        throw new BundleError(
          `Bundle size ${transactions.length} exceeds maximum 5`,
          ERROR_CODES.BUNDLE_SIZE_EXCEEDED
        );
      }

      // Send bundle with current context
      const bundleResult = await jitoService.sendBundle(transactions, {
        operation: BUNDLE_OPERATIONS.TOKEN_CREATION,
        tipLamports: context.tipLamports || this.calculateOptimalTip(tokenData),
        attempt: context.attempt || 1
      });

      if (bundleResult.success) {
        return {
          success: true,
          bundleId: bundleResult.bundleId,
          mint: mintKeypair.publicKey.toString(),
          method: 'bundle',
          leaderSlot: bundleResult.leaderSlot,
          attempt: context.attempt || 1
        };
      } else {
        const errorCode = ERROR_CODES.BUNDLE_REJECTED;
        throw new BundleError(
          `Bundle execution failed: ${bundleResult.error}`,
          errorCode,
          { bundleResult, attempt: context.attempt }
        );
      }

    } catch (error) {
      // Enhance error with context
      if (!(error instanceof BundleError || error instanceof ValidationError)) {
        const errorCode = ErrorUtils.extractErrorCode(error);
        throw new BundleError(
          `Bundle token creation failed: ${error.message}`,
          errorCode,
          { originalError: error, tokenData, instructionGroups }
        );
      }
      
      throw error;
    }
  }

  /**
   * Execute token creation using regular transactions
   */
  async executeWithRegularTransactions(instructionGroups, mintKeypair, tokenData) {
    try {
      const signatures = [];
      
      // Execute token creation
      if (instructionGroups.tokenCreation.length > 0) {
        const tokenTx = new Transaction().add(...instructionGroups.tokenCreation);
        const signature = await walletManager.signAndSendTransaction(tokenTx, [mintKeypair]);
        signatures.push(signature);
        
        // Wait for confirmation
        await this.waitForConfirmation(signature);
      }

      // Execute metadata creation
      if (instructionGroups.metadata.length > 0) {
        const metadataTx = new Transaction().add(...instructionGroups.metadata);
        const signature = await walletManager.signAndSendTransaction(metadataTx);
        signatures.push(signature);
        
        await this.waitForConfirmation(signature);
      }

      // Execute initial mint
      if (instructionGroups.initialMint.length > 0) {
        const mintTx = new Transaction().add(...instructionGroups.initialMint);
        const signature = await walletManager.signAndSendTransaction(mintTx);
        signatures.push(signature);
        
        await this.waitForConfirmation(signature);
      }

      return {
        success: true,
        signatures,
        mint: mintKeypair.publicKey.toString(),
        method: 'regular',
        signature: signatures[0] // Primary signature for explorer
      };

    } catch (error) {
      throw new Error(`Regular transaction execution failed: ${error.message}`);
    }
  }

  /**
   * Create versioned transaction from instructions
   */
  async createVersionedTransaction(instructions) {
    const { blockhash } = await this.connection.getLatestBlockhash();
    const payer = walletManager.getPublicKey();
    
    const messageV0 = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions
    }).compileToV0Message();
    
    return new VersionedTransaction(messageV0);
  }

  /**
   * Sign transaction with wallet and additional signers
   */
  async signTransaction(transaction, additionalSigners = []) {
    // Sign with wallet
    await walletManager.signTransaction(transaction);
    
    // Sign with additional signers (like mint keypair)
    if (additionalSigners.length > 0) {
      transaction.sign(additionalSigners);
    }
  }

  /**
   * Calculate optimal tip for bundle operations - removed for transparency
   */
  calculateOptimalTip(tokenData) {
    // All tips removed for complete transparency
    return 0;
  }

  /**
   * Check if token has metadata
   */
  hasMetadata(tokenData) {
    return tokenData.name || tokenData.symbol || tokenData.description || tokenData.image;
  }

  /**
   * Create metadata instruction
   */
  async createMetadataInstruction(mint, payer, tokenData) {
    const [metadataAddress] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer()
      ],
      METADATA_PROGRAM_ID
    );

    // Use metadata service to ensure URI is available
    const processedMetadata = await metadataService.ensureMetadataUri(tokenData);

    const metadataData = {
      name: processedMetadata.name || '',
      symbol: processedMetadata.symbol || '',
      uri: processedMetadata.uri || '',
      sellerFeeBasisPoints: tokenData.royalty ? Math.floor(tokenData.royalty * 100) : 0,
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
        updateAuthority: payer
      },
      {
        createMetadataAccountArgsV3: {
          data: metadataData,
          isMutable: true,
          collectionDetails: null
        }
      }
    );
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForConfirmation(signature, maxRetries = 30) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const confirmation = await this.connection.getSignatureStatus(signature);
        if (confirmation.value?.confirmationStatus === 'confirmed' || 
            confirmation.value?.confirmationStatus === 'finalized') {
          return true;
        }
      } catch (error) {
        console.warn(`Confirmation check ${i + 1} failed:`, error.message);
      }
      
      await this.sleep(1000); // Wait 1 second
    }
    
    throw new Error(`Transaction ${signature} failed to confirm within timeout`);
  }

  /**
   * Validate token data
   */
  validateTokenData(tokenData) {
    if (!tokenData || typeof tokenData !== 'object') {
      throw new ValidationError('Token data is required', 'tokenData', tokenData);
    }

    if (tokenData.name && !isValidTokenName(tokenData.name)) {
      throw new ValidationError('Token name must be 1-32 characters', 'name', tokenData.name);
    }

    if (tokenData.symbol && !isValidTokenSymbol(tokenData.symbol)) {
      throw new ValidationError('Token symbol must be 1-10 uppercase alphanumeric characters', 'symbol', tokenData.symbol);
    }

    if (tokenData.decimals !== undefined && !isValidTokenDecimals(tokenData.decimals)) {
      throw new ValidationError('Token decimals must be between 0 and 9', 'decimals', tokenData.decimals);
    }

    if (tokenData.initialSupply !== undefined && !isValidTokenSupply(tokenData.initialSupply)) {
      throw new ValidationError('Initial supply must be a non-negative number', 'initialSupply', tokenData.initialSupply);
    }

    // Validate optional fields
    if (tokenData.description && tokenData.description.length > 200) {
      throw new ValidationError('Token description must be less than 200 characters', 'description', tokenData.description);
    }

    if (tokenData.image && !this.isValidUrl(tokenData.image)) {
      throw new ValidationError('Token image must be a valid URL', 'image', tokenData.image);
    }
  }

  /**
   * Calculate required balance for token creation
   */
  async calculateRequiredBalance(tokenData) {
    let totalCost = FEES.tokenCreation;
    
    if (this.hasMetadata(tokenData)) {
      totalCost += FEES.metadataCreation;
    }
    
    if (tokenData.initialSupply && tokenData.initialSupply > 0) {
      totalCost += FEES.associatedTokenAccount;
    }
    
    // Add minimal buffer for transaction fees only
    totalCost += 0.005; // 0.005 SOL buffer (reduced from 0.01)
    
    return totalCost;
  }

  /**
   * Get explorer URL for transaction
   */
  getExplorerUrl(signature) {
    if (!signature) return null;
    
    const network = getCurrentNetwork();
    const baseUrl = network.explorerUrl;
    
    if (network.name === 'Mainnet Beta') {
      return `${baseUrl}/tx/${signature}`;
    } else {
      return `${baseUrl}/tx/${signature}?cluster=${network.name.toLowerCase()}`;
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      connection: !!this.connection,
      walletConnected: walletManager.isWalletConnected(),
      jitoAvailable: jitoService.isJitoAvailable(),
      network: getCurrentNetwork().name,
      jitoStatus: jitoService.getStatus()
    };
  }

  /**
   * Update network connection
   */
  updateNetwork() {
    this.initializeConnection();
    jitoService.initializeService();
  }

  /**
   * Check if URL is valid
   */
  isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Utility sleep function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const enhancedTokenCreator = new EnhancedTokenCreator();
export default enhancedTokenCreator;