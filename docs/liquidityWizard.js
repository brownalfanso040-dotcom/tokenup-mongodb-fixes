// Comprehensive Liquidity Creation Wizard
import liquidityPoolService from './liquidityPoolService.js';
import balanceVerificationService from './balanceVerificationService.js';
import liquidityVersionControl from './liquidityVersionControl.js';
import walletManager from './walletManager.js';
import { EventEmitter } from 'events';

/**
 * Liquidity Creation Wizard
 * Provides step-by-step guidance for creating liquidity pools
 */
class LiquidityWizard extends EventEmitter {
  constructor() {
    super();
    this.currentStep = 0;
    this.wizardData = {};
    this.operation = null;
    this.validationResults = null;
    this.isProcessing = false;
    
    this.steps = [
      {
        id: 'welcome',
        title: 'Welcome to Liquidity Creation',
        description: 'Create a liquidity pool for your token with MEV protection',
        component: 'WelcomeStep'
      },
      {
        id: 'token-selection',
        title: 'Select Token',
        description: 'Choose the token for liquidity pool creation',
        component: 'TokenSelectionStep'
      },
      {
        id: 'balance-verification',
        title: 'Verify Balances',
        description: 'Check your token and SOL balances',
        component: 'BalanceVerificationStep'
      },
      {
        id: 'pool-configuration',
        title: 'Configure Pool',
        description: 'Set liquidity amounts and pool parameters',
        component: 'PoolConfigurationStep'
      },
      {
        id: 'review-confirm',
        title: 'Review & Confirm',
        description: 'Review your configuration before creation',
        component: 'ReviewConfirmStep'
      },
      {
        id: 'execution',
        title: 'Creating Pool',
        description: 'Executing liquidity pool creation',
        component: 'ExecutionStep'
      },
      {
        id: 'completion',
        title: 'Pool Created',
        description: 'Your liquidity pool has been created successfully',
        component: 'CompletionStep'
      }
    ];

    this.initializeEventListeners();
  }

  /**
   * Initialize event listeners
   */
  initializeEventListeners() {
    // Listen to balance updates
    balanceVerificationService.on('balanceUpdated', (balanceData) => {
      this.emit('balanceUpdated', balanceData);
      this.updateUI('balance-updated', balanceData);
    });

    // Listen to validation results
    balanceVerificationService.on('validationCompleted', (validation) => {
      this.validationResults = validation;
      this.emit('validationCompleted', validation);
      this.updateUI('validation-completed', validation);
    });

    // Listen to operation updates
    liquidityVersionControl.on('statusUpdated', (update) => {
      this.emit('operationUpdated', update);
      this.updateUI('operation-updated', update);
    });
  }

  /**
   * Start the liquidity creation wizard
   * @param {Object} initialData - Initial wizard data
   */
  async startWizard(initialData = {}) {
    try {
      this.currentStep = 0;
      this.wizardData = { ...initialData };
      this.isProcessing = false;
      
      // Initialize operation tracking
      this.operation = liquidityVersionControl.initializeOperation({
        type: 'liquidity_creation',
        wizard: true,
        initialData: initialData
      });

      // Start balance monitoring
      const tokensToMonitor = initialData.tokenAddress ? [initialData.tokenAddress] : [];
      balanceVerificationService.startMonitoring(tokensToMonitor);

      this.emit('wizardStarted', {
        operationId: this.operation.id,
        currentStep: this.currentStep,
        totalSteps: this.steps.length
      });

      this.renderCurrentStep();
      
    } catch (error) {
      console.error('Error starting wizard:', error);
      this.emit('wizardError', { step: 'initialization', error: error.message });
    }
  }

  /**
   * Navigate to next step
   */
  async nextStep() {
    if (this.currentStep >= this.steps.length - 1) {
      return this.completeWizard();
    }

    const currentStepData = this.steps[this.currentStep];
    
    // Validate current step before proceeding
    const validation = await this.validateCurrentStep();
    if (!validation.valid) {
      this.emit('stepValidationFailed', {
        step: currentStepData.id,
        errors: validation.errors
      });
      return false;
    }

    // Create checkpoint before moving to next step
    if (this.operation) {
      liquidityVersionControl.createCheckpoint(
        this.operation.id,
        `Completed step: ${currentStepData.title}`
      );
    }

    this.currentStep++;
    this.emit('stepChanged', {
      previousStep: this.currentStep - 1,
      currentStep: this.currentStep,
      stepData: this.steps[this.currentStep]
    });

    this.renderCurrentStep();
    return true;
  }

  /**
   * Navigate to previous step
   */
  previousStep() {
    if (this.currentStep <= 0) {
      return false;
    }

    this.currentStep--;
    this.emit('stepChanged', {
      previousStep: this.currentStep + 1,
      currentStep: this.currentStep,
      stepData: this.steps[this.currentStep]
    });

    this.renderCurrentStep();
    return true;
  }

