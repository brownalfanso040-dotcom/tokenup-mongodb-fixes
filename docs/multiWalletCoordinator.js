// Multi-Wallet Coordinator for SPL Token Creation
// Handles multiple wallet operations for token distribution and liquidity provision

// Using global window.solanaWeb3 instead of ES6 imports for browser compatibility
const { Connection, PublicKey, Transaction, SystemProgram } = window.solanaWeb3 || {};
// Note: Using global window.solanaWeb3 from CDN instead of ES6 imports
// import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccount, mintTo } = window.solanaWeb3 || {};
import { getCurrentNetwork } from './config.js';

/**
 * MultiWalletCoordinator manages operations across multiple wallets
 * for token distribution and liquidity pool contributions
 */
class MultiWalletCoordinator {
  constructor(connection) {
    this.connection = connection;
    this.preparedTransactions = new Map();
    this.walletStates = new Map();
  }

  /**
   * Prepare multi-wallet token distribution
   * @param {Object} params - Distribution parameters
   * @returns {Promise<Object>} Prepared distribution data
   */
  async prepareTokenDistribution(params) {
    const {
      tokenMint,
      distributions, // Array of { wallet, amount }
      sourceWallet,
      priorityFee = 0 // Removed for transparency
    } = params;

    try {
      const distributionInstructions = [];
      const requiredAccounts = [];

      for (const distribution of distributions) {
        const { wallet, amount } = distribution;
        
        // Get or create associated token account
        const destinationATA = await getAssociatedTokenAddress(
          new PublicKey(tokenMint),
          new PublicKey(wallet)
        );

        // Check if ATA exists
        const accountInfo = await this.connection.getAccountInfo(destinationATA);
        if (!accountInfo) {
          // Create ATA instruction
          const createATAInstruction = createAssociatedTokenAccountInstruction(
            new PublicKey(sourceWallet), // payer
            destinationATA,
            new PublicKey(wallet), // owner
            new PublicKey(tokenMint)
          );
          distributionInstructions.push(createATAInstruction);
          requiredAccounts.push({
            address: destinationATA.toString(),
            type: 'token_account',
            owner: wallet
          });
        }

        // Create transfer instruction
        const sourceATA = await getAssociatedTokenAddress(
          new PublicKey(tokenMint),
          new PublicKey(sourceWallet)
        );

        const transferInstruction = createTransferInstruction(
          sourceATA,
          destinationATA,
          new PublicKey(sourceWallet),
          amount
        );
        distributionInstructions.push(transferInstruction);
      }

      return {
        instructions: distributionInstructions,
        requiredAccounts,
        estimatedFee: this.estimateTransactionFee(distributionInstructions.length, priorityFee),
        distributionCount: distributions.length
      };

    } catch (error) {
      throw new Error(`Token distribution preparation failed: ${error.message}`);
    }
  }

  /**
   * Prepare multi-wallet liquidity contributions
   * @param {Object} params - Liquidity parameters
   * @returns {Promise<Object>} Prepared liquidity data
   */
  async prepareLiquidityContributions(params) {
    const {
      tokenMint,
      contributors, // Array of { wallet, tokenAmount, solAmount }
      poolWallet,
      priorityFee = 0
    } = params;

    try {
      const contributionInstructions = [];
      const requiredSigners = [];
      const totalContributions = {
        tokens: 0,
        sol: 0
      };

      for (const contributor of contributors) {
        const { wallet, tokenAmount, solAmount } = contributor;
        const walletPubkey = new PublicKey(wallet);
        
        // Prepare token transfer if specified
        if (tokenAmount > 0) {
          const sourceATA = await getAssociatedTokenAddress(
            new PublicKey(tokenMint),
            walletPubkey
          );
          
          const poolATA = await getAssociatedTokenAddress(
            new PublicKey(tokenMint),
            new PublicKey(poolWallet)
          );

          // Ensure pool ATA exists
          const poolATAInfo = await this.connection.getAccountInfo(poolATA);
          if (!poolATAInfo) {
            const createPoolATAInstruction = createAssociatedTokenAccountInstruction(
              new PublicKey(poolWallet), // payer
              poolATA,
              new PublicKey(poolWallet), // owner
              new PublicKey(tokenMint)
            );
            contributionInstructions.push(createPoolATAInstruction);
          }

          const tokenTransferInstruction = createTransferInstruction(
            sourceATA,
            poolATA,
            walletPubkey,
            tokenAmount
          );
          contributionInstructions.push(tokenTransferInstruction);
          totalContributions.tokens += tokenAmount;
        }

        // Prepare SOL transfer if specified
        if (solAmount > 0) {
          const solTransferInstruction = SystemProgram.transfer({
            fromPubkey: walletPubkey,
            toPubkey: new PublicKey(poolWallet),
            lamports: solAmount
          });
          contributionInstructions.push(solTransferInstruction);
          totalContributions.sol += solAmount;
        }

        // Track required signers
        if (tokenAmount > 0 || solAmount > 0) {
          requiredSigners.push(wallet);
        }
      }

      return {
        instructions: contributionInstructions,
        requiredSigners,
        totalContributions,
        estimatedFee: this.estimateTransactionFee(contributionInstructions.length, priorityFee),
        contributorCount: contributors.length
      };

    } catch (error) {
      throw new Error(`Liquidity contribution preparation failed: ${error.message}`);
    }
  }

