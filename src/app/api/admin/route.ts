/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { Admin } from '../models/model';
import connectDB from '@/lib/mongodb';

// Default admin public key
const DEFAULT_ADMIN_PUBLIC_KEY = 'GU4sg1kR4YG4Y5NFMYJLhB6GKekXN2KnftLcVQESaBif';

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const data = await req.json();
    console.log('request', data);

    const newData = await Admin.findOneAndUpdate(
      {},
      {
        $set: {
          publicKey: data.pubKey,
        },
      },
      { new: true }
    );

    if (!newData) {
      return NextResponse.json({ message: 'Configuration data not found' }, { status: 403 });
    }

    return NextResponse.json(
      {
        pubKey: newData.publicKey,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Database connection error:', error);
    
    // If MongoDB connection fails, return a message indicating the operation couldn't be completed
    if (error.name === 'MongooseServerSelectionError' || error.message?.includes('Could not connect')) {
      console.log('MongoDB connection failed, cannot update admin configuration');
      return NextResponse.json(
        { 
          message: 'Database connection failed. Using default configuration.',
          pubKey: DEFAULT_ADMIN_PUBLIC_KEY 
        },
        { status: 503 } // Service Unavailable
      );
    }
    
    return NextResponse.json({ message: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    await connectDB();
    let data = await Admin.findOne();
    console.log(data);
    
    // If no admin data exists, create default configuration
    if (!data) {
      data = await Admin.create({
        publicKey: DEFAULT_ADMIN_PUBLIC_KEY,
        password: 'admin123' // Default password - should be changed in production
      });
      console.log('Created default admin configuration');
    }
    
    if (data?.publicKey) {
      return NextResponse.json(
        {
          pubKey: data.publicKey,
        },
        { status: 200 }
      );
    } else {
      return NextResponse.json({ message: 'Data not found' }, { status: 404 });
    }
  } catch (error: any) {
    console.error('Database connection error:', error);
    
    // If MongoDB connection fails, return the default public key
    if (error.name === 'MongooseServerSelectionError' || error.message?.includes('Could not connect')) {
      console.log('MongoDB connection failed, returning default admin public key');
      return NextResponse.json(
        {
          pubKey: DEFAULT_ADMIN_PUBLIC_KEY,
        },
        { status: 200 }
      );
    }
    
    return NextResponse.json({ message: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
