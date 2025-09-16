'use client';

import React, { useState, useEffect } from 'react';
import { TokenStorage, LaunchedToken } from '@/lib/localStorage';
import { useNetwork } from '@/context/NetworkContext';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletTokenBalance } from '@/lib/types';
import { getWeb3Service } from '@/lib/web3Service';
import NetworkIndicator from '../ui/NetworkIndicator';

const MyTokens: React.FC = () => {
  const { network } = useNetwork();
  const { publicKey, connected } = useWallet();
  const [tokens, setTokens] = useState<LaunchedToken[]>([]);
  const [walletTokens, setWalletTokens] = useState<WalletTokenBalance[]>([]);
  const [filteredTokens, setFilteredTokens] = useState<LaunchedToken[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'supply'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingWallet, setIsLoadingWallet] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [activeTab, setActiveTab] = useState<'created' | 'wallet'>('created');

  useEffect(() => {
    loadTokens();
  }, [network]);

  useEffect(() => {
    if (connected && publicKey && activeTab === 'wallet') {
      loadWalletTokens();
    }
  }, [connected, publicKey, activeTab, network]);

  useEffect(() => {
    if (activeTab === 'created') {
      filterAndSortTokens();
    }
  }, [tokens, searchTerm, sortBy, sortOrder, activeTab]);

  const loadTokens = () => {
    setIsLoading(true);
    try {
      const allTokens = TokenStorage.getAllTokens();
      const networkTokens = allTokens.filter(token => token.network === network);
      setTokens(networkTokens);
      setFilteredTokens(networkTokens);
    } catch (error) {
      console.error('Error loading tokens:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadWalletTokens = async () => {
    if (!publicKey) return;
    
    setIsLoadingWallet(true);
    try {
      const web3Service = getWeb3Service(network);
      const tokens = await web3Service.getWalletTokens(publicKey.toString());
      setWalletTokens(tokens);
    } catch (error) {
      console.error('Error loading wallet tokens:', error);
    } finally {
      setIsLoadingWallet(false);
    }
  };



  const filterAndSortTokens = () => {
    let filtered = [...tokens];

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(token =>
        token.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        token.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        token.mintAddress.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Sort tokens
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'supply':
          comparison = a.supply - b.supply;
          break;
        default:
          comparison = 0;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    setFilteredTokens(filtered);
  };

  const deleteToken = (tokenId: string) => {
    if (confirm('Are you sure you want to delete this token from your saved list?')) {
      TokenStorage.deleteToken(tokenId);
      loadTokens();
    }
  };

  const exportTokens = () => {
    TokenStorage.exportToFile();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportStatus('Importing...');
    try {
      const result = await TokenStorage.importFromFile(file);
      if (result.success) {
        setImportStatus(`Successfully imported ${result.imported} tokens${result.skipped > 0 ? `, skipped ${result.skipped} duplicates` : ''}`);
        loadTokens(); // Refresh the token list
        setTimeout(() => {
          setImportStatus('');
          setShowImportModal(false);
        }, 3000);
      } else {
        setImportStatus(`Import failed: ${result.error}`);
      }
    } catch (error) {
      setImportStatus('Import failed: Unexpected error');
    }
    
    // Reset file input
    event.target.value = '';
  };

  const restoreFromBackup = () => {
    const result = TokenStorage.restoreFromBackup();
    if (result.success) {
      setImportStatus(`Successfully restored ${result.restored} tokens from backup`);
      loadTokens();
      setTimeout(() => setImportStatus(''), 3000);
    } else {
      setImportStatus(`Restore failed: ${result.error}`);
    }
  };





  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatSupply = (supply: number) => {
    return supply.toLocaleString();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // You could add a toast notification here
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">My Tokens</h1>
            <p className="text-gray-300">Manage your launched tokens and wallet holdings</p>
            
            {/* Tab Navigation */}
            <div className="flex mt-4 bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('created')}
                className={`px-4 py-2 rounded-md transition-colors ${
                  activeTab === 'created'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                Created Tokens ({tokens.length})
              </button>
              <button
                onClick={() => setActiveTab('wallet')}
                className={`px-4 py-2 rounded-md transition-colors ${
                  activeTab === 'wallet'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                Wallet Tokens {connected ? `(${walletTokens.length})` : '(Connect Wallet)'}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <NetworkIndicator />
            <button
            onClick={() => setShowImportModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Import Data
          </button>
            <button
              onClick={exportTokens}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              Export Data
            </button>
            <button
              onClick={restoreFromBackup}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
            >
              Restore Backup
            </button>
          </div>
        </div>

        {/* Filters - Only show for created tokens */}
        {activeTab === 'created' && (
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Search
                </label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name, symbol, or address..."
                  className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Sort By
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'name' | 'date' | 'supply')}
                  className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="date">Date Created</option>
                  <option value="name">Name</option>
                  <option value="supply">Supply</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Order
                </label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                  className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </div>
              <div className="flex items-end">
                <div className="text-sm text-gray-300">
                  <span className="font-medium">{filteredTokens.length}</span> of{' '}
                  <span className="font-medium">{tokens.length}</span> tokens
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Wallet Tokens Refresh Button */}
        {activeTab === 'wallet' && connected && (
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Wallet Tokens</h3>
                <p className="text-gray-300 text-sm">
                  Showing tokens from your connected wallet on {network}
                </p>
              </div>
              <button
                onClick={loadWalletTokens}
                disabled={isLoadingWallet}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                {isLoadingWallet ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Refreshing...
                  </>
                ) : (
                  <>
                    🔄 Refresh
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Tokens Grid */}
        {activeTab === 'created' ? (
          // Created Tokens View
          filteredTokens.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🪙</div>
            <h3 className="text-xl font-semibold text-white mb-2">
              {tokens.length === 0 ? 'No tokens created yet' : 'No tokens match your filters'}
            </h3>
            <p className="text-gray-400">
              {tokens.length === 0 
                ? 'Create your first token to see it here!'
                : 'Try adjusting your search or filter criteria.'
              }
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTokens.map((token) => (
              <div
                key={token.id}
                className="bg-white/10 backdrop-blur-sm rounded-xl p-6 hover:bg-white/15 hover:shadow-lg transition-all duration-300 cursor-pointer"
                title="Click to view on explorer"
                onClick={(e) => {
                  // Prevent navigation if clicking on buttons or links
                  if ((e.target as HTMLElement).closest('button, a')) {
                    return;
                  }
                  window.open(token.explorerUrl, '_blank');
                }}
              >
                {/* Token Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1">{token.name}</h3>
                    <p className="text-blue-300 font-medium">{token.symbol}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      token.network === 'mainnet' 
                        ? 'bg-green-500/20 text-green-300' 
                        : 'bg-orange-500/20 text-orange-300'
                    }`}>
                      {token.network.toUpperCase()}
                    </span>
                    <button
                      onClick={() => deleteToken(token.id)}
                      className="text-red-400 hover:text-red-300 transition-colors"
                      title="Delete token"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Token Details */}
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wide">Supply</label>
                    <p className="text-white font-medium">{formatSupply(token.supply)} tokens</p>
                  </div>
                  
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wide">Mint Address</label>
                    <div className="flex items-center gap-2">
                      <p className="text-white font-mono text-sm truncate">
                        {token.mintAddress.slice(0, 8)}...{token.mintAddress.slice(-8)}
                      </p>
                      <button
                        onClick={() => copyToClipboard(token.mintAddress)}
                        className="text-blue-400 hover:text-blue-300 transition-colors"
                        title="Copy address"
                      >
                        📋
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wide">Created</label>
                    <p className="text-white text-sm">{formatDate(token.timestamp)}</p>
                  </div>

                  {token.description && (
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wide">Description</label>
                      <p className="text-gray-300 text-sm line-clamp-2">{token.description}</p>
                    </div>
                  )}
                </div>

                {/* Social Links */}
                {(token.website || token.twitter || token.telegram || token.discord) && (
                  <div className="flex gap-2 mb-4">
                    {token.website && (
                      <a
                        href={token.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 transition-colors"
                        title="Website"
                      >
                        🌐
                      </a>
                    )}
                    {token.twitter && (
                      <a
                        href={token.twitter}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 transition-colors"
                        title="Twitter"
                      >
                        🐦
                      </a>
                    )}
                    {token.telegram && (
                      <a
                        href={token.telegram}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 transition-colors"
                        title="Telegram"
                      >
                        ✈️
                      </a>
                    )}
                    {token.discord && (
                      <a
                        href={token.discord}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 transition-colors"
                        title="Discord"
                      >
                        💬
                      </a>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <a
                    href={token.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors text-center"
                  >
                    View on Explorer
                  </a>
                  <button
                    onClick={() => copyToClipboard(token.transactionSignature)}
                    className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors"
                    title="Copy transaction signature"
                  >
                    📋
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
        ) : (
          // Wallet Tokens View
          !connected ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">👛</div>
              <h3 className="text-xl font-semibold text-white mb-2">Connect Your Wallet</h3>
              <p className="text-gray-400">
                Connect your wallet to view your token holdings
              </p>
            </div>
          ) : isLoadingWallet ? (
            <div className="text-center py-12">
              <div className="animate-spin text-6xl mb-4">⏳</div>
              <h3 className="text-xl font-semibold text-white mb-2">Loading Wallet Tokens</h3>
              <p className="text-gray-400">Fetching your token balances...</p>
            </div>
          ) : walletTokens.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🪙</div>
              <h3 className="text-xl font-semibold text-white mb-2">No Tokens Found</h3>
              <p className="text-gray-400">
                No tokens found in your connected wallet on {network}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {walletTokens.map((token, index) => (
                <div
                  key={`${token.mint}-${index}`}
                  className="bg-white/10 backdrop-blur-sm rounded-xl p-6 hover:bg-white/15 hover:shadow-lg transition-all duration-300"
                >
                  {/* Token Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {token.metadata?.image && (
                        <img
                          src={token.metadata.image}
                          alt={token.metadata?.name || 'Token'}
                          className="w-12 h-12 rounded-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      )}
                      <div>
                        <h3 className="text-xl font-bold text-white mb-1">
                          {token.metadata?.name || 'Unknown Token'}
                        </h3>
                        <p className="text-blue-300 font-medium">
                          {token.metadata?.symbol || 'N/A'}
                        </p>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      network === 'mainnet' 
                        ? 'bg-green-500/20 text-green-300' 
                        : 'bg-orange-500/20 text-orange-300'
                    }`}>
                      {network.toUpperCase()}
                    </span>
                  </div>

                  {/* Token Details */}
                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wide">Balance</label>
                      <p className="text-white font-medium text-lg">
                        {(token.amount / Math.pow(10, token.decimals)).toLocaleString()} {token.metadata?.symbol || 'tokens'}
                      </p>
                    </div>
                    
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wide">Mint Address</label>
                      <div className="flex items-center gap-2">
                        <p className="text-white font-mono text-sm truncate">
                          {token.mint.slice(0, 8)}...{token.mint.slice(-8)}
                        </p>
                        <button
                          onClick={() => copyToClipboard(token.mint)}
                          className="text-blue-400 hover:text-blue-300 transition-colors"
                          title="Copy mint address"
                        >
                          📋
                        </button>
                      </div>
                    </div>


                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <a
                      href={`https://explorer.solana.com/address/${token.mint}${network === 'devnet' ? '?cluster=devnet' : ''}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors text-center"
                    >
                      View on Explorer
                    </a>
                    <button
                      onClick={() => copyToClipboard(token.mint)}
                      className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors"
                      title="Copy mint address"
                    >
                      📋
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Import Modal */}
        {showImportModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full">
              <h3 className="text-xl font-bold text-white mb-4">Import Token Data</h3>
              
              {importStatus && (
                <div className={`mb-4 p-3 rounded-lg ${
                  importStatus.includes('failed') || importStatus.includes('error')
                    ? 'bg-red-500/20 text-red-300'
                    : importStatus.includes('Successfully')
                    ? 'bg-green-500/20 text-green-300'
                    : 'bg-blue-500/20 text-blue-300'
                }`}>
                  {importStatus}
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Select JSON file to import
                </label>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportFile}
                  className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowImportModal(false);
                    setImportStatus('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyTokens;