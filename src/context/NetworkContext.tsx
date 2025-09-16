'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';

export type NetworkType = 'mainnet' | 'testnet';

interface NetworkContextType {
  network: NetworkType;
  setNetwork: (network: NetworkType) => void;
  rpcUrl: string;
  wsUrl: string;
  walletAdapterNetwork: WalletAdapterNetwork;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

const getNetworkConfig = (network: NetworkType) => {
  switch (network) {
    case 'mainnet':
      return {
        rpcUrl: process.env.NEXT_PUBLIC_SOLANA_MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com',
        wsUrl: process.env.NEXT_PUBLIC_SOLANA_MAINNET_WS_URL || 'wss://api.mainnet-beta.solana.com',
        walletAdapterNetwork: WalletAdapterNetwork.Mainnet
      };
    case 'testnet':
      return {
        rpcUrl: process.env.NEXT_PUBLIC_SOLANA_TESTNET_RPC_URL || 'https://api.testnet.solana.com',
        wsUrl: process.env.NEXT_PUBLIC_SOLANA_TESTNET_WS_URL || 'wss://api.testnet.solana.com',
        walletAdapterNetwork: WalletAdapterNetwork.Testnet
      };
    default:
      return {
        rpcUrl: 'https://api.mainnet-beta.solana.com',
        wsUrl: 'wss://api.mainnet-beta.solana.com',
        walletAdapterNetwork: WalletAdapterNetwork.Mainnet
      };
  }
};

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [network, setNetworkState] = useState<NetworkType>('mainnet');
  const config = getNetworkConfig(network);

  // Load network preference from localStorage on mount
  useEffect(() => {
    const savedNetwork = localStorage.getItem('solana-network') as NetworkType;
    if (savedNetwork && (savedNetwork === 'mainnet' || savedNetwork === 'testnet')) {
      setNetworkState(savedNetwork);
    }
  }, []);

  const setNetwork = (newNetwork: NetworkType) => {
    setNetworkState(newNetwork);
    localStorage.setItem('solana-network', newNetwork);
  };

  const value: NetworkContextType = {
    network,
    setNetwork,
    rpcUrl: config.rpcUrl,
    wsUrl: config.wsUrl,
    walletAdapterNetwork: config.walletAdapterNetwork
  };

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (context === undefined) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
}

export { NetworkContext };