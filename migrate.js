const mongoose = require('mongoose');

// Simple credentials - UPDATE PASSWORD TO MATCH WHAT YOU SET IN ATLAS
const USERNAME = 'zahmedasim';
const PASSWORD = 'Simikhan123';  
const CLUSTER_URL = 'social-media-cluster.6hru8ak.mongodb.net';
const DATABASE_NAME = 'social-media-app';

// Connection strings
const LOCAL_URI = 'mongodb://localhost:27017/social-media-app';
const ATLAS_URI = `mongodb+srv://${USERNAME}:${PASSWORD}@${CLUSTER_URL}/${DATABASE_NAME}?retryWrites=true&w=majority`;

console.log('🔍 Testing Atlas Connection First...');
console.log('Username:', USERNAME);
console.log('Password:', PASSWORD);
console.log('Cluster:', CLUSTER_URL);
console.log('Full URI:', ATLAS_URI);
console.log('==========================================\n');

// Import your models
const User = require('./models/User');
const Post = require('./models/Post');

const testConnection = async () => {
  try {
    console.log('🔄 Testing connection to Atlas...');
    
    await mongoose.connect(ATLAS_URI);
    console.log('✅ Successfully connected to MongoDB Atlas!');
    console.log('📊 Database name:', mongoose.connection.name);
    
    // Quick test - count existing documents
    const existingUsers = await User.countDocuments();
    const existingPosts = await Post.countDocuments();
    console.log(`📈 Current data: ${existingUsers} users, ${existingPosts} posts`);
    
    await mongoose.disconnect();
    console.log('✅ Connection test successful!\n');
    return true;
    
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    return false;
  }
};

const migrateData = async () => {
  try {
    // First test the connection
    const connectionWorking = await testConnection();
    if (!connectionWorking) {
      console.error('❌ Cannot proceed with migration - connection failed');
      process.exit(1);
    }

    console.log('🔄 Starting data migration...');

    // Step 1: Get data from local database
    console.log('📡 Connecting to local MongoDB...');
    await mongoose.connect(LOCAL_URI);
    
    console.log('📥 Fetching data from local database...');
    const users = await User.find({}).lean();
    const posts = await Post.find({}).lean();
    
    console.log(`✅ Found ${users.length} users and ${posts.length} posts`);
    await mongoose.disconnect();

    // Step 2: Connect to Atlas and migrate
    console.log('☁️ Connecting to Atlas for migration...');
    await mongoose.connect(ATLAS_URI);
    
    // Clear existing data
    console.log('🗑️ Clearing existing data...');
    await User.deleteMany({});
    await Post.deleteMany({});
    
    // Insert new data
    console.log('📤 Inserting users...');
    if (users.length > 0) {
      await User.insertMany(users);
      console.log(`✅ Migrated ${users.length} users`);
    }
    
    console.log('📤 Inserting posts...');
    if (posts.length > 0) {
      await Post.insertMany(posts);
      console.log(`✅ Migrated ${posts.length} posts`);
    }

    // Verify
    console.log('🔍 Verifying migration...');
    const finalUsers = await User.countDocuments();
    const finalPosts = await Post.countDocuments();
    console.log(`📊 Final count: ${finalUsers} users, ${finalPosts} posts`);

    console.log('\n🎉 Migration completed successfully!');
    console.log('🔗 Your data is now in MongoDB Atlas');
    console.log('🚀 Ready for Vercel deployment!');

    // Show login info
    const demoUser = await User.findOne({ email: 'demo@example.com' });
    if (demoUser) {
      console.log('\n📋 Test login credentials:');
      console.log('   Email: demo@example.com');
      console.log('   Password: demo123');
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    
    if (error.message.includes('authentication failed')) {
      console.error('\n🔐 Authentication still failing:');
      console.error('1. ❌ Go to Atlas → Database Access');
      console.error('2. ❌ Click EDIT on zahmedasim user');
      console.error('3. ❌ Click "Edit Password"'); 
      console.error('4. ❌ Set password to: password123');
      console.error('5. ❌ Make sure role is "Atlas admin"');
      console.error('6. ❌ Click "Update User"');
      console.error('7. ❌ Wait 1-2 minutes and try again');
    }
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

// Run migration
migrateData();