  /**
   * Jump to specific step
   * @param {number} stepIndex - Target step index
   */
  goToStep(stepIndex) {
    if (stepIndex < 0 || stepIndex >= this.steps.length) {
      return false;
    }

    const previousStep = this.currentStep;
    this.currentStep = stepIndex;
    
    this.emit('stepChanged', {
      previousStep,
      currentStep: this.currentStep,
      stepData: this.steps[this.currentStep]
    });

    this.renderCurrentStep();
    return true;
  }

  /**
   * Update wizard data
   * @param {Object} data - Data to merge with wizard data
   */
  updateWizardData(data) {
    this.wizardData = { ...this.wizardData, ...data };
    
    // Update operation with new data
    if (this.operation) {
      liquidityVersionControl.updateOperationStatus(
        this.operation.id,
        'configuring',
        { wizardData: this.wizardData }
      );
    }

    this.emit('dataUpdated', { data, wizardData: this.wizardData });
  }

  /**
   * Validate current step
   * @returns {Object} Validation result
   */
  async validateCurrentStep() {
    const step = this.steps[this.currentStep];
    const validation = { valid: true, errors: [], warnings: [] };

    switch (step.id) {
      case 'welcome':
        // Always valid
        break;

      case 'token-selection':
        if (!this.wizardData.tokenAddress) {
          validation.valid = false;
          validation.errors.push('Token address is required');
        } else {
          try {
            // Validate token address format
            new PublicKey(this.wizardData.tokenAddress);
          } catch (error) {
            validation.valid = false;
            validation.errors.push('Invalid token address format');
          }
        }
        break;

      case 'balance-verification':
        if (this.wizardData.tokenAddress) {
          const balanceValidation = await balanceVerificationService.validateLiquidityRequirements({
            tokenAddress: this.wizardData.tokenAddress,
            tokenAmount: this.wizardData.tokenAmount || 0,
            solAmount: this.wizardData.solAmount || 0,
            fees: 0.01
          });
          
          if (!balanceValidation.valid) {
            validation.valid = false;
            validation.errors.push(...balanceValidation.errors.map(e => e.message));
          }
          
          validation.warnings.push(...balanceValidation.warnings.map(w => w.message));
        }
        break;

      case 'pool-configuration':
        if (!this.wizardData.tokenAmount || this.wizardData.tokenAmount <= 0) {
          validation.valid = false;
          validation.errors.push('Token amount must be greater than 0');
        }
        
        if (!this.wizardData.solAmount || this.wizardData.solAmount <= 0) {
          validation.valid = false;
          validation.errors.push('SOL amount must be greater than 0');
        }
        break;

      case 'review-confirm':
        // Final validation before execution
        const finalValidation = await this.performFinalValidation();
        if (!finalValidation.valid) {
          validation.valid = false;
          validation.errors.push(...finalValidation.errors);
        }
        break;

      default:
        // Other steps are always valid
        break;
    }

    return validation;
  }

  /**
   * Perform final validation before execution
   */
  async performFinalValidation() {
    const validation = { valid: true, errors: [] };

    try {
      // Check wallet connection
      if (!walletManager.isWalletConnected()) {
        validation.valid = false;
        validation.errors.push('Wallet not connected');
        return validation;
      }

      // Validate balances one more time
      const balanceValidation = await balanceVerificationService.validateLiquidityRequirements({
        tokenAddress: this.wizardData.tokenAddress,
        tokenAmount: this.wizardData.tokenAmount,
        solAmount: this.wizardData.solAmount,
        fees: 0.01,
        minimumSolReserve: 0.1
      });

      if (!balanceValidation.valid) {
        validation.valid = false;
        validation.errors.push(...balanceValidation.errors.map(e => e.message));
      }

      // Validate pool configuration
      try {
        liquidityPoolService.validatePoolConfig({
          tokenA: this.wizardData.tokenAddress,
          amountA: this.wizardData.tokenAmount,
          tokenB: 'SOL',
          amountB: this.wizardData.solAmount,
          decimalsA: this.wizardData.tokenDecimals || 9
        });
      } catch (error) {
        validation.valid = false;
        validation.errors.push(`Pool configuration error: ${error.message}`);
      }

    } catch (error) {
      validation.valid = false;
      validation.errors.push(`Validation error: ${error.message}`);
    }

    return validation;
  }

