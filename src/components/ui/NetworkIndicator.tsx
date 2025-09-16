'use client';

import React from 'react';
import { useNetwork } from '@/context/NetworkContext';
import { Globe, TestTube, AlertTriangle } from 'lucide-react';

const NetworkIndicator: React.FC = () => {
  const { network } = useNetwork();

  const networkConfig = {
    mainnet: {
      name: 'Mainnet',
      icon: Globe,
      color: 'text-green-400',
      bgColor: 'bg-green-400/10',
      borderColor: 'border-green-400/30',
      description: 'Live network with real SOL'
    },
    devnet: {
      name: 'Devnet',
      icon: TestTube,
      color: 'text-orange-400',
      bgColor: 'bg-orange-400/10',
      borderColor: 'border-orange-400/30',
      description: 'Test network with free SOL'
    }
  };

  const config = networkConfig[network];
  const Icon = config.icon;

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200 ${
      config.bgColor
    } ${
      config.borderColor
    }`}>
      <Icon className={`w-4 h-4 ${config.color}`} />
      <div className="flex flex-col">
        <span className="text-sm font-medium text-white">
          {config.name}
        </span>
        <span className="text-xs text-gray-400">
          {config.description}
        </span>
      </div>
      
      {network === 'devnet' && (
        <div className="flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 text-orange-400" />
          <span className="text-xs text-orange-400 font-medium">TEST</span>
        </div>
      )}
    </div>
  );
};

export default NetworkIndicator;