import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Search, 
  Plus, 
  Wallet, 
  Activity, 
  TrendingUp, 
  TrendingDown,
  RefreshCw,
  Bell,
  Settings,
  Eye,
  EyeOff,
  Filter,
  Download,
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign
} from 'lucide-react';
import { useNetwork } from '@/context/NetworkContext';
import { formatNumber, formatCurrency } from '@/lib/utils';

// Type definitions (moved from lib files to avoid imports)
interface TrackedWallet {
  address: string;
  name?: string;
  network: string;
  isActive: boolean;
  tags: string[];
  createdAt: Date;
  lastUpdated: Date;
  totalValue?: number;
  activityCount?: number;
}

interface WalletTokenHolding {
  address: string;
  mint: string;
  symbol: string;
  name: string;
  balance: number;
  decimals: number;
  usdValue?: number;
  pricePerToken?: number;
  lastUpdated: Date;
}

interface WalletActivity {
  signature: string;
  address: string;
  type: string;
  timestamp: Date;
  amount?: number;
  token?: string;
  description: string;
  fee?: number;
  status: 'success' | 'failed' | 'pending';
}

interface WalletAlert {
  _id: string;
  address: string;
  type: string;
  message: string;
  timestamp: Date;
  read: boolean;
  network: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface WalletTrackerProps {
  className?: string;
}

interface WalletStats {
  totalWallets: number;
  activeWallets: number;
  totalValue: number;
  totalActivities: number;
  unreadAlerts: number;
}

interface FilterOptions {
  status: 'all' | 'active' | 'inactive';
  hasTokens: 'all' | 'yes' | 'no';
  tags: string[];
  sortBy: 'name' | 'created' | 'value' | 'activity';
  sortOrder: 'asc' | 'desc';
}

export const WalletTracker: React.FC<WalletTrackerProps> = ({ className }) => {
  const { network } = useNetwork();
  const [wallets, setWallets] = useState<TrackedWallet[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<TrackedWallet | null>(null);
  const [walletHoldings, setWalletHoldings] = useState<WalletTokenHolding[]>([]);
  const [walletActivities, setWalletActivities] = useState<WalletActivity[]>([]);
  const [walletAlerts, setWalletAlerts] = useState<WalletAlert[]>([]);
  const [stats, setStats] = useState<WalletStats>({
    totalWallets: 0,
    activeWallets: 0,
    totalValue: 0,
    totalActivities: 0,
    unreadAlerts: 0
  });
  
  const [searchQuery, setSearchQuery] = useState('');
  const [newWalletAddress, setNewWalletAddress] = useState('');
  const [newWalletName, setNewWalletName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [walletDetailTab, setWalletDetailTab] = useState('holdings');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({
    status: 'all',
    hasTokens: 'all',
    tags: [],
    sortBy: 'created',
    sortOrder: 'desc'
  });

  // Real-time update interval
  const [updateInterval, setUpdateInterval] = useState<NodeJS.Timeout | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Load initial data
  useEffect(() => {
    loadWallets();
    loadStats();
    loadAlerts();
  }, [network]);

  // Setup real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isRefreshing) {
        refreshData();
      }
    }, 30000); // Update every 30 seconds

