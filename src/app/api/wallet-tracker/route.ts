import { NextRequest, NextResponse } from 'next/server';
import { getWalletTracker } from '@/lib/walletTracker';
import { getWalletTrackerDb } from '@/lib/walletTrackerDb';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'stats': {
        const db = await getWalletTrackerDb();
        const wallets = await db.collection('wallets').find({}).toArray();
        const alerts = await db.collection('alerts').find({ read: false }).toArray();
        
        const stats = {
          totalWallets: wallets.length,
          activeWallets: wallets.filter(w => w.isActive).length,
          totalValue: wallets.reduce((sum, w) => sum + (w.totalValue || 0), 0),
          totalActivities: wallets.reduce((sum, w) => sum + (w.activityCount || 0), 0),
          unreadAlerts: alerts.length,
        };

        return NextResponse.json(stats);
      }

      case 'wallets': {
        const db = await getWalletTrackerDb();
        const wallets = await db.collection('wallets').find({}).toArray();
        return NextResponse.json(wallets);
      }

      case 'alerts': {
        const db = await getWalletTrackerDb();
        const alerts = await db.collection('alerts').find({}).sort({ timestamp: -1 }).toArray();
        return NextResponse.json(alerts);
      }

      case 'wallet-holdings': {
        const address = searchParams.get('address');
        if (!address) {
          return NextResponse.json({ error: 'Address required' }, { status: 400 });
        }
        
        const db = await getWalletTrackerDb();
        const holdings = await db.collection('holdings').find({ address }).toArray();
        return NextResponse.json(holdings);
      }

      case 'wallet-activities': {
        const address = searchParams.get('address');
        const limit = parseInt(searchParams.get('limit') || '100');
        
        if (!address) {
          return NextResponse.json({ error: 'Address required' }, { status: 400 });
        }
        
        const db = await getWalletTrackerDb();
        const activities = await db.collection('activities')
          .find({ address })
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
        const result = await tracker.updateWallet(data.address, data.updates);
        return NextResponse.json(result);
      }

      case 'markAlertRead': {
        const db = await getWalletTrackerDb();
        await db.collection('alerts').updateOne(
          { _id: data.alertId },
          { $set: { read: true } }
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