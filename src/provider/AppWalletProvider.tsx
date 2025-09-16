'use client';

import React, { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { useNetwork } from '../context/NetworkContext';

// Default styles that can be overridden by your app
import '@solana/wallet-adapter-react-ui/styles.css';

export default function AppWalletProvider({ children }: { children: React.ReactNode }) {
  const { rpcUrl } = useNetwork();
  
  const wallets = useMemo(
    () => [
      // Phantom is now handled as a Standard Wallet
      // manually add any legacy wallet adapters here
      // new UnsafeBurnerWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={rpcUrl}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
