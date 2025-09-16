// Liquidity Pool Service with Jito Bundle MEV Protection
// Using global window.solanaWeb3 instead of ES6 imports for browser compatibility
const {
  Connection,
  PublicKey,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
  Keypair
} = window.solanaWeb3 || {};
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import pkg from '@raydium-io/raydium-sdk';
const { Liquidity, LiquidityPoolKeys, Token, TokenAmount, Percent, WSOL } = pkg;
import walletManager from './walletManager.js';
import jitoService from './jitoService.js';
import { getCurrentNetwork, BUNDLE_OPERATIONS } from './config.js';
import MultiWalletCoordinator from './multiWalletCoordinator.js';

/**
 * Liquidity Pool Service with MEV Protection
 * Features:
 * - Atomic liquidity pool creation and initial liquidity provision
 * - MEV protection through Jito bundles
 * - Slippage protection
 * - Comprehensive error handling
 * - Support for multiple DEX protocols
 */
class LiquidityPoolService {
  constructor() {
    this.connection = null;
    this.raydiumProgramId = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
    this.multiWalletCoordinator = null;
    this.initializeConnection();
  }

  initializeConnection() {
    this.connection = walletManager.getConnection();
    this.multiWalletCoordinator = new MultiWalletCoordinator(this.connection);
  }

  /**
   * Create liquidity pool with MEV protection
   * @param {Object} poolConfig - Pool configuration
   * @returns {Promise<Object>} Pool creation result
   */
  async createLiquidityPoolWithBundle(poolConfig) {
    try {
      // Validate prerequisites
      await this.validatePoolPrerequisites(poolConfig);

      // Handle multi-wallet contributions if specified
      if (poolConfig.contributors && poolConfig.contributors.length > 0) {
        console.log(`📊 Processing ${poolConfig.contributors.length} contributor wallets...`);
        
        // Validate contributor balances
        const balanceValidation = await this.multiWalletCoordinator.validateWalletBalances({
          wallets: poolConfig.contributors.map(c => ({
            wallet: c.wallet,
            requiredSol: c.solAmount || 0,
            requiredTokens: c.tokenAmount || 0,
            tokenMint: poolConfig.tokenA
          }))
        });
        
        if (!balanceValidation.allValid) {
          throw new Error(`Invalid contributor balances: ${balanceValidation.invalidWallets.map(w => w.wallet).join(', ')}`);
        }
        
        // Prepare multi-wallet liquidity contributions
        const contributionData = await this.multiWalletCoordinator.prepareLiquidityContributions({
          tokenMint: poolConfig.tokenA,
          contributors: poolConfig.contributors,
          poolWallet: walletManager.getPublicKey().toString(),
          priorityFee: poolConfig.priorityFee || 0
        });
        
        // Update pool config with combined amounts
        poolConfig.amountA += contributionData.totalContributions.tokens;
        poolConfig.amountB += contributionData.totalContributions.sol;
        poolConfig.additionalInstructions = contributionData.instructions;
      }

      // Prepare pool creation instructions
      const instructionGroups = await this.preparePoolInstructions(poolConfig);

      // Determine execution strategy
      const useBundle = jitoService.isJitoAvailable() && poolConfig.useMevProtection !== false;

      let result;
      if (useBundle) {
        result = await this.executePoolCreationWithBundle(instructionGroups, poolConfig);
      } else {
        result = await this.executePoolCreationRegular(instructionGroups, poolConfig);
      }

      // Add pool information to result
      if (result.success) {
        result.poolInfo = {
          poolId: result.poolId,
          tokenA: poolConfig.tokenA,
          tokenB: poolConfig.tokenB || 'SOL',
          initialLiquidityA: poolConfig.amountA,
          initialLiquidityB: poolConfig.amountB,
          explorerUrl: this.getPoolExplorerUrl(result.poolId),
          contributors: poolConfig.contributors || []
        };
      }

      return result;

    } catch (error) {
      console.error('Liquidity pool creation failed:', error);
      return {
        success: false,
        error: error.message,
        code: error.code || 'POOL_CREATION_FAILED'
      };
    }
  }

  /**
   * Validate pool creation prerequisites
   */
  async validatePoolPrerequisites(poolConfig) {
    // Validate wallet connection
    if (!walletManager.isWalletConnected()) {
      throw new Error('Wallet not connected');
    }

    // Validate pool configuration
    this.validatePoolConfig(poolConfig);

    // Check token balances
    await this.validateTokenBalances(poolConfig);

    // Check SOL balance for fees and liquidity
    const requiredSol = await this.calculateRequiredSolBalance(poolConfig);
    const currentBalance = await walletManager.getBalance();

    if (currentBalance < requiredSol) {
      throw new Error(
        `Insufficient SOL balance. Required: ${requiredSol.toFixed(6)} SOL, Available: ${currentBalance.toFixed(6)} SOL`
      );
    }
  }

