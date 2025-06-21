const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters long'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long']
  },
  bio: {
    type: String,
    required: [true, 'Bio is required'],
    trim: true,
    maxlength: [200, 'Bio cannot exceed 200 characters']
  },
  profilePicture: {
    type: String,
    required: [true, 'Profile picture is required'],
    match: [/^https?:\/\/.+/, 'Profile picture must be a valid URL']
  },
  // Password reset fields
  passwordResetOTP: {
    type: String,
    select: false
  },
  passwordResetExpires: {
    type: Date,
    select: false
  },
  passwordResetToken: {
    type: String,
    select: false
  },
  passwordResetTokenExpires: {
    type: Date,
    select: false
  },
  // Social features
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Account status
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  // Timestamps
  lastLogin: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for posts count
userSchema.virtual('postsCount', {
  ref: 'Post',
  localField: '_id',
  foreignField: 'author',
  count: true
});

// Virtual for followers count
userSchema.virtual('followersCount').get(function() {
  return this.followers ? this.followers.length : 0;
});

// Virtual for following count
userSchema.virtual('followingCount').get(function() {
  return this.following ? this.following.length : 0;
});

// Indexes for better query performance
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ username: 'text', bio: 'text' });

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to check password
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Instance method to generate auth token
userSchema.methods.generateAuthToken = function() {
  try {
    const payload = {
      id: this._id.toString(),
      username: this.username,
      email: this.email
    };

    console.log('🔧 JWT Debug - Generating token with payload:', payload);

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

    console.log('🔧 JWT Debug - Token generated successfully');
    return token;
  } catch (error) {
    console.error('🔧 JWT Debug - Token generation failed:', error);
    throw new Error('Token generation failed');
  }
};

// Instance method to get public profile
userSchema.methods.getPublicProfile = function() {
  const user = this.toObject();
  
  delete user.password;
  delete user.passwordResetOTP;
  delete user.passwordResetExpires;
  delete user.passwordResetToken;
  delete user.passwordResetTokenExpires;
  delete user.__v;

  return {
    _id: user._id,
    username: user.username,
    email: user.email,
    bio: user.bio,
    profilePicture: user.profilePicture,
    followersCount: user.followersCount || 0,
    followingCount: user.followingCount || 0,
    postsCount: user.postsCount || 0,
    isVerified: user.isVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
};

// MISSING STATIC METHODS - These are required by your auth routes

// Static method to find user by credentials (used by auth routes)
userSchema.statics.findByCredentials = async function(email, password) {
  try {
    console.log('🔍 FindByCredentials - Looking for user with email:', email);
    
    // Find user by email
    const user = await this.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.log('❌ FindByCredentials - User not found');
      throw new Error('Invalid email or password');
    }

    console.log('✅ FindByCredentials - User found:', user.username);

    // Check if account is active
    if (!user.isActive) {
      console.log('❌ FindByCredentials - Account deactivated');
      throw new Error('Account has been deactivated');
    }

    // Compare password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      console.log('❌ FindByCredentials - Password mismatch');
      throw new Error('Invalid email or password');
    }

    console.log('✅ FindByCredentials - Password match successful');

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    return user;
  } catch (error) {
    console.error('❌ FindByCredentials - Error:', error.message);
    throw error;
  }
};

// Static method to check if username or email already exists
userSchema.statics.checkExistence = async function(username, email, excludeUserId = null) {
  try {
    const conditions = [];
    
    if (username) {
      const usernameCondition = { 
        username: username.trim(),
        isActive: true 
      };
      if (excludeUserId) {
        usernameCondition._id = { $ne: excludeUserId };
      }
      conditions.push(usernameCondition);
    }
    
    if (email) {
      const emailCondition = { 
        email: email.toLowerCase().trim(),
        isActive: true 
      };
      if (excludeUserId) {
        emailCondition._id = { $ne: excludeUserId };
      }
      conditions.push(emailCondition);
    }

    if (conditions.length === 0) {
      return true;
    }

    const existingUsers = await this.find({ $or: conditions });
    
    for (const existingUser of existingUsers) {
      if (username && existingUser.username === username.trim()) {
        throw new Error('Username already exists');
      }
      if (email && existingUser.email === email.toLowerCase().trim()) {
        throw new Error('Email already exists');
      }
    }

    return true;
  } catch (error) {
    throw error;
  }
};

// Static method to get suggested users
userSchema.statics.getSuggestedUsers = async function(userId, limit = 5) {
  try {
    const currentUser = await this.findById(userId).select('following');
    const followingIds = currentUser ? currentUser.following : [];

    const suggestedUsers = await this.find({
      _id: { $nin: [...followingIds, userId] },
      isActive: true
    })
    .select('username profilePicture bio followersCount')
    .sort({ followersCount: -1, createdAt: -1 })
    .limit(limit);

    return suggestedUsers;
  } catch (error) {
    throw error;
  }
};

// Static method for user search
userSchema.statics.searchUsers = async function(query, limit = 10, excludeUserId = null) {
  try {
    const searchConditions = {
      isActive: true,
      $or: [
        { username: { $regex: query, $options: 'i' } },
        { bio: { $regex: query, $options: 'i' } }
      ]
    };

    if (excludeUserId) {
      searchConditions._id = { $ne: excludeUserId };
    }

    const users = await this.find(searchConditions)
      .select('username profilePicture bio followersCount')
      .limit(limit)
      .sort({ followersCount: -1, createdAt: -1 });

    return users;
  } catch (error) {
    throw error;
  }
};

// Pre-remove middleware to clean up related data
userSchema.pre('remove', async function(next) {
  try {
    // Remove user from other users' following/followers lists
    await this.constructor.updateMany(
      { following: this._id },
      { $pull: { following: this._id } }
    );
    
    await this.constructor.updateMany(
      { followers: this._id },
      { $pull: { followers: this._id } }
    );

    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('User', userSchema);