  /**
   * Execute liquidity pool creation
   */
  async executePoolCreation() {
    if (this.isProcessing) {
      return { success: false, error: 'Already processing' };
    }

    this.isProcessing = true;
    
    try {
      // Update operation status
      if (this.operation) {
        liquidityVersionControl.updateOperationStatus(
          this.operation.id,
          'executing',
          { startTime: new Date().toISOString() }
        );
      }

      this.emit('executionStarted', { operationId: this.operation?.id });

      // Prepare pool configuration
      const poolConfig = {
        tokenA: this.wizardData.tokenAddress,
        amountA: this.wizardData.tokenAmount,
        tokenB: 'SOL',
        amountB: this.wizardData.solAmount,
        decimalsA: this.wizardData.tokenDecimals || 9,
        useMevProtection: this.wizardData.mevProtection !== false,
        bundleEnabled: this.wizardData.bundleEnabled !== false,
        slippage: this.wizardData.slippage || 1
      };

      // Execute pool creation
      const result = await liquidityPoolService.createLiquidityPoolWithBundle(poolConfig);

      if (result.success) {
        // Update operation with success
        if (this.operation) {
          liquidityVersionControl.updateOperationStatus(
            this.operation.id,
            'completed',
            {
              poolId: result.poolId,
              bundleId: result.bundleId,
              signatures: result.signatures,
              method: result.method,
              mevProtected: result.mevProtected
            }
          );
        }

        this.wizardData.result = result;
        this.emit('executionCompleted', { result, operationId: this.operation?.id });
        
        return { success: true, result };
      } else {
        throw new Error(result.error || 'Pool creation failed');
      }

    } catch (error) {
      console.error('Pool creation failed:', error);
      
      // Update operation with failure
      if (this.operation) {
        liquidityVersionControl.updateOperationStatus(
          this.operation.id,
          'failed',
          { error: error.message, failureTime: new Date().toISOString() }
        );
      }

      this.emit('executionFailed', { error: error.message, operationId: this.operation?.id });
      
      return { success: false, error: error.message };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Complete the wizard
   */
  async completeWizard() {
    // Stop balance monitoring
    balanceVerificationService.stopMonitoring();

    // Create final checkpoint
    if (this.operation) {
      liquidityVersionControl.createCheckpoint(
        this.operation.id,
        'Wizard completed'
      );
    }

    this.emit('wizardCompleted', {
      operationId: this.operation?.id,
      result: this.wizardData.result,
      wizardData: this.wizardData
    });

    return true;
  }

  /**
   * Cancel the wizard
   */
  cancelWizard() {
    // Stop balance monitoring
    balanceVerificationService.stopMonitoring();

    // Update operation status
    if (this.operation) {
      liquidityVersionControl.updateOperationStatus(
        this.operation.id,
        'cancelled',
        { cancelledAt: new Date().toISOString(), step: this.currentStep }
      );
    }

    this.emit('wizardCancelled', {
      operationId: this.operation?.id,
      step: this.currentStep
    });

    this.reset();
  }

  /**
   * Reset wizard state
   */
  reset() {
    this.currentStep = 0;
    this.wizardData = {};
    this.operation = null;
    this.validationResults = null;
    this.isProcessing = false;
    
    balanceVerificationService.stopMonitoring();
    balanceVerificationService.clearCache();
    
    this.emit('wizardReset');
  }

  /**
   * Get current wizard state
   */
  getState() {
    return {
      currentStep: this.currentStep,
      totalSteps: this.steps.length,
      stepData: this.steps[this.currentStep],
      wizardData: this.wizardData,
      operation: this.operation,
      validationResults: this.validationResults,
      isProcessing: this.isProcessing,
      progress: ((this.currentStep + 1) / this.steps.length) * 100
    };
  }

  /**
   * Get step information
   * @param {number} stepIndex - Step index (optional)
   */
  getStepInfo(stepIndex = null) {
    const index = stepIndex !== null ? stepIndex : this.currentStep;
    return this.steps[index] || null;
  }

  /**
   * Check if step is accessible
   * @param {number} stepIndex - Step index
   */
  isStepAccessible(stepIndex) {
    // Allow going back to any previous step
    if (stepIndex <= this.currentStep) {
      return true;
    }
    
    // Only allow going forward one step at a time
    return stepIndex === this.currentStep + 1;
  }

  /**
   * Get operation history
   */
  getOperationHistory() {
    if (!this.operation) {
      return null;
    }
    
    return liquidityVersionControl.getOperationHistory(this.operation.id);
  }

  /**
   * Generate operation report
   */
  generateReport() {
    if (!this.operation) {
      return null;
    }
    
    return liquidityVersionControl.generateOperationReport(this.operation.id);
  }

  /**
   * Update UI (to be implemented by UI layer)
   * @param {string} event - Event type
   * @param {Object} data - Event data
   */
  updateUI(event, data) {
    // This method should be overridden by the UI implementation
    // or handled through event listeners
    console.log(`UI Update: ${event}`, data);
  }

  /**
   * Render current step (to be implemented by UI layer)
   */
  renderCurrentStep() {
    // This method should be overridden by the UI implementation
    const stepData = this.steps[this.currentStep];
    console.log(`Rendering step: ${stepData.title}`);
    
    this.emit('stepRender', {
      step: stepData,
      index: this.currentStep,
      state: this.getState()
    });
  }
}

// Create and export singleton instance
export const liquidityWizard = new LiquidityWizard();
export default liquidityWizard;