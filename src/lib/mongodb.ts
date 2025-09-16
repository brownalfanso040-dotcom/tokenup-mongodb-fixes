import mongoose from 'mongoose';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || '';

async function connectDB() {
  // Check if the connection is already established
  if (mongoose.connection.readyState >= 1) {
    return;
  }

  // Connect to the database
  await mongoose.connect(uri);
  console.log('DB is connected');
}

let mongoClient: MongoClient | null = null;

export async function getMongoClient(): Promise<MongoClient> {
  if (!mongoClient) {
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    console.log('MongoDB client connected');
  }
  return mongoClient;
}

export default connectDB;
