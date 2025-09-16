import { NextApiRequest, NextApiResponse } from 'next';
import { getWalletMonitor, MonitoringRule } from '@/lib/walletMonitor';
import { NetworkType } from '@/context/NetworkContext';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { method } = req;

    switch (method) {
      case 'GET':
        await handleGetMonitoringStatus(req, res);
        break;
      case 'POST':
        await handleMonitoringAction(req, res);
        break;
      default:
        res.setHeader('Allow', ['GET', 'POST']);
        res.status(405).json({ error: `Method ${method} not allowed` });
    }
  } catch (error) {
    console.error('Monitor API error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleGetMonitoringStatus(req: NextApiRequest, res: NextApiResponse) {
  const { walletAddress } = req.query;

  try {
    const monitor = getWalletMonitor();
    const status = monitor.getMonitoringStatus();

    const response: any = {
      ...status,
      timestamp: new Date()
    };

    // Get wallet-specific monitoring rules if address provided
    if (walletAddress && typeof walletAddress === 'string') {
      const rules = await monitor.getMonitoringRules(walletAddress);
      response.walletRules = rules;
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('Error getting monitoring status:', error);
    res.status(500).json({ error: 'Failed to get monitoring status' });
  }
}

async function handleMonitoringAction(req: NextApiRequest, res: NextApiResponse) {
  const { action, network, walletAddress, rule } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'Missing action parameter' });
  }

  try {
    const monitor = getWalletMonitor();

    switch (action) {
      case 'start':
        await monitor.startMonitoring(network as NetworkType || 'mainnet-beta');
        res.status(200).json({ 
          message: `Monitoring started for ${network || 'mainnet-beta'}`,
          status: monitor.getMonitoringStatus()
        });
        break;

      case 'stop':
        await monitor.stopMonitoring(network as NetworkType);
        res.status(200).json({ 
          message: `Monitoring stopped${network ? ` for ${network}` : ''}`,
          status: monitor.getMonitoringStatus()
        });
        break;

      case 'add_rule':
        if (!walletAddress || !rule) {
          return res.status(400).json({ 
            error: 'Missing walletAddress or rule for add_rule action' 
          });
        }

        const newRule = await monitor.addMonitoringRule(walletAddress, rule);
        res.status(201).json({ 
          message: 'Monitoring rule added successfully',
          rule: newRule
        });
        break;

      case 'remove_rule':
        if (!walletAddress || !rule?.id) {
          return res.status(400).json({ 
            error: 'Missing walletAddress or rule.id for remove_rule action' 
          });
        }

        await monitor.removeMonitoringRule(walletAddress, rule.id);
        res.status(200).json({ 
          message: 'Monitoring rule removed successfully',
          ruleId: rule.id
        });
        break;

      case 'get_rules':
        if (!walletAddress) {
          return res.status(400).json({ 
            error: 'Missing walletAddress for get_rules action' 
          });
        }

        const rules = await monitor.getMonitoringRules(walletAddress);
        res.status(200).json({ 
          walletAddress,
          rules
        });
        break;

      default:
        res.status(400).json({ 
          error: 'Invalid action. Supported actions: start, stop, add_rule, remove_rule, get_rules' 
        });
    }
  } catch (error) {
    console.error('Error handling monitoring action:', error);
    res.status(500).json({ error: 'Failed to execute monitoring action' });
  }
}