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
        const wallets = await db.collections.trackedWallets.find({}).toArray();
        const alerts = await db.collections.walletAlerts.find({ isRead: false }).toArray();
        
        const stats = {
          totalWallets: wallets.length,
          activeWallets: wallets.filter((w: TrackedWallet) => w.isActive).length,
          totalValue: wallets.reduce((sum: number, w: TrackedWallet) => sum + (w.totalValue || 0), 0),
          totalActivities: wallets.reduce((sum: number, w: TrackedWallet) => sum + (w.activityCount || 0), 0),
          unreadAlerts: alerts.length,
        };

        return NextResponse.json(stats);
      }

      case 'wallets': {
        const db = await getWalletTrackerDb();
        const wallets = await db.collections.trackedWallets.find({}).toArray();
        return NextResponse.json(wallets);
      }

      case 'alerts': {
        const db = await getWalletTrackerDb();
        const alerts = await db.collections.walletAlerts.find({}).sort({ createdAt: -1 }).toArray();
        return NextResponse.json(alerts);
      }

      case 'wallet-holdings': {
        const address = searchParams.get('address');
        if (!address) {
          return NextResponse.json({ error: 'Address required' }, { status: 400 });
        }
        
        const db = await getWalletTrackerDb();
        const holdings = await db.collections.walletHoldings.find({ walletAddress: address }).toArray();
        return NextResponse.json(holdings);
      }

      case 'wallet-activities': {
        const address = searchParams.get('address');
        const limit = parseInt(searchParams.get('limit') || '100');
        
        if (!address) {
          return NextResponse.json({ error: 'Address required' }, { status: 400 });
        }
        
        const db = await getWalletTrackerDb();
        const activities = await db.collections.walletActivities
          .find({ walletAddress: address })
          .sort({ timestamp: -1 })
          .limit(limit)
          .toArray();
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
        await db.collections.walletAlerts.updateOne(
          { _id: data.alertId },
          { $set: { isRead: true } }
        );
        return NextResponse.json({ success: true });
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