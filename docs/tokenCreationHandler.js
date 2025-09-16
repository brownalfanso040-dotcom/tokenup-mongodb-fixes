// Enhanced Token Creation Handler with Wallet Signing and Metadata
import { Connection, PublicKey, Transaction, SystemProgram, Keypair } from '@solana/web3.js';
import { createInitializeMintInstruction, createAssociatedTokenAccountInstruction, createMintToInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import { createCreateMetadataAccountV3Instruction, PROGRAM_ID as METADATA_PROGRAM_ID } from '@metaplex-foundation/mpl-token-metadata';
import { walletManager } from './walletManager.js';
import { metadataService } from './metadataService.js';

class TokenCreationHandler {
    constructor() {
        this.connection = null;
        this.network = 'devnet';
        this.isCreating = false;
    }

    // Initialize connection based on network
    initializeConnection(network = 'devnet') {
        this.network = network;
        // RPC endpoints with fallback system - prioritizing official Solana RPC
        this.rpcEndpoints = {
            'devnet': [
                'https://api.devnet.solana.com',
                window.env?.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com',
                'https://devnet.helius-rpc.com/?api-key=a376863b-38c2-437b-b228-5b9c8fb06092'
            ],
            'mainnet-beta': [
                'https://api.mainnet-beta.solana.com',
                window.env?.SOLANA_MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com',
                'https://solana-api.projectserum.com',
                'https://mainnet.helius-rpc.com/?api-key=a376863b-38c2-437b-b228-5b9c8fb06092'
            ],
            'mainnet': [
                'https://api.mainnet-beta.solana.com',
                window.env?.SOLANA_MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com',
                'https://solana-api.projectserum.com',
                'https://mainnet.helius-rpc.com/?api-key=a376863b-38c2-437b-b228-5b9c8fb06092'
            ],
            'testnet': [
                'https://api.testnet.solana.com',
                window.env?.SOLANA_TESTNET_RPC_URL || 'https://api.testnet.solana.com'
            ]
        };
        
        this.currentRpcIndex = 0;
        
        // Use the first endpoint as default
        const endpoints = this.rpcEndpoints[network] || this.rpcEndpoints.devnet;
        const rpcUrl = endpoints[0];
        this.connection = new Connection(rpcUrl, 'confirmed');
        console.log(`TokenCreationHandler: Connection initialized for ${network}:`, rpcUrl);
    }

    // Create connection with automatic fallback for token creation
    async createConnectionWithFallback() {
        const endpoints = this.rpcEndpoints[this.network] || this.rpcEndpoints.devnet;
        if (!endpoints || endpoints.length === 0) {
            throw new Error(`No RPC endpoints configured for network: ${this.network}`);
        }

        for (let i = 0; i < endpoints.length; i++) {
            try {
                const rpcUrl = endpoints[i];
                const testConnection = new Connection(rpcUrl, 'confirmed');
                
                // Test the connection with a simple call
                await testConnection.getSlot();
                
                console.log(`✅ TokenCreationHandler: Successfully connected to ${this.network} via:`, rpcUrl);
                this.currentRpcIndex = i;
                this.connection = testConnection;
                return testConnection;
            } catch (error) {
                console.warn(`⚠️ TokenCreationHandler: Failed to connect to ${this.network} endpoint ${endpoints[i]}:`, error.message);
                if (i === endpoints.length - 1) {
                    throw new Error(`All RPC endpoints failed for ${this.network}`);
                }
            }
        }
    }

    // Collect form data including social media fields
    collectFormData() {
        const formData = {
            name: document.getElementById('token-name')?.value?.trim() || '',
            symbol: document.getElementById('token-symbol')?.value?.trim() || '',
            description: document.getElementById('token-description')?.value?.trim() || '',
            decimals: parseInt(document.getElementById('token-decimals')?.value) || 9,
            supply: parseFloat(document.getElementById('token-supply')?.value) || 1000000,
            image: document.getElementById('token-image')?.files[0] || null,
            // Social media fields
            website: document.getElementById('token-website')?.value?.trim() || '',
            twitter: document.getElementById('token-twitter')?.value?.trim() || '',
            telegram: document.getElementById('token-telegram')?.value?.trim() || '',
            discord: document.getElementById('token-discord')?.value?.trim() || ''
        };

        return formData;
    }

    // Validate form data
    validateFormData(formData) {
        const errors = [];

        if (!formData.name) errors.push('Token name is required');
        if (!formData.symbol) errors.push('Token symbol is required');
        if (formData.symbol.length > 10) errors.push('Token symbol must be 10 characters or less');
        if (formData.decimals < 0 || formData.decimals > 9) errors.push('Decimals must be between 0 and 9');
        if (formData.supply <= 0) errors.push('Initial supply must be greater than 0');

        // Validate URLs if provided
        const urlFields = ['website', 'twitter', 'telegram', 'discord'];
        urlFields.forEach(field => {
            if (formData[field] && !this.isValidUrl(formData[field])) {
                errors.push(`Invalid ${field} URL`);
            }
        });

        return errors;
    }

    // URL validation helper
    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    // Update progress indicator
    updateProgress(step, percentage, message) {
        const progressBar = document.querySelector('.progress-bar');
        const progressText = document.querySelector('.progress-text');
        const stepIndicators = document.querySelectorAll('.step-indicator');

        if (progressBar) progressBar.style.width = `${percentage}%`;
        if (progressText) progressText.textContent = message;

        // Update step indicators
        stepIndicators.forEach((indicator, index) => {
            if (index < step) {
                indicator.classList.add('completed');
                indicator.classList.remove('active');
            } else if (index === step - 1) {
                indicator.classList.add('active');
                indicator.classList.remove('completed');
            } else {
                indicator.classList.remove('active', 'completed');
            }
        });
    }

    // Show progress modal
    showProgressModal() {
        const modal = document.getElementById('progress-modal');
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('show');
        }
    }

    // Hide progress modal
    hideProgressModal() {
        const modal = document.getElementById('progress-modal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('show');
        }
    }

    // Show result modal
    showResultModal(type, title, message, tokenData = null) {
        const modal = document.getElementById('result-modal');
        const titleEl = modal?.querySelector('.modal-title');
        const messageEl = modal?.querySelector('.modal-message');
        const metadataEl = modal?.querySelector('.token-metadata');

        if (modal && titleEl && messageEl) {
            titleEl.textContent = title;
            messageEl.textContent = message;
            modal.className = `modal ${type}`;
            modal.style.display = 'flex';

            // Show token metadata if available
            if (tokenData && metadataEl) {
                metadataEl.innerHTML = `
                    <h4>Token Details</h4>
                    <div class="metadata-grid">
                        <div><strong>Name:</strong> ${tokenData.name}</div>
                        <div><strong>Symbol:</strong> ${tokenData.symbol}</div>
                        <div><strong>Supply:</strong> ${tokenData.supply.toLocaleString()}</div>
                        <div><strong>Decimals:</strong> ${tokenData.decimals}</div>
                        <div><strong>Mint Address:</strong> <code>${tokenData.mintAddress}</code></div>
                        ${tokenData.metadataUri ? `<div><strong>Metadata URI:</strong> <a href="${tokenData.metadataUri}" target="_blank">View</a></div>` : ''}
                    </div>
                `;
                metadataEl.style.display = 'block';
            } else if (metadataEl) {
                metadataEl.style.display = 'none';
            }
        }
    }

    // Main token creation function
    async createToken() {
        if (this.isCreating) return;
        this.isCreating = true;

        try {
            // Step 1: Validation
            this.showProgressModal();
            this.updateProgress(1, 10, 'Validating form data...');

            const formData = this.collectFormData();
            const errors = this.validateFormData(formData);

            if (errors.length > 0) {
                throw new Error(`Validation failed: ${errors.join(', ')}`);
            }

            // Step 2: Wallet Connection
            this.updateProgress(2, 20, 'Connecting to wallet...');
            
            if (!walletManager.isConnected()) {
                await walletManager.connect();
            }

            const wallet = walletManager.getWallet();
            if (!wallet) {
                throw new Error('Wallet not connected');
            }

            // Step 3: Network Setup
            this.updateProgress(3, 30, 'Setting up network connection...');
            this.initializeConnection(document.getElementById('network-select')?.value || 'devnet');

            // Step 4: Metadata Preparation
            this.updateProgress(4, 40, 'Preparing token metadata...');
            
            let metadataUri = '';
            if (formData.image || formData.description) {
                const metadataObject = {
                    name: formData.name,
                    symbol: formData.symbol,
                    description: formData.description,
                    image: formData.image,
                    external_url: formData.website,
                    attributes: [
                        ...(formData.twitter ? [{ trait_type: 'Twitter', value: formData.twitter }] : []),
                        ...(formData.telegram ? [{ trait_type: 'Telegram', value: formData.telegram }] : []),
                        ...(formData.discord ? [{ trait_type: 'Discord', value: formData.discord }] : [])
                    ]
                };
                
                // Add social media links to extensions
                const extensions = {};
                if (formData.website) extensions.website = formData.website;
                if (formData.twitter) extensions.twitter = formData.twitter;
                if (formData.telegram) extensions.telegram = formData.telegram;
                if (formData.discord) extensions.discord = formData.discord;
                
                if (Object.keys(extensions).length > 0) {
                    metadataObject.extensions = extensions;
                }
                
                const metadataResult = await metadataService.ensureMetadataUri(metadataObject);
                metadataUri = metadataResult.uri;
            }

            // Step 5: Create Mint Account
            this.updateProgress(5, 60, 'Creating mint account...');
            
            const mintKeypair = Keypair.generate();
            const mintRent = await this.connection.getMinimumBalanceForRentExemption(165);

            // Step 6: Build Transaction
            this.updateProgress(6, 70, 'Building transaction...');
            
            const transaction = new Transaction();

            // Create mint account
            transaction.add(
                SystemProgram.createAccount({
                    fromPubkey: wallet.publicKey,
                    newAccountPubkey: mintKeypair.publicKey,
                    space: 165,
                    lamports: mintRent,
                    programId: TOKEN_PROGRAM_ID,
                })
            );

            // Initialize mint
            transaction.add(
                createInitializeMintInstruction(
                    mintKeypair.publicKey,
                    formData.decimals,
                    wallet.publicKey, // mint authority
                    wallet.publicKey  // freeze authority
                )
            );

            // Add metadata if available
            if (metadataUri) {
                const [metadataAddress] = PublicKey.findProgramAddressSync(
                    [
                        Buffer.from('metadata'),
                        METADATA_PROGRAM_ID.toBuffer(),
                        mintKeypair.publicKey.toBuffer(),
                    ],
                    METADATA_PROGRAM_ID
                );

                transaction.add(
                    createCreateMetadataAccountV3Instruction(
                        {
                            metadata: metadataAddress,
                            mint: mintKeypair.publicKey,
                            mintAuthority: wallet.publicKey,
                            payer: wallet.publicKey,
                            updateAuthority: wallet.publicKey,
                        },
                        {
                            createMetadataAccountArgsV3: {
                                data: {
                                    name: formData.name,
                                    symbol: formData.symbol,
                                    uri: metadataUri,
                                    sellerFeeBasisPoints: 0,
                                    creators: null,
                                    collection: null,
                                    uses: null,
                                },
                                isMutable: true,
                                collectionDetails: null,
                            },
                        }
                    )
                );
            }

            // Step 7: Sign and Send Transaction
            this.updateProgress(7, 85, 'Signing transaction...');
            
            transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
            transaction.feePayer = wallet.publicKey;
            transaction.partialSign(mintKeypair);

            const signedTransaction = await wallet.signTransaction(transaction);
            
            this.updateProgress(8, 95, 'Sending transaction...');
            const signature = await this.connection.sendRawTransaction(signedTransaction.serialize());
            
            // Confirm transaction
            await this.connection.confirmTransaction(signature, 'confirmed');

            // Step 8: Complete
            this.updateProgress(9, 100, 'Token created successfully!');

            const tokenData = {
                name: formData.name,
                symbol: formData.symbol,
                supply: formData.supply,
                decimals: formData.decimals,
                mintAddress: mintKeypair.publicKey.toString(),
                metadataUri,
                signature
            };

            setTimeout(() => {
                this.hideProgressModal();
                // Success - no popup needed
                console.log('✅ Token created successfully:', tokenData.mintAddress);
            }, 1000);

        } catch (error) {
            console.error('Token creation failed:', error);
            this.hideProgressModal();
            // Error - no popup needed, just log
            console.error('❌ Token creation failed:', error.message);
        } finally {
            this.isCreating = false;
        }
    }
}

// Export singleton instance
export const tokenCreationHandler = new TokenCreationHandler();
export default tokenCreationHandler;
