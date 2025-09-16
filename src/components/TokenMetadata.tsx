'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  ExternalLink, 
  Copy, 
  CheckCircle, 
  AlertCircle, 
  Coins, 
  Users, 
  Activity,
  Globe,
  Twitter,
  MessageCircle
} from 'lucide-react';
import { LaunchedToken, TokenAnalytics } from '@/lib/types';
import { getWeb3Service } from '@/lib/web3Service';
import { useNetwork } from '@/context/NetworkContext';
import { toast } from '@/lib/toast';

interface TokenMetadataProps {
  mintAddress: string;
  showAnalytics?: boolean;
  className?: string;
}

export function TokenMetadata({ mintAddress, showAnalytics = false, className = '' }: TokenMetadataProps) {
  const [token, setToken] = useState<LaunchedToken | null>(null);
  const [analytics, setAnalytics] = useState<TokenAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { network } = useNetwork();

  useEffect(() => {
    fetchTokenData();
  }, [mintAddress, network]);

  const fetchTokenData = async () => {
    try {
      setLoading(true);
      setError(null);

      const web3Service = getWeb3Service(network);
      
      // Fetch token info
      const tokenInfo = await web3Service.getTokenInfo(mintAddress);
      setToken(tokenInfo);

      // Fetch analytics if requested
      if (showAnalytics && tokenInfo) {
        const analyticsData = await web3Service.getTokenAnalytics(mintAddress);
        setAnalytics(analyticsData);
      }

    } catch (err) {
      console.error('Error fetching token data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch token data');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    } catch (err) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const formatNumber = (num: number | undefined): string => {
    if (num === undefined) return 'N/A';
    return new Intl.NumberFormat().format(num);
  };

  const formatAddress = (address: string): string => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-4">
            <Skeleton className="h-16 w-16 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <Skeleton className="h-20 w-full" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {error}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchTokenData}
            className="ml-2"
          >
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!token) {
    return (
      <Alert className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Token not found or invalid mint address
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" />
            Token Information
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={token.verified ? "default" : "secondary"}>
              {token.verified ? (
                <>
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Verified
                </>
              ) : (
                'Unverified'
              )}
            </Badge>
            <Badge variant="outline">{network}</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Basic Token Info */}
        <div className="flex items-start space-x-4">
          {token.image && (
            <img 
              src={token.image} 
              alt={token.name}
              className="h-16 w-16 rounded-lg object-cover border"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-semibold truncate">{token.name}</h3>
            <p className="text-sm text-muted-foreground">{token.symbol}</p>
            <div className="flex items-center gap-2 mt-2">
              <code className="text-xs bg-muted px-2 py-1 rounded">
                {formatAddress(token.mintAddress)}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(token.mintAddress, 'Mint address')}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>

        {/* Description */}
        {token.description && (
          <div>
            <h4 className="font-medium mb-2">Description</h4>
            <p className="text-sm text-muted-foreground">{token.description}</p>
          </div>
        )}

        {/* Token Details */}
        <div className="grid grid-cols-2 gap-4">
          {token.supply && (
            <div className="space-y-1">
              <p className="text-sm font-medium">Total Supply</p>
              <p className="text-sm text-muted-foreground">{formatNumber(token.supply)}</p>
            </div>
          )}
          {token.decimals && (
            <div className="space-y-1">
              <p className="text-sm font-medium">Decimals</p>
              <p className="text-sm text-muted-foreground">{token.decimals}</p>
            </div>
          )}
          <div className="space-y-1">
            <p className="text-sm font-medium">Created</p>
            <p className="text-sm text-muted-foreground">
              {new Date(token.timestamp).toLocaleDateString()}
            </p>
          </div>
          {token.creator && (
            <div className="space-y-1">
              <p className="text-sm font-medium">Creator</p>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-muted px-2 py-1 rounded">
                  {formatAddress(token.creator)}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(token.creator!, 'Creator address')}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Social Links */}
        {(token.website || token.twitter || token.telegram || token.discord) && (
          <div>
            <h4 className="font-medium mb-3">Links</h4>
            <div className="flex flex-wrap gap-2">
              {token.website && (
                <Button variant="outline" size="sm" asChild>
                  <a href={token.website} target="_blank" rel="noopener noreferrer">
                    <Globe className="h-3 w-3 mr-1" />
                    Website
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
              )}
              {token.twitter && (
                <Button variant="outline" size="sm" asChild>
                  <a href={token.twitter} target="_blank" rel="noopener noreferrer">
                    <Twitter className="h-3 w-3 mr-1" />
                    Twitter
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
              )}
              {token.telegram && (
                <Button variant="outline" size="sm" asChild>
                  <a href={token.telegram} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-3 w-3 mr-1" />
                    Telegram
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
              )}
              {token.discord && (
                <Button variant="outline" size="sm" asChild>
                  <a href={token.discord} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-3 w-3 mr-1" />
                    Discord
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Analytics */}
        {showAnalytics && analytics && (
          <div>
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Analytics (24h)
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">Holders</p>
                <p className="text-lg font-bold">{formatNumber(analytics.holders)}</p>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">Transactions</p>
                <p className="text-lg font-bold">{formatNumber(analytics.transactions24h)}</p>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">Volume</p>
                <p className="text-lg font-bold">${formatNumber(analytics.volume24h)}</p>
              </div>
              {analytics.marketCap && (
                <div className="text-center p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium">Market Cap</p>
                  <p className="text-lg font-bold">${formatNumber(analytics.marketCap)}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Helius Data Timestamp */}
        {token.heliusData?.lastUpdated && (
          <div className="text-xs text-muted-foreground border-t pt-3">
            Data last updated: {new Date(token.heliusData.lastUpdated).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default TokenMetadata;