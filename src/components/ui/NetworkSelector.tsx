'use client';

import React from 'react';
import { useNetwork, NetworkType } from '@/context/NetworkContext';
import { ChevronDown, Globe, TestTube } from 'lucide-react';

const NetworkSelector: React.FC = () => {
  const { network, setNetwork } = useNetwork();
  const [isOpen, setIsOpen] = React.useState(false);

  const networks = [
    {
      id: 'mainnet' as NetworkType,
      name: 'Mainnet',
      description: 'Live network with real SOL',
      icon: Globe,
      color: 'text-green-400',
      bgColor: 'bg-green-400/10',
      borderColor: 'border-green-400/20'
    },
    {
      id: 'testnet' as NetworkType,
      name: 'Testnet',
      description: 'Test network with free SOL',
      icon: TestTube,
      color: 'text-orange-400',
      bgColor: 'bg-orange-400/10',
      borderColor: 'border-orange-400/20'
    }
  ];

  const currentNetwork = networks.find(n => n.id === network);

  const handleNetworkChange = (newNetwork: NetworkType) => {
    setNetwork(newNetwork);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200 hover:bg-white/5 ${
          currentNetwork?.bgColor
        } ${
          currentNetwork?.borderColor
        }`}
      >
        {currentNetwork && (
          <>
            <currentNetwork.icon className={`w-4 h-4 ${currentNetwork.color}`} />
            <span className="text-sm font-medium text-white">
              {currentNetwork.name}
            </span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`} />
          </>
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute top-full left-0 mt-2 w-64 bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl z-50">
            <div className="p-2">
              {networks.map((net) => {
                const Icon = net.icon;
                const isSelected = net.id === network;
                
                return (
                  <button
                    key={net.id}
                    onClick={() => handleNetworkChange(net.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all duration-200 hover:bg-white/5 ${
                      isSelected ? `${net.bgColor} ${net.borderColor} border` : 'border border-transparent'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${net.color}`} />
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium text-white">
                        {net.name}
                      </div>
                      <div className="text-xs text-gray-400">
                        {net.description}
                      </div>
                    </div>
                    {isSelected && (
                      <div className={`w-2 h-2 rounded-full ${net.color.replace('text-', 'bg-')}`} />
                    )}
                  </button>
                );
              })}
            </div>
            
            <div className="border-t border-gray-700 p-3">
              <div className="text-xs text-gray-400">
                <div className="mb-1">⚠️ Switching networks will:</div>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Reconnect your wallet</li>
                  <li>Change RPC endpoints</li>
                  <li>Reset current transactions</li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default NetworkSelector;