    setUpdateInterval(interval);

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isRefreshing]);

  const loadWallets = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/wallet-tracker?action=wallets');
      if (!response.ok) {
        throw new Error('Failed to fetch wallets');
      }
      
      const allWallets = await response.json();
      const networkWallets = allWallets.filter((w: TrackedWallet) => w.network === network);
      
      setWallets(networkWallets);
    } catch (err) {
      console.error('Error loading wallets:', err);
      setError('Failed to load wallets');
    } finally {
      setIsLoading(false);
    }
  }, [network]);

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch('/api/wallet-tracker?action=stats');
      if (!response.ok) {
        throw new Error('Failed to fetch stats');
      }
      
      const stats = await response.json();
      setStats(stats);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  }, [network]);

  const loadAlerts = useCallback(async () => {
    try {
      const response = await fetch('/api/wallet-tracker?action=alerts');
      if (!response.ok) {
        throw new Error('Failed to fetch alerts');
      }
      
      const alerts = await response.json();
      setWalletAlerts(alerts.filter((a: WalletAlert) => a.network === network));
    } catch (err) {
      console.error('Error loading alerts:', err);
    }
  }, [network]);

  const loadWalletDetails = useCallback(async (wallet: TrackedWallet) => {
    try {
      setIsLoading(true);
      
      const [holdingsResponse, activitiesResponse] = await Promise.all([
        fetch(`/api/wallet-tracker?action=wallet-holdings&address=${wallet.address}`),
        fetch(`/api/wallet-tracker?action=wallet-activities&address=${wallet.address}&limit=100`)
      ]);

      if (!holdingsResponse.ok || !activitiesResponse.ok) {
        throw new Error('Failed to fetch wallet details');
      }

      const [holdings, activities] = await Promise.all([
        holdingsResponse.json(),
        activitiesResponse.json()
      ]);

      setWalletHoldings(holdings);
      setWalletActivities(activities);
      setSelectedWallet(wallet);
    } catch (err) {
      console.error('Error loading wallet details:', err);
      setError('Failed to load wallet details');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshData = useCallback(async () => {
    try {
      setIsRefreshing(true);
      
      // Refresh all active wallets via API
      const activeWallets = wallets.filter(w => w.isActive);
      await Promise.all(
        activeWallets.map(wallet => 
          fetch('/api/wallet-tracker', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'refreshWallet',
              data: { address: wallet.address }
            })
          })
        )
      );

      // Reload data
      await Promise.all([
        loadWallets(),
        loadStats(),
        loadAlerts()
      ]);

      // Refresh selected wallet details if any
      if (selectedWallet) {
        await loadWalletDetails(selectedWallet);
      }

      setLastUpdate(new Date());
    } catch (err) {
      console.error('Error refreshing data:', err);
      setError('Failed to refresh data');
    } finally {
      setIsRefreshing(false);
    }
  }, [wallets, selectedWallet, loadWallets, loadStats, loadAlerts, loadWalletDetails]);

  const addWallet = useCallback(async () => {
    if (!newWalletAddress.trim()) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/wallet-tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addWallet',
          data: {
            address: newWalletAddress.trim(),
            name: newWalletName.trim() || undefined,
            network
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to add wallet');
      }

      setNewWalletAddress('');
      setNewWalletName('');
      await loadWallets();
    } catch (err) {
      console.error('Error adding wallet:', err);
      setError('Failed to add wallet');
    } finally {
      setIsLoading(false);
    }
  }, [newWalletAddress, newWalletName, network, loadWallets]);

  const toggleWalletStatus = useCallback(async (wallet: TrackedWallet) => {
    try {
      const response = await fetch('/api/wallet-tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateWallet',
          data: {
            address: wallet.address,
            updates: { isActive: !wallet.isActive }
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update wallet status');
      }

      await loadWallets();
    } catch (err) {
      console.error('Error toggling wallet status:', err);
      setError('Failed to update wallet status');
    }
  }, [loadWallets]);

  const removeWallet = useCallback(async (address: string) => {
    try {
      const response = await fetch('/api/wallet-tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'removeWallet',
          data: { address }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to remove wallet');
      }
      
      if (selectedWallet?.address === address) {
        setSelectedWallet(null);
        setWalletHoldings([]);
        setWalletActivities([]);
      }

      await loadWallets();
    } catch (err) {
      console.error('Error removing wallet:', err);
      setError('Failed to remove wallet');
    }
  }, [selectedWallet, loadWallets]);

  const markAlertAsRead = useCallback(async (alertId: string) => {
    try {
      const response = await fetch('/api/wallet-tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'markAlertRead',
          data: { alertId }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to mark alert as read');
      }

      await loadAlerts();
      await loadStats();
    } catch (err) {
      console.error('Error marking alert as read:', err);
    }
  }, [loadAlerts, loadStats]);

  // Filter and sort wallets
  const filteredWallets = useMemo(() => {
    let filtered = wallets.filter(wallet => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          wallet.address.toLowerCase().includes(query) ||
          wallet.name?.toLowerCase().includes(query) ||
          wallet.description?.toLowerCase().includes(query) ||
          wallet.tags.some(tag => tag.toLowerCase().includes(query));
        
        if (!matchesSearch) return false;
      }

      // Status filter
      if (filters.status !== 'all') {
        const isActive = filters.status === 'active';
        if (wallet.isActive !== isActive) return false;
      }

      // Tags filter
      if (filters.tags.length > 0) {
        const hasMatchingTag = filters.tags.some(tag => 
          wallet.tags.includes(tag)
        );
        if (!hasMatchingTag) return false;
      }

      return true;
    });

    // Sort wallets
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (filters.sortBy) {
        case 'name':
          comparison = (a.name || a.address).localeCompare(b.name || b.address);
          break;
        case 'created':
          comparison = a.createdAt.getTime() - b.createdAt.getTime();
          break;
        case 'activity':
          comparison = a.lastActivity.getTime() - b.lastActivity.getTime();
          break;
        default:
          comparison = 0;
      }

      return filters.sortOrder === 'desc' ? -comparison : comparison;
    });

    return filtered;
  }, [wallets, searchQuery, filters]);

  // Get available tags
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    wallets.forEach(wallet => {
      wallet.tags.forEach(tag => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [wallets]);

  const exportData = useCallback(async () => {
    try {
      const db = await getWalletTrackerDb();
      const data = await db.exportWalletData();
      
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json'
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wallet-tracker-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting data:', err);
      setError('Failed to export data');
    }
  }, []);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Wallet Tracker</h1>
          <p className="text-muted-foreground">
            Monitor all wallets and their token holdings on {network}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </Badge>
          
          <Button
            variant="outline"
            size="sm"
            onClick={refreshData}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={exportData}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Wallets</p>
                <p className="text-2xl font-bold">{stats.totalWallets}</p>
              </div>
              <Wallet className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold text-green-600">{stats.activeWallets}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Value</p>
                <p className="text-2xl font-bold">{formatCurrency(stats.totalValue)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Activities</p>
                <p className="text-2xl font-bold">{formatNumber(stats.totalActivities)}</p>
              </div>
              <Activity className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Alerts</p>
                <p className="text-2xl font-bold text-orange-600">{stats.unreadAlerts}</p>
              </div>
              <Bell className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium">Status</label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value as any }))}
                  className="w-full mt-1 p-2 border rounded-md"
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Sort By</label>
                <select
                  value={filters.sortBy}
                  onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value as any }))}
                  className="w-full mt-1 p-2 border rounded-md"
                >
                  <option value="created">Created Date</option>
                  <option value="name">Name</option>
                  <option value="activity">Last Activity</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Order</label>
                <select
                  value={filters.sortOrder}
                  onChange={(e) => setFilters(prev => ({ ...prev, sortOrder: e.target.value as any }))}
                  className="w-full mt-1 p-2 border rounded-md"
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Tags</label>
                <select
                  multiple
                  value={filters.tags}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, option => option.value);
                    setFilters(prev => ({ ...prev, tags: selected }));
                  }}
                  className="w-full mt-1 p-2 border rounded-md"
                >
                  {availableTags.map(tag => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="wallets">Wallets</TabsTrigger>
          <TabsTrigger value="activities">Activities</TabsTrigger>
          <TabsTrigger value="alerts">Alerts ({stats.unreadAlerts})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Add New Wallet */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Add New Wallet
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="Wallet address"
                  value={newWalletAddress}
                  onChange={(e) => setNewWalletAddress(e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="Name (optional)"
                  value={newWalletName}
                  onChange={(e) => setNewWalletName(e.target.value)}
                  className="w-48"
                />
                <Button 
                  onClick={addWallet}
                  disabled={!newWalletAddress.trim() || isLoading}
                >
                  Add Wallet
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent Activities */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {walletActivities.slice(0, 5).map((activity) => (
                  <div key={activity.signature} className="flex items-center justify-between p-2 border rounded">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      <span className="font-medium">{activity.type}</span>
                      <span className="text-sm text-muted-foreground">
                        {activity.walletAddress.slice(0, 8)}...
                      </span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {activity.timestamp.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wallets" className="space-y-4">
          {/* Search */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search wallets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Wallets Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredWallets.map((wallet) => (
              <Card key={wallet.address} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold truncate">
                        {wallet.name || `${wallet.address.slice(0, 8)}...`}
                      </h3>
                      <p className="text-xs text-muted-foreground font-mono">
                        {wallet.address}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleWalletStatus(wallet)}
                      >
                        {wallet.isActive ? (
                          <Eye className="h-4 w-4 text-green-500" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-gray-400" />
                        )}
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => loadWalletDetails(wallet)}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Status:</span>
                      <Badge variant={wallet.isActive ? "default" : "secondary"}>
                        {wallet.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <span>Tokens:</span>
                      <span>{wallet.tokenCount || 0}</span>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <span>Last Activity:</span>
                      <span>{wallet.lastActivity.toLocaleDateString()}</span>
                    </div>
                  </div>

                  {wallet.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {wallet.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredWallets.length === 0 && !isLoading && (
            <Card>
              <CardContent className="p-8 text-center">
                <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No wallets found</h3>
                <p className="text-muted-foreground">
                  {searchQuery ? 'Try adjusting your search or filters' : 'Add your first wallet to get started'}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="activities" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Activities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {walletActivities.map((activity) => (
                  <div key={activity.signature} className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center gap-3">
                      <Activity className="h-5 w-5" />
                      <div>
                        <div className="font-medium">{activity.type}</div>
                        <div className="text-sm text-muted-foreground">
                          {activity.walletAddress.slice(0, 8)}...{activity.walletAddress.slice(-8)}
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-sm font-medium">
                        {activity.amount && formatNumber(activity.amount)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {activity.timestamp.toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Wallet Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {walletAlerts.map((alert) => (
                  <div 
                    key={alert.id} 
                    className={`p-3 border rounded cursor-pointer transition-colors ${
                      alert.isRead ? 'bg-gray-50' : 'bg-blue-50 border-blue-200'
                    }`}
                    onClick={() => markAlertAsRead(alert.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <Bell className={`h-5 w-5 mt-0.5 ${
                          alert.severity === 'critical' ? 'text-red-500' :
                          alert.severity === 'high' ? 'text-orange-500' :
                          alert.severity === 'medium' ? 'text-yellow-500' :
                          'text-blue-500'
                        }`} />
                        
                        <div>
                          <div className="font-medium">{alert.title}</div>
                          <div className="text-sm text-muted-foreground">{alert.message}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {alert.walletAddress.slice(0, 8)}...{alert.walletAddress.slice(-8)}
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <Badge 
                          variant={
                            alert.severity === 'critical' ? 'destructive' :
                            alert.severity === 'high' ? 'destructive' :
                            alert.severity === 'medium' ? 'default' :
                            'secondary'
                          }
                          className="text-xs"
                        >
                          {alert.severity}
                        </Badge>
                        <div className="text-xs text-muted-foreground mt-1">
                          {alert.createdAt.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {walletAlerts.length === 0 && (
                <div className="text-center py-8">
                  <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No alerts</h3>
                  <p className="text-muted-foreground">
                    All caught up! No new alerts for your wallets.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Selected Wallet Details Modal/Panel */}
      {selectedWallet && (
        <Card className="fixed inset-4 z-50 overflow-auto">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {selectedWallet.name || selectedWallet.address.slice(0, 16) + '...'}
              </CardTitle>
              <Button
                variant="ghost"
                onClick={() => setSelectedWallet(null)}
              >
                ×
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={walletDetailTab} onValueChange={setWalletDetailTab}>
              <TabsList>
                <TabsTrigger value="holdings">Holdings</TabsTrigger>
                <TabsTrigger value="activities">Activities</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>

              <TabsContent value="holdings" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {walletHoldings.map((holding) => (
                    <Card key={holding.mint}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{holding.metadata?.symbol || 'Unknown'}</span>
                          <Badge variant="outline">{holding.decimals}</Badge>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span>Amount:</span>
                            <span>{formatNumber(holding.amount)}</span>
                          </div>
                          {holding.usdValue && (
                            <div className="flex justify-between text-sm">
                              <span>Value:</span>
                              <span>{formatCurrency(holding.usdValue)}</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="activities">
                <div className="space-y-2">
                  {walletActivities.map((activity) => (
                    <div key={activity.signature} className="p-3 border rounded">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{activity.type}</div>
                          <div className="text-sm text-muted-foreground">
                            {activity.signature.slice(0, 16)}...
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm">
                            {activity.amount && formatNumber(activity.amount)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {activity.timestamp.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="settings">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span>Monitoring Status</span>
                    <Button
                      variant={selectedWallet.isActive ? "destructive" : "default"}
                      onClick={() => toggleWalletStatus(selectedWallet)}
                    >
                      {selectedWallet.isActive ? "Stop Monitoring" : "Start Monitoring"}
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span>Remove Wallet</span>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        removeWallet(selectedWallet.address);
                        setSelectedWallet(null);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
};