  /**
   * Ensure associated token accounts exist for multiple wallets
   * @param {Object} params - Account parameters
   * @returns {Promise<Array>} Created account instructions
   */
  async ensureAssociatedTokenAccounts(params) {
    const {
      tokenMint,
      wallets, // Array of wallet addresses
      payer
    } = params;

    const createInstructions = [];
    const existingAccounts = [];
    const newAccounts = [];

    for (const wallet of wallets) {
      const walletPubkey = new PublicKey(wallet);
      const ata = await getAssociatedTokenAddress(
        new PublicKey(tokenMint),
        walletPubkey
      );

      const accountInfo = await this.connection.getAccountInfo(ata);
      if (!accountInfo) {
        const createInstruction = createAssociatedTokenAccountInstruction(
          new PublicKey(payer),
          ata,
          walletPubkey,
          new PublicKey(tokenMint)
        );
        createInstructions.push(createInstruction);
        newAccounts.push({
          wallet,
          ata: ata.toString()
        });
      } else {
        existingAccounts.push({
          wallet,
          ata: ata.toString()
        });
      }
    }

    return {
      createInstructions,
      existingAccounts,
      newAccounts,
      totalAccounts: wallets.length
    };
  }

  /**
   * Validate wallet balances for operations
   * @param {Object} params - Validation parameters
   * @returns {Promise<Object>} Validation results
   */
  async validateWalletBalances(params) {
    const {
      wallets, // Array of { wallet, requiredSol, requiredTokens, tokenMint }
      includeRent = true
    } = params;

    const validationResults = [];
    const rentExemption = includeRent ? await this.connection.getMinimumBalanceForRentExemption(165) : 0;

    for (const walletInfo of wallets) {
      const { wallet, requiredSol = 0, requiredTokens = 0, tokenMint } = walletInfo;
      const walletPubkey = new PublicKey(wallet);
      
      try {
        // Check SOL balance
        const solBalance = await this.connection.getBalance(walletPubkey);
        const totalRequiredSol = requiredSol + rentExemption;
        const solSufficient = solBalance >= totalRequiredSol;

        let tokenBalance = 0;
        let tokenSufficient = true;

        // Check token balance if required
        if (requiredTokens > 0 && tokenMint) {
          const ata = await getAssociatedTokenAddress(
            new PublicKey(tokenMint),
            walletPubkey
          );
          
          const tokenAccount = await this.connection.getTokenAccountBalance(ata);
          tokenBalance = parseInt(tokenAccount.value.amount);
          tokenSufficient = tokenBalance >= requiredTokens;
        }

        validationResults.push({
          wallet,
          solBalance,
          tokenBalance,
          requiredSol: totalRequiredSol,
          requiredTokens,
          solSufficient,
          tokenSufficient,
          valid: solSufficient && tokenSufficient
        });

      } catch (error) {
        validationResults.push({
          wallet,
          error: error.message,
          valid: false
        });
      }
    }

    const allValid = validationResults.every(result => result.valid);
    const invalidWallets = validationResults.filter(result => !result.valid);

    return {
      allValid,
      results: validationResults,
      invalidWallets,
      totalWallets: wallets.length
    };
  }

  /**
   * Estimate transaction fee
   */
  estimateTransactionFee(instructionCount, priorityFee = 0) {
    // All fees removed for complete transparency
    return 0;
  }

  /**
   * Get coordinator status
   */
  getStatus() {
    return {
      preparedTransactions: this.preparedTransactions.size,
      trackedWallets: this.walletStates.size,
      network: getCurrentNetwork(),
      connection: {
        endpoint: this.connection.rpcEndpoint,
        commitment: this.connection.commitment
      }
    };
  }

  /**
   * Clear coordinator state
   */
  clearState() {
    this.preparedTransactions.clear();
    this.walletStates.clear();
  }

  /**
   * Store prepared transaction for later execution
   */
  storePreparedTransaction(id, transactionData) {
    this.preparedTransactions.set(id, {
      ...transactionData,
      preparedAt: Date.now()
    });
  }

  /**
   * Retrieve prepared transaction
   */
  getPreparedTransaction(id) {
    return this.preparedTransactions.get(id);
  }

  /**
   * Remove prepared transaction
   */
  removePreparedTransaction(id) {
    return this.preparedTransactions.delete(id);
  }
}

// Export class for instantiation with connection
export default MultiWalletCoordinator;
export { MultiWalletCoordinator };