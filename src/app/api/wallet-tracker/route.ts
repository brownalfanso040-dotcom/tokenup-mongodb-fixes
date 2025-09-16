import { NextRequest, NextResponse } from 'next/server';
import { getWalletTracker } from '@/lib/walletTracker';
import { getWalletTrackerDb } from '@/lib/walletTrackerDb';
import { TrackedWallet } from '@/lib/walletTracker';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'stats': {
        const db = await getWalletTrackerDb();
        const stats = await db.getWalletStats();
        
        // Get additional stats that aren't in the basic stats
        const wallets = await db.getAllWallets();
        const totalValue = wallets.reduce((sum: number, w: TrackedWallet) => sum + (w.totalValue || 0), 0);
        const totalActivitiesFromWallets = wallets.reduce((sum: number, w: TrackedWallet) => sum + (w.activityCount || 0), 0);
        
        return NextResponse.json({
          ...stats,
          totalValue,
          totalActivities: Math.max(stats.totalActivities, totalActivitiesFromWallets)
        });
      }

      case 'wallets': {
        const db = await getWalletTrackerDb();
        const wallets = await db.getAllWallets();
        return NextResponse.json(wallets);
      }

      case 'alerts': {
        const db = await getWalletTrackerDb();
        const alerts = await db.getWalletAlerts();
        return NextResponse.json(alerts);
      }

      case 'wallet-holdings': {
        const walletAddress = searchParams.get('address');
        if (!walletAddress) {
          return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
        }

        const db = await getWalletTrackerDb();
        const holdings = await db.getWalletHoldings(walletAddress);
        return NextResponse.json(holdings);
      }

      case 'wallet-activities': {
        const walletAddress = searchParams.get('address');
        const limitParam = searchParams.get('limit');
        const offsetParam = searchParams.get('offset');
        
        if (!walletAddress) {
          return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
        }

        const limit = limitParam ? parseInt(limitParam) : 100;
        const offset = offsetParam ? parseInt(offsetParam) : 0;

        const db = await getWalletTrackerDb();
        const activities = await db.getWalletActivities(walletAddress, limit, offset);
        
        return NextResponse.json(activities);
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Wallet tracker API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, data } = body;

    switch (action) {
      case 'addWallet': {
        const tracker = await getWalletTracker();
        const result = await tracker.addWallet(data.address, data.tags);
        return NextResponse.json(result);
      }

      case 'removeWallet': {
        const tracker = await getWalletTracker();
        await tracker.removeWallet(data.address);
        return NextResponse.json({ success: true });
      }

      case 'updateWallet': {
        const tracker = await getWalletTracker();
        const result = await tracker.updateWalletInfo(data.address, data.updates);
        return NextResponse.json(result);
      }

      case 'markAlertRead': {
        const db = await getWalletTrackerDb();
        const success = await db.markAlertAsRead(data.alertId);
        return NextResponse.json({ 
          success,
          modified: success ? 1 : 0
        });
      }

      case 'refreshWallet': {
        const tracker = await getWalletTracker();
        await tracker.refreshWalletData(data.address);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Wallet tracker API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}