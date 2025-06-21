const express = require('express');
const User = require('../models/User');
const Post = require('../models/Post');
const { auth, optionalAuth, validateRequest, actionRateLimit } = require('../middleware/auth');
const router = express.Router();

// Validation rules for profile update
const updateProfileValidation = {
  username: {
    required: true,
    minLength: 3,
    maxLength: 30,
    pattern: /^[a-zA-Z0-9_]+$/,
    message: 'Username can only contain letters, numbers, and underscores'
  },
  bio: {
    required: true,
    maxLength: 200,
    message: 'Bio cannot exceed 200 characters'
  },
  profilePicture: {
    required: true,
    pattern: /^https?:\/\/.+/,
    message: 'Profile picture must be a valid URL'
  }
};

// @route   GET /api/users/profile/:username
// @desc    Get user profile by username
// @access  Public
router.get('/profile/:username', optionalAuth, async (req, res) => {
  try {
    const { username } = req.params;

    console.log(`🔍 User Profile Debug - Fetching profile for: ${username}`);

    // Find user by username - Remove isActive check to avoid issues
    const user = await User.findOne({ username })
      .populate('postsCount')
      .select('-password');

    if (!user) {
      console.log(`❌ User Profile Debug - User not found: ${username}`);
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    console.log(`✅ User Profile Debug - User found: ${user.username} (ID: ${user._id})`);

    // Get additional stats
    const userProfile = user.getPublicProfile();
    
    console.log(`✅ User Profile Debug - Profile data prepared for: ${username}`);
    
    res.json({
      status: 'success',
      user: userProfile
    });

  } catch (error) {
    console.error('❌ Get user profile error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching user profile'
    });
  }
});

// @route   PUT /api/users/profile
// @desc    Update current user profile
// @access  Private
router.put('/profile',
  auth,
  validateRequest(updateProfileValidation),
  actionRateLimit(10, 60 * 60 * 1000), // 10 updates per hour
  async (req, res) => {
    try {
      const { username, bio, profilePicture } = req.body;
      const userId = req.user._id;

      console.log(`🔍 Update Profile Debug - User: ${req.user.username}, New username: ${username}`);

      // Check if username is taken by another user
      if (username !== req.user.username) {
        await User.checkExistence(username, null, userId);
      }

      // Update user profile
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
          username: username.trim(),
          bio: bio.trim(),
          profilePicture
        },
        { 
          new: true, 
          runValidators: true 
        }
      )
      .populate('postsCount')
      .select('-password');

      if (!updatedUser) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      console.log(`✅ Update Profile Debug - Profile updated for: ${updatedUser.username}`);

      res.json({
        status: 'success',
        message: 'Profile updated successfully',
        user: updatedUser.getPublicProfile()
      });

    } catch (error) {
      console.error('❌ Update profile error:', error);

      if (error.message.includes('already exists')) {
        return res.status(400).json({
          status: 'error',
          message: error.message
        });
      }

      res.status(500).json({
        status: 'error',
        message: 'Error updating profile'
      });
    }
  }
);

// @route   GET /api/users/search
// @desc    Search users by username or bio
// @access  Private
router.get('/search', auth, async (req, res) => {
  try {
    const { q, page = 1, limit = 10 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        status: 'error',
        message: 'Search query must be at least 2 characters long'
      });
    }

    const skip = (page - 1) * limit;
    const searchQuery = q.trim();

    console.log(`🔍 User Search Debug - Query: ${searchQuery}, Page: ${page}`);

    // Search users by username or bio (case insensitive)
    const users = await User.find({
      $and: [
        { _id: { $ne: req.user._id } }, // Exclude current user
        {
          $or: [
            { username: { $regex: searchQuery, $options: 'i' } },
            { bio: { $regex: searchQuery, $options: 'i' } }
          ]
        }
      ]
    })
    .select('username profilePicture bio createdAt')
    .sort({ username: 1 })
    .skip(skip)
    .limit(parseInt(limit));

    console.log(`✅ User Search Debug - Found ${users.length} users`);

    res.json({
      status: 'success',
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: users.length
      }
    });

  } catch (error) {
    console.error('❌ Search users error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error searching users'
    });
  }
});

// @route   GET /api/users/:userId/posts
// @desc    Get posts by specific user ID
// @access  Public
router.get('/:userId/posts', optionalAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    console.log(`🔍 User Posts by ID Debug - UserID: ${userId}, Page: ${page}`);

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      console.log(`❌ User Posts by ID Debug - User not found: ${userId}`);
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    console.log(`✅ User Posts by ID Debug - User found: ${user.username}`);

    // Get posts by user using the static method
    const posts = await Post.findVisiblePosts({
      page: parseInt(page),
      limit: parseInt(limit),
      author: userId,
      userId: req.user?._id // For checking if current user can see hidden posts
    });

    console.log(`✅ User Posts by ID Debug - Found ${posts.length} posts`);

    res.json({
      status: 'success',
      posts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: posts.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('❌ Get user posts error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching user posts'
    });
  }
});

// @route   DELETE /api/users/account
// @desc    Deactivate user account
// @access  Private
router.delete('/account', 
  auth,
  actionRateLimit(1, 24 * 60 * 60 * 1000), // 1 attempt per day
  async (req, res) => {
    try {
      const userId = req.user._id;

      console.log(`🔍 Deactivate Account Debug - User: ${req.user.username}`);

      // Deactivate user account (soft delete)
      await User.findByIdAndUpdate(userId, { 
        isActive: false 
      });

      // Optionally, you might want to hide all their posts
      await Post.updateMany(
        { author: userId },
        { isHidden: true }
      );

      console.log(`✅ Deactivate Account Debug - Account deactivated for: ${req.user.username}`);

      res.json({
        status: 'success',
        message: 'Account deactivated successfully'
      });

    } catch (error) {
      console.error('❌ Deactivate account error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Error deactivating account'
      });
    }
  }
);

// @route   GET /api/users/stats
// @desc    Get current user statistics
// @access  Private
router.get('/stats', auth, async (req, res) => {
  try {
    const userId = req.user._id;

    console.log(`🔍 User Stats Debug - Getting stats for: ${req.user.username}`);

    // Get various statistics
    const [
      postsCount,
      totalLikesReceived,
      totalCommentsReceived
    ] = await Promise.all([
      Post.countDocuments({ author: userId, isDeleted: false }),
      Post.aggregate([
        { $match: { author: userId, isDeleted: false } },
        { $project: { likesCount: { $size: '$likes' } } },
        { $group: { _id: null, total: { $sum: '$likesCount' } } }
      ]),
      Post.aggregate([
        { $match: { author: userId, isDeleted: false } },
        { $project: { commentsCount: { $size: '$comments' } } },
        { $group: { _id: null, total: { $sum: '$commentsCount' } } }
      ])
    ]);

    const stats = {
      postsCount,
      totalLikesReceived: totalLikesReceived[0]?.total || 0,
      totalCommentsReceived: totalCommentsReceived[0]?.total || 0,
      followersCount: req.user.followersCount || 0,
      followingCount: req.user.followingCount || 0
    };

    console.log(`✅ User Stats Debug - Stats calculated:`, stats);

    res.json({
      status: 'success',
      stats
    });

  } catch (error) {
    console.error('❌ Get user stats error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching user statistics'
    });
  }
});

module.exports = router;