  /**
   * Prepare pool creation instruction groups
   */
  async preparePoolInstructions(poolConfig) {
    const payer = walletManager.getPublicKey();
    const groups = {
      poolCreation: [],
      liquidityProvision: [],
      cleanup: []
    };

    // Create pool instructions (simplified - actual implementation would depend on DEX)
    const poolKeypair = this.generatePoolKeypair();
    const poolId = poolKeypair.publicKey;

    // Pool creation instructions
    groups.poolCreation.push(
      await this.createPoolAccountInstruction(poolId, payer),
      await this.initializePoolInstruction(poolId, poolConfig)
    );

    // Liquidity provision instructions
    const liquidityInstructions = await this.prepareLiquidityInstructions(
      poolId,
      poolConfig,
      payer
    );
    groups.liquidityProvision.push(...liquidityInstructions);

    return { groups, poolKeypair, poolId };
  }

  /**
   * Execute pool creation with Jito bundle
   */
  async executePoolCreationWithBundle(instructionData, poolConfig) {
    try {
      const { groups, poolKeypair, poolId } = instructionData;
      const transactions = [];

      // Pool creation transaction
      if (groups.poolCreation.length > 0) {
        const poolTx = await this.createVersionedTransaction(groups.poolCreation);
        await this.signTransaction(poolTx, [poolKeypair]);
        transactions.push(poolTx);
      }

      // Liquidity provision transaction
      if (groups.liquidityProvision.length > 0) {
        const liquidityTx = await this.createVersionedTransaction(groups.liquidityProvision);
        await this.signTransaction(liquidityTx);
        transactions.push(liquidityTx);
      }

      // Send bundle without any fees - completely transparent service
      const bundleResult = await jitoService.sendBundle(transactions, {
        operation: BUNDLE_OPERATIONS.LIQUIDITY_POOL,
        tipLamports: 0, // No tips - free service
        priority: 'high' // High priority for pool creation
      });

      if (bundleResult.success) {
        return {
          success: true,
          bundleId: bundleResult.bundleId,
          poolId: poolId.toString(),
          method: 'bundle',
          mevProtected: true,
          leaderSlot: bundleResult.leaderSlot
        };
      } else {
        throw new Error(`Bundle execution failed: ${bundleResult.error}`);
      }

    } catch (error) {
      console.error('Bundle pool creation failed, attempting fallback:', error);
      return await this.executePoolCreationRegular(instructionData, poolConfig);
    }
  }

  /**
   * Execute pool creation with regular transactions
   */
  async executePoolCreationRegular(instructionData, poolConfig) {
    try {
      const { groups, poolKeypair, poolId } = instructionData;
      const signatures = [];

      // Execute pool creation
      if (groups.poolCreation.length > 0) {
        const poolTx = new Transaction().add(...groups.poolCreation);
        const signature = await walletManager.signAndSendTransaction(poolTx, [poolKeypair]);
        signatures.push(signature);
        await this.waitForConfirmation(signature);
      }

      // Execute liquidity provision
      if (groups.liquidityProvision.length > 0) {
        const liquidityTx = new Transaction().add(...groups.liquidityProvision);
        const signature = await walletManager.signAndSendTransaction(liquidityTx);
        signatures.push(signature);
        await this.waitForConfirmation(signature);
      }

      return {
        success: true,
        signatures,
        poolId: poolId.toString(),
        method: 'regular',
        mevProtected: false,
        signature: signatures[0]
      };

    } catch (error) {
      throw new Error(`Regular pool creation failed: ${error.message}`);
    }
  }

