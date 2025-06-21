const mongoose = require('mongoose');
const faker = require('faker');
require('dotenv').config();

// Import models
const User = require('../models/User');
const Post = require('../models/Post');

// Sample profile pictures from Unsplash
const profilePictures = [
  'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&h=150&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&h=150&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1544725176-7c40e5a71c5e?w=150&h=150&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?w=150&h=150&fit=crop&crop=face'
];

// Sample post images
const postImages = [
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1501436513145-30f24e19fcc4?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1448375240586-882707db888b?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1418065460487-3bdd9a50dc23?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?w=600&h=400&fit=crop'
];

// Post content templates
const postContents = [
  "Just had an amazing coffee at this local café! ☕️ #coffee #morning",
  "Beautiful sunset today! Nature never fails to amaze me 🌅",
  "Working on some exciting new projects. Can't wait to share! 💻",
  "Weekend vibes! Time to relax and recharge 🌴",
  "Trying out this new recipe today. Wish me luck! 👨‍🍳",
  "Great workout session this morning! Feeling energized 💪",
  "Reading this amazing book. Highly recommend it! 📚",
  "Exploring the city and finding hidden gems 🏙️",
  "Spent the day with family. These moments are precious ❤️",
  "Learning something new every day. Growth mindset! 🧠",
  "Grateful for all the opportunities coming my way 🙏",
  "Music is the soundtrack to life 🎵",
  "Travel plans are in the works! Exciting times ahead ✈️",
  "Cooking experiments in the kitchen today 🍳",
  "Art has the power to inspire and heal 🎨"
];

// Connect to database
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ Database connection error:', error);
    process.exit(1);
  }
};

// Create test users
const createUsers = async (count = 60) => {
  console.log(`🔄 Creating ${count} users...`);
  
  const users = [];
  const createdUsers = [];

  // Create demo user
  users.push({
    username: 'demo',
    email: 'demo@example.com',
    password: 'demo123',
    bio: 'Demo user for testing the social media application',
    profilePicture: profilePictures[0]
  });

  // Create random users
  for (let i = 0; i < count - 1; i++) {
    const firstName = faker.name.firstName();
    const lastName = faker.name.lastName();
    const username = faker.internet.userName(firstName, lastName).toLowerCase();
    
    users.push({
      username: username,
      email: faker.internet.email(firstName, lastName).toLowerCase(),
      password: 'password123',
      bio: faker.lorem.sentence(),
      profilePicture: profilePictures[Math.floor(Math.random() * profilePictures.length)]
    });
  }

  // Save users to database
  for (const userData of users) {
    try {
      const user = new User(userData);
      const savedUser = await user.save();
      createdUsers.push(savedUser);
      console.log(`✅ Created user: ${userData.username}`);
    } catch (error) {
      console.log(`⚠️ Error creating user ${userData.username}:`, error.message);
    }
  }

  console.log(`✅ Created ${createdUsers.length} users successfully`);
  return createdUsers;
};

// Create test posts
const createPosts = async (users, count = 200) => {
  console.log(`🔄 Creating ${count} posts...`);
  
  const posts = [];
  const createdPosts = [];

  for (let i = 0; i < count; i++) {
    const author = users[Math.floor(Math.random() * users.length)];
    const hasImages = Math.random() > 0.6; // 40% chance of having images
    const imageCount = hasImages ? Math.floor(Math.random() * 3) + 1 : 0; // 1-3 images
    
    const images = [];
    if (hasImages) {
      for (let j = 0; j < imageCount; j++) {
        images.push(postImages[Math.floor(Math.random() * postImages.length)]);
      }
    }

    const hasContent = Math.random() > 0.2; // 80% chance of having content
    
    const postData = {
      author: author._id,
      content: hasContent ? postContents[Math.floor(Math.random() * postContents.length)] : '',
      images: images,
      createdAt: faker.date.between('2023-01-01', new Date())
    };

    // Ensure post has either content or images
    if (!postData.content && postData.images.length === 0) {
      postData.content = postContents[Math.floor(Math.random() * postContents.length)];
    }

    posts.push(postData);
  }

  // Save posts to database
  for (const postData of posts) {
    try {
      const post = new Post(postData);
      const savedPost = await post.save();
      createdPosts.push(savedPost);
    } catch (error) {
      console.log(`⚠️ Error creating post:`, error.message);
    }
  }

  console.log(`✅ Created ${createdPosts.length} posts successfully`);
  return createdPosts;
};

