import React, { useState, useEffect, useCallback } from 'react';
import { NextPage } from 'next';
import Head from 'next/head';
import { useNetwork } from '@/context/NetworkContext';
import { WalletTracker } from '@/components/WalletTracker';

interface WalletSummary {
  address: string;
  name: string;
  isActive: boolean;
  tokenCount: number;
  totalValue: number;
  lastActivity: Date | null;
  tags: string[];
}

interface TrackerStats {
  totalWallets: number;
  activeWallets: number;
  totalTokens: number;
  totalValue: number;
  recentActivities: number;
}

interface Alert {
  id: string;
  walletAddress: string;
  type: string;
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  isRead: boolean;
  createdAt: Date;
}

const WalletTrackerPage: NextPage = () => {
  const { network } = useNetwork();
  const [wallets, setWallets] = useState<WalletSummary[]>([]);
  const [stats, setStats] = useState<TrackerStats | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'value' | 'activity'>('value');
  const [showInactiveWallets, setShowInactiveWallets] = useState(false);
  const [monitoringStatus, setMonitoringStatus] = useState<any>(null);

  // Fetch wallet data
  const fetchWallets = useCallback(async () => {
    try {
      const response = await fetch(`/api/wallet-tracker/wallets?network=${network}`);
      if (response.ok) {
        const data = await response.json();
        setWallets(data.wallets || []);
      }
    } catch (error) {
      console.error('Error fetching wallets:', error);
    }
  }, [network]);

  // Fetch statistics
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`/api/wallet-tracker/stats?network=${network}&includeTokens=true`);
      if (response.ok) {
        const data = await response.json();
        setStats(data.basic);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, [network]);

  // Fetch alerts
  const fetchAlerts = useCallback(async () => {
    try {
      const response = await fetch(`/api/wallet-tracker/alerts?limit=50&network=${network}`);
      if (response.ok) {
        const data = await response.json();
        setAlerts(data.alerts || []);
      }
    } catch (error) {
      console.error('Error fetching alerts:', error);
    }
  }, [network]);

  // Fetch monitoring status
  const fetchMonitoringStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/wallet-tracker/monitor');
      if (response.ok) {
        const data = await response.json();
        setMonitoringStatus(data);
      }
    } catch (error) {
      console.error('Error fetching monitoring status:', error);
    }
  }, []);

  // Initial data load
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchWallets(),
        fetchStats(),
        fetchAlerts(),
        fetchMonitoringStatus()
      ]);
      setIsLoading(false);
    };

    loadData();
  }, [fetchWallets, fetchStats, fetchAlerts, fetchMonitoringStatus]);

  // Auto-refresh data every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchWallets();
      fetchStats();
      fetchAlerts();
      fetchMonitoringStatus();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchWallets, fetchStats, fetchAlerts, fetchMonitoringStatus]);

  // Filter and sort wallets
  const filteredWallets = wallets
    .filter(wallet => {
      if (!showInactiveWallets && !wallet.isActive) return false;
      if (searchTerm && !wallet.name.toLowerCase().includes(searchTerm.toLowerCase()) && 
          !wallet.address.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (filterTag && !wallet.tags.includes(filterTag)) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'value':
          return b.totalValue - a.totalValue;
        case 'activity':
          if (!a.lastActivity && !b.lastActivity) return 0;
          if (!a.lastActivity) return 1;
          if (!b.lastActivity) return -1;
          return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
        default:
          return 0;
      }
    });

  // Get unique tags for filter
  const allTags = Array.from(new Set(wallets.flatMap(w => w.tags)));

  // Toggle monitoring
  const toggleMonitoring = async () => {
    try {
      const action = monitoringStatus?.isMonitoring ? 'stop' : 'start';
      const response = await fetch('/api/wallet-tracker/monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, network })
      });

      if (response.ok) {
        await fetchMonitoringStatus();
      }
    } catch (error) {
      console.error('Error toggling monitoring:', error);
    }
  };

  // Mark alert as read
  const markAlertAsRead = async (alertId: string) => {
    try {
      const response = await fetch('/api/wallet-tracker/alerts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId, isRead: true })
      });

      if (response.ok) {
        setAlerts(prev => prev.map(alert => 
          alert.id === alertId ? { ...alert, isRead: true } : alert
        ));
      }
    } catch (error) {
      console.error('Error marking alert as read:', error);
    }
  };

  const formatValue = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  const formatDate = (date: Date | null) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString();
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-100';
      case 'high': return 'text-orange-600 bg-orange-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-blue-600 bg-blue-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading wallet tracker...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Wallet Tracker - TokenUp</title>
        <meta name="description" content="Comprehensive wallet tracking and monitoring" />
      </Head>

      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Wallet Tracker</h1>
                <p className="mt-2 text-gray-600">
                  Monitor and track all wallets and their token holdings
                </p>
              </div>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${monitoringStatus?.isMonitoring ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="text-sm text-gray-600">
                    {monitoringStatus?.isMonitoring ? 'Monitoring Active' : 'Monitoring Inactive'}
                  </span>
                </div>
                <button
                  onClick={toggleMonitoring}
                  className={`px-4 py-2 rounded-lg font-medium ${
                    monitoringStatus?.isMonitoring
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  {monitoringStatus?.isMonitoring ? 'Stop Monitoring' : 'Start Monitoring'}
                </button>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Wallets</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.totalWallets}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Active Wallets</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.activeWallets}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Tokens</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.totalTokens}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Value</p>
                    <p className="text-2xl font-bold text-gray-900">{formatValue(stats.totalValue)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2">
              {/* Filters and Search */}
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
                    <input
                      type="text"
                      placeholder="Search wallets..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Tag</label>
                    <select
                      value={filterTag}
                      onChange={(e) => setFilterTag(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">All Tags</option>
                      {allTags.map(tag => (
                        <option key={tag} value={tag}>{tag}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="value">Total Value</option>
                      <option value="name">Name</option>
                      <option value="activity">Last Activity</option>
                    </select>
                  </div>

                  <div className="flex items-end">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={showInactiveWallets}
                        onChange={(e) => setShowInactiveWallets(e.target.checked)}
                        className="mr-2"
                      />
                      <span className="text-sm text-gray-700">Show Inactive</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Wallets List */}
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Wallets ({filteredWallets.length})
                  </h2>
                </div>
                <div className="divide-y divide-gray-200">
                  {filteredWallets.map((wallet) => (
                    <div
                      key={wallet.address}
                      className={`p-6 hover:bg-gray-50 cursor-pointer ${
                        selectedWallet === wallet.address ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => setSelectedWallet(
                        selectedWallet === wallet.address ? null : wallet.address
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <h3 className="text-lg font-medium text-gray-900">{wallet.name}</h3>
                            <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                              wallet.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {wallet.isActive ? 'Active' : 'Inactive'}
                            </div>
                          </div>
                          <p className="text-sm text-gray-500 mt-1">{wallet.address}</p>
                          <div className="flex items-center space-x-4 mt-2">
                            <span className="text-sm text-gray-600">
                              {wallet.tokenCount} tokens
                            </span>
                            <span className="text-sm font-medium text-gray-900">
                              {formatValue(wallet.totalValue)}
                            </span>
                            <span className="text-sm text-gray-600">
                              Last activity: {formatDate(wallet.lastActivity)}
                            </span>
                          </div>
                          {wallet.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {wallet.tags.map(tag => (
                                <span
                                  key={tag}
                                  className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="ml-4">
                          <svg
                            className={`w-5 h-5 text-gray-400 transform transition-transform ${
                              selectedWallet === wallet.address ? 'rotate-90' : ''
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>

                      {/* Expanded Wallet Details */}
                      {selectedWallet === wallet.address && (
                        <div className="mt-6 border-t border-gray-200 pt-6">
                          <WalletTracker className="mt-4" />
                        </div>
                      )}
                    </div>
                  ))}

                  {filteredWallets.length === 0 && (
                    <div className="p-6 text-center text-gray-500">
                      No wallets found matching your criteria.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Recent Alerts */}
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Recent Alerts</h2>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {alerts.slice(0, 10).map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-4 border-b border-gray-200 last:border-b-0 ${
                        !alert.isRead ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(alert.severity)}`}>
                              {alert.severity}
                            </span>
                            {!alert.isRead && (
                              <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                            )}
                          </div>
                          <h4 className="text-sm font-medium text-gray-900 mt-1">{alert.title}</h4>
                          <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                          <p className="text-xs text-gray-500 mt-2">
                            {new Date(alert.createdAt).toLocaleString()}
                          </p>
                        </div>
                        {!alert.isRead && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              markAlertAsRead(alert.id);
                            }}
                            className="text-blue-600 hover:text-blue-800 text-sm"
                          >
                            Mark Read
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {alerts.length === 0 && (
                    <div className="p-4 text-center text-gray-500">
                      No recent alerts
                    </div>
                  )}
                </div>
              </div>

              {/* Monitoring Status */}
              {monitoringStatus && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Monitoring Status</h2>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Status:</span>
                      <span className={`text-sm font-medium ${
                        monitoringStatus.isMonitoring ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {monitoringStatus.isMonitoring ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Networks:</span>
                      <span className="text-sm text-gray-900">
                        {monitoringStatus.activeNetworks?.length || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Rules:</span>
                      <span className="text-sm text-gray-900">
                        {monitoringStatus.totalRules || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Monitored Wallets:</span>
                      <span className="text-sm text-gray-900">
                        {monitoringStatus.totalWallets || 0}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default WalletTrackerPage;