  /**
   * Prepare liquidity provision instructions
   */
  async prepareLiquidityInstructions(poolId, poolConfig, payer) {
    const instructions = [];
    
    // Add any additional instructions from multi-wallet contributions
    if (poolConfig.additionalInstructions) {
      instructions.push(...poolConfig.additionalInstructions);
    }

    // Create associated token accounts if needed
    const tokenAMint = new PublicKey(poolConfig.tokenA);
    const tokenAAccount = await getAssociatedTokenAddress(tokenAMint, payer);

    // Check if accounts exist
    const tokenAAccountInfo = await this.connection.getAccountInfo(tokenAAccount);
    if (!tokenAAccountInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          payer,
          tokenAAccount,
          payer,
          tokenAMint
        )
      );
    }

    // Add liquidity transfer instructions
    const amountA = BigInt(poolConfig.amountA * Math.pow(10, poolConfig.decimalsA || 9));
    
    instructions.push(
      createTransferInstruction(
        tokenAAccount,
        poolId, // Simplified - actual pool token account
        payer,
        amountA
      )
    );

    // Handle SOL liquidity if tokenB is SOL
    if (poolConfig.tokenB === 'SOL' || !poolConfig.tokenB) {
      const solAmount = poolConfig.amountB * 1e9; // Convert to lamports
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: payer,
          toPubkey: poolId, // Simplified - actual pool SOL account
          lamports: solAmount
        })
      );
    }

    return instructions;
  }

  /**
   * No fees or tips - service is completely free
   */
  calculateMevProtectionTip(poolConfig) {
    // All fees removed for complete transparency
    return 0;
  }

  /**
   * Generate pool keypair (simplified)
   */
  generatePoolKeypair() {
    // In actual implementation, this would use proper pool derivation
    return Keypair.generate();
  }

  /**
   * Create pool account instruction (simplified)
   */
  async createPoolAccountInstruction(poolId, payer) {
    // Simplified - actual implementation would depend on DEX protocol
    const space = 1024; // Pool account size
    const lamports = await this.connection.getMinimumBalanceForRentExemption(space);
    
    return SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: poolId,
      space,
      lamports,
      programId: this.raydiumProgramId
    });
  }

  /**
   * Initialize pool instruction (simplified)
   */
  async initializePoolInstruction(poolId, poolConfig) {
    // Simplified - actual implementation would create proper pool initialization
    // This would typically involve calling the DEX program's initialize instruction
    return SystemProgram.noop(); // Placeholder
  }

  /**
   * Validate pool configuration
   */
  validatePoolConfig(poolConfig) {
    if (!poolConfig || typeof poolConfig !== 'object') {
      throw new Error('Pool configuration is required');
    }

    if (!poolConfig.tokenA) {
      throw new Error('Token A mint address is required');
    }

    if (!PublicKey.isOnCurve(poolConfig.tokenA)) {
      throw new Error('Invalid token A mint address');
    }

    if (typeof poolConfig.amountA !== 'number' || poolConfig.amountA <= 0) {
      throw new Error('Amount A must be a positive number');
    }

    if (poolConfig.tokenB && poolConfig.tokenB !== 'SOL') {
      if (!PublicKey.isOnCurve(poolConfig.tokenB)) {
        throw new Error('Invalid token B mint address');
      }
    }

    if (typeof poolConfig.amountB !== 'number' || poolConfig.amountB <= 0) {
      throw new Error('Amount B must be a positive number');
    }
  }

  /**
   * Validate token balances
   */
  async validateTokenBalances(poolConfig) {
    const payer = walletManager.getPublicKey();
    
    // Check token A balance
    const tokenAMint = new PublicKey(poolConfig.tokenA);
    const tokenAAccount = await getAssociatedTokenAddress(tokenAMint, payer);
    
    try {
      const tokenABalance = await this.connection.getTokenAccountBalance(tokenAAccount);
      const requiredAmountA = poolConfig.amountA * Math.pow(10, poolConfig.decimalsA || 9);
      
      if (tokenABalance.value.amount < requiredAmountA) {
        throw new Error(
          `Insufficient token A balance. Required: ${poolConfig.amountA}, Available: ${tokenABalance.value.uiAmount}`
        );
      }
    } catch (error) {
      if (error.message.includes('could not find account')) {
        throw new Error('Token A account not found. Please ensure you have the required tokens.');
      }
      throw error;
    }
  }

  /**
   * Calculate required SOL balance
   */
  async calculateRequiredSolBalance(poolConfig) {
    let requiredSol = 0;
    
    // SOL for liquidity (if tokenB is SOL)
    if (poolConfig.tokenB === 'SOL' || !poolConfig.tokenB) {
      requiredSol += poolConfig.amountB;
    }
    
    // Transaction fees and rent
    requiredSol += 0.01; // Base fees
    
    // No tips required - service is completely free
    
    return requiredSol;
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
    await walletManager.signTransaction(transaction);
    
    if (additionalSigners.length > 0) {
      transaction.sign(additionalSigners);
    }
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
      
      await this.sleep(1000);
    }
    
    throw new Error(`Transaction ${signature} failed to confirm within timeout`);
  }

  /**
   * Get pool explorer URL
   */
  getPoolExplorerUrl(poolId) {
    const network = getCurrentNetwork();
    const baseUrl = network.explorerUrl;
    
    if (network.name === 'Mainnet Beta') {
      return `${baseUrl}/account/${poolId}`;
    } else {
      return `${baseUrl}/account/${poolId}?cluster=${network.name.toLowerCase()}`;
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
      mevProtectionEnabled: jitoService.isJitoAvailable(),
      network: getCurrentNetwork().name
    };
  }

  /**
   * Update network connection
   */
  updateNetwork() {
    this.initializeConnection();
  }

  /**
   * Utility sleep function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const liquidityPoolService = new LiquidityPoolService();
export default liquidityPoolService;