// Add likes to posts
const addLikes = async (users, posts) => {
  console.log('🔄 Adding likes to posts...');
  
  let likesAdded = 0;

  for (const post of posts) {
    const likeCount = Math.floor(Math.random() * 15); // 0-14 likes per post
    const likers = faker.random.arrayElements(users, likeCount);
    
    for (const liker of likers) {
      if (!post.likes.includes(liker._id)) {
        post.likes.push(liker._id);
        likesAdded++;
      }
    }
    
    await post.save();
  }

  console.log(`✅ Added ${likesAdded} likes to posts`);
};

// Add comments to posts
const addComments = async (users, posts) => {
  console.log('🔄 Adding comments to posts...');
  
  let commentsAdded = 0;

  const commentTexts = [
    "Great post! 👍",
    "Love this! ❤️",
    "Amazing content!",
    "Thanks for sharing!",
    "This is awesome!",
    "Really enjoyed reading this",
    "Totally agree with you",
    "Nice perspective!",
    "Keep up the great work!",
    "Inspiring! 🌟",
    "Well said!",
    "This made my day 😊",
    "Couldn't agree more",
    "Excellent point!",
    "So true!"
  ];

  for (const post of posts) {
    const commentCount = Math.floor(Math.random() * 8); // 0-7 comments per post
    
    for (let i = 0; i < commentCount; i++) {
      const commenter = users[Math.floor(Math.random() * users.length)];
      const commentText = commentTexts[Math.floor(Math.random() * commentTexts.length)];
      
      const comment = {
        content: commentText,
        author: commenter._id,
        createdAt: faker.date.between(post.createdAt, new Date())
      };

      // Add some likes to comments
      const commentLikeCount = Math.floor(Math.random() * 5);
      const commentLikers = faker.random.arrayElements(users, commentLikeCount);
      comment.likes = commentLikers.map(liker => liker._id);

      post.comments.push(comment);
      commentsAdded++;
    }
    
    await post.save();
  }

  console.log(`✅ Added ${commentsAdded} comments to posts`);
};

// Add replies to comments
const addReplies = async (users, posts) => {
  console.log('🔄 Adding replies to comments...');
  
  let repliesAdded = 0;

  const replyTexts = [
    "Thanks!",
    "Exactly!",
    "I agree!",
    "Well said",
    "True that",
    "👍",
    "❤️",
    "💯",
    "Yes!",
    "Absolutely"
  ];

  for (const post of posts) {
    for (const comment of post.comments) {
      const replyCount = Math.random() > 0.7 ? Math.floor(Math.random() * 3) + 1 : 0; // 30% chance of replies
      
      for (let i = 0; i < replyCount; i++) {
        const replier = users[Math.floor(Math.random() * users.length)];
        const replyText = replyTexts[Math.floor(Math.random() * replyTexts.length)];
        
        const reply = {
          content: replyText,
          author: replier._id,
          createdAt: faker.date.between(comment.createdAt, new Date()),
          likes: []
        };

        comment.replies.push(reply);
        repliesAdded++;
      }
    }
    
    await post.save();
  }

  console.log(`✅ Added ${repliesAdded} replies to comments`);
};

// Clear existing data
const clearDatabase = async () => {
  console.log('🔄 Clearing existing data...');
  
  await User.deleteMany({});
  await Post.deleteMany({});
  
  console.log('✅ Database cleared');
};

// Print login credentials
const printLoginCredentials = (users) => {
  console.log('\n🔑 LOGIN CREDENTIALS FOR TESTING:');
  console.log('=====================================');
  
  // Demo user
  console.log('📧 Email: demo@example.com');
  console.log('🔒 Password: demo123');
  console.log('👤 Username: demo');
  console.log('');
  
  // Random test users
  const testUsers = users.slice(1, 6); // Get 5 random users
  
  testUsers.forEach((user, index) => {
    console.log(`User ${index + 2}:`);
    console.log(`📧 Email: ${user.email}`);
    console.log(`🔒 Password: password123`);
    console.log(`👤 Username: ${user.username}`);
    console.log('');
  });
  
  console.log('Note: All random users have password "password123"');
  console.log('=====================================\n');
};

// Main seeding function
const seedDatabase = async () => {
  try {
    console.log('🚀 Starting database seeding...\n');
    
    await connectDB();
    await clearDatabase();
    
    const users = await createUsers(60);
    const posts = await createPosts(users, 200);
    
    await addLikes(users, posts);
    await addComments(users, posts);
    await addReplies(users, posts);
    
    printLoginCredentials(users);
    
    console.log('🎉 Database seeding completed successfully!');
    console.log(`📊 Summary: ${users.length} users, ${posts.length} posts created`);
    
  } catch (error) {
    console.error('❌ Error seeding database:', error);
  } finally {
    mongoose.disconnect();
    console.log('👋 Disconnected from database');
  }
};

// Run seeding if this script is executed directly
if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };