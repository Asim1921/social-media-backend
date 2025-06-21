const express = require('express');
const Post = require('../models/Post');
const User = require('../models/User');
const { auth, optionalAuth, checkOwnership, validateRequest, actionRateLimit } = require('../middleware/auth');

const router = express.Router();

// Validation rules
const createPostValidation = {
  content: {
    required: false,
    maxLength: 500,
    message: 'Post content cannot exceed 500 characters'
  }
};

const commentValidation = {
  content: {
    required: true,
    maxLength: 500,
    message: 'Comment cannot exceed 500 characters'
  }
};

const replyValidation = {
  content: {
    required: true,
    maxLength: 200,
    message: 'Reply cannot exceed 200 characters'
  }
};

// Middleware to get post and check if it exists
const getPost = async (req, res, next) => {
  try {
    const post = await Post.findOne({
      _id: req.params.postId,
      isDeleted: false
    })
    .populate('author', 'username profilePicture')
    .populate('comments.author', 'username profilePicture')
    .populate('comments.replies.author', 'username profilePicture');

    if (!post) {
      return res.status(404).json({
        status: 'error',
        message: 'Post not found'
      });
    }

    req.resource = post;
    next();
  } catch (error) {
    console.error('Get post middleware error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching post'
    });
  }
};

// IMPORTANT: Put specific routes BEFORE parameterized routes to avoid conflicts

// @route   GET /api/posts/trending
// @desc    Get trending posts (most liked in last 24 hours)
// @access  Public
router.get('/trending', optionalAuth, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const trendingPosts = await Post.aggregate([
      {
        $match: {
          isDeleted: false,
          isHidden: false,
          createdAt: { $gte: oneDayAgo }
        }
      },
      {
        $addFields: {
          likesCount: { $size: '$likes' },
          commentsCount: { $size: '$comments' }
        }
      },
      {
        $sort: { likesCount: -1, commentsCount: -1, createdAt: -1 }
      },
      {
        $limit: parseInt(limit)
      },
      {
        $lookup: {
          from: 'users',
          localField: 'author',
          foreignField: '_id',
          as: 'author',
          pipeline: [
            { $project: { username: 1, profilePicture: 1 } }
          ]
        }
      },
      {
        $unwind: '$author'
      }
    ]);

    res.json({
      status: 'success',
      posts: trendingPosts
    });

  } catch (error) {
    console.error('Get trending posts error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching trending posts'
    });
  }
});

// @route   GET /api/posts/user/:username
// @desc    Get posts by username
// @access  Public
router.get('/user/:username', optionalAuth, async (req, res) => {
  try {
    const { username } = req.params;
    const { page = 1, limit = 10 } = req.query;

    console.log(`🔍 User Posts Debug - Fetching posts for user: ${username}, page: ${page}, limit: ${limit}`);

    // Find user by username - Remove isActive check if it's causing issues
    const user = await User.findOne({ username });
    if (!user) {
      console.log(`❌ User Posts Debug - User not found: ${username}`);
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
        posts: []
      });
    }

    console.log(`✅ User Posts Debug - User found: ${user.username} (ID: ${user._id})`);

    const posts = await Post.findVisiblePosts({
      page: parseInt(page),
      limit: parseInt(limit),
      author: user._id,
      userId: req.user?._id
    });

    console.log(`✅ User Posts Debug - Found ${posts.length} posts for user ${username}`);

    // Disable caching for this response
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.json({
      status: 'success',
      posts: posts || [],
      pagination: {
        currentPage: parseInt(page),
        totalPosts: posts.length,
        hasMore: posts.length === parseInt(limit)
      },
      user: {
        _id: user._id,
        username: user.username,
        profilePicture: user.profilePicture
      }
    });

  } catch (error) {
    console.error('❌ User Posts Debug - Error fetching user posts:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch user posts',
      posts: [] // Always provide empty array as fallback
    });
  }
});

// @route   GET /api/posts
// @desc    Get all posts (feed)
// @access  Public
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, sortBy = 'createdAt' } = req.query;

    console.log(`🔍 Posts Debug - Fetching posts: page ${page}, limit ${limit}, sortBy ${sortBy}`);

    const posts = await Post.findVisiblePosts({
      page: parseInt(page),
      limit: parseInt(limit),
      userId: req.user?._id,
      sortBy
    });

    console.log(`✅ Posts Debug - Found ${posts.length} posts`);

    // Disable caching for this response
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.json({
      status: 'success',
      posts: posts || [],
      pagination: {
        currentPage: parseInt(page),
        totalPosts: posts.length,
        hasMore: posts.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('❌ Posts Debug - Error fetching posts:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch posts',
      posts: [] // Always provide empty array as fallback
    });
  }
});

// @route   GET /api/posts/:postId
// @desc    Get single post
// @access  Public
router.get('/:postId', optionalAuth, getPost, async (req, res) => {
  try {
    const post = req.resource;

    // Check if user can see this post
    if (post.isHidden && (!req.user || !post.author._id.equals(req.user._id))) {
      return res.status(404).json({
        status: 'error',
        message: 'Post not found'
      });
    }

    res.json({
      status: 'success',
      post
    });

  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching post'
    });
  }
});

// @route   POST /api/posts
// @desc    Create a new post
// @access  Private
router.post('/',
  auth,
  validateRequest(createPostValidation),
  actionRateLimit(20, 60 * 60 * 1000), // 20 posts per hour
  async (req, res) => {
    try {
      const { content, images = [] } = req.body;

      console.log(`🔍 Create Post Debug - User: ${req.user.username}, Content: ${content ? 'Yes' : 'No'}, Images: ${images.length}`);

      // Validate that post has content or images
      if (!content?.trim() && (!images || images.length === 0)) {
        return res.status(400).json({
          status: 'error',
          message: 'Post must have either content or images'
        });
      }

      // Validate image URLs
      if (images.length > 5) {
        return res.status(400).json({
          status: 'error',
          message: 'Maximum 5 images allowed per post'
        });
      }

      for (const image of images) {
        if (!image || !/^https?:\/\/.+/.test(image)) {
          return res.status(400).json({
            status: 'error',
            message: 'Invalid image URL'
          });
        }
      }

      // Create post
      const post = new Post({
        content: content?.trim() || '',
        images,
        author: req.user._id
      });

      await post.save();

      // Populate post data
      await post.populate('author', 'username profilePicture');

      console.log(`✅ Create Post Debug - Post created successfully: ${post._id}`);

      res.status(201).json({
        status: 'success',
        message: 'Post created successfully',
        post
      });

    } catch (error) {
      console.error('❌ Create Post Debug - Error creating post:', error);
      res.status(500).json({
        status: 'error',
        message: 'Error creating post'
      });
    }
  }
);

// @route   PUT /api/posts/:postId
// @desc    Update a post
// @access  Private
router.put('/:postId',
  auth,
  getPost,
  checkOwnership(),
  validateRequest(createPostValidation),
  actionRateLimit(10, 60 * 60 * 1000), // 10 updates per hour
  async (req, res) => {
    try {
      const post = req.resource;
      const { content, images = [] } = req.body;

      // Validate that post has content or images
      if (!content?.trim() && (!images || images.length === 0)) {
        return res.status(400).json({
          status: 'error',
          message: 'Post must have either content or images'
        });
      }

      // Validate image URLs
      if (images.length > 5) {
        return res.status(400).json({
          status: 'error',
          message: 'Maximum 5 images allowed per post'
        });
      }

      for (const image of images) {
        if (!image || !/^https?:\/\/.+/.test(image)) {
          return res.status(400).json({
            status: 'error',
            message: 'Invalid image URL'
          });
        }
      }

      // Update post
      post.content = content?.trim() || '';
      post.images = images;

      await post.save();

      res.json({
        status: 'success',
        message: 'Post updated successfully',
        post
      });

    } catch (error) {
      console.error('Update post error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Error updating post'
      });
    }
  }
);

// @route   PATCH /api/posts/:postId/hide
// @desc    Hide/unhide a post
// @access  Private
router.patch('/:postId/hide',
  auth,
  getPost,
  checkOwnership(),
  async (req, res) => {
    try {
      const post = req.resource;

      // Toggle hidden status
      post.isHidden = !post.isHidden;
      await post.save();

      res.json({
        status: 'success',
        message: `Post ${post.isHidden ? 'hidden' : 'unhidden'} successfully`,
        post
      });

    } catch (error) {
      console.error('Hide post error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Error hiding/unhiding post'
      });
    }
  }
);

// @route   DELETE /api/posts/:postId
// @desc    Delete a post
// @access  Private
router.delete('/:postId',
  auth,
  getPost,
  checkOwnership(),
  async (req, res) => {
    try {
      const post = req.resource;

      // Soft delete
      post.isDeleted = true;
      await post.save();

      res.json({
        status: 'success',
        message: 'Post deleted successfully'
      });

    } catch (error) {
      console.error('Delete post error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Error deleting post'
      });
    }
  }
);

// @route   POST /api/posts/:postId/like
// @desc    Like/unlike a post
// @access  Private
router.post('/:postId/like',
  auth,
  getPost,
  actionRateLimit(50, 60 * 1000), // 50 likes per minute
  async (req, res) => {
    try {
      const post = req.resource;
      const userId = req.user._id;

      console.log(`🔍 Like Post Debug - User: ${req.user.username}, Post: ${post._id}, Action: Toggle Like`);

      // Check if post is accessible
      if (post.isHidden && !post.author._id.equals(userId)) {
        return res.status(404).json({
          status: 'error',
          message: 'Post not found'
        });
      }

      // Toggle like
      await post.toggleLike(userId);

      console.log(`✅ Like Post Debug - Like toggled successfully`);

      res.json({
        status: 'success',
        message: 'Like toggled successfully',
        post
      });

    } catch (error) {
      console.error('❌ Like Post Debug - Error liking post:', error);
      res.status(500).json({
        status: 'error',
        message: 'Error liking post'
      });
    }
  }
);

// @route   GET /api/posts/:postId/likes
// @desc    Get users who liked a post
// @access  Public
router.get('/:postId/likes', optionalAuth, getPost, async (req, res) => {
  try {
    const post = req.resource;
    const { page = 1, limit = 20 } = req.query;

    // Check if post is accessible
    if (post.isHidden && (!req.user || !post.author._id.equals(req.user._id))) {
      return res.status(404).json({
        status: 'error',
        message: 'Post not found'
      });
    }

    const skip = (page - 1) * limit;

    // Get users who liked the post
    const users = await User.find({
      _id: { $in: post.likes }
    })
    .select('username profilePicture bio')
    .skip(skip)
    .limit(parseInt(limit))
    .sort({ username: 1 });

    res.json({
      status: 'success',
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: post.likes.length,
        hasMore: skip + users.length < post.likes.length
      }
    });

  } catch (error) {
    console.error('Get post likes error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching post likes'
    });
  }
});

// @route   POST /api/posts/:postId/comments
// @desc    Add a comment to a post
// @access  Private
router.post('/:postId/comments',
  auth,
  getPost,
  validateRequest(commentValidation),
  actionRateLimit(30, 60 * 60 * 1000), // 30 comments per hour
  async (req, res) => {
    try {
      const post = req.resource;
      const { content } = req.body;

      console.log(`🔍 Add Comment Debug - User: ${req.user.username}, Post: ${post._id}, Comment: ${content.substring(0, 50)}...`);

      // Check if post is accessible
      if (post.isHidden && !post.author._id.equals(req.user._id)) {
        return res.status(404).json({
          status: 'error',
          message: 'Post not found'
        });
      }

      // Add comment
      const commentData = {
        content: content.trim(),
        author: req.user._id
      };

      await post.addComment(commentData);
      await post.populate('comments.author', 'username profilePicture');

      console.log(`✅ Add Comment Debug - Comment added successfully`);

      res.status(201).json({
        status: 'success',
        message: 'Comment added successfully',
        post
      });

    } catch (error) {
      console.error('❌ Add Comment Debug - Error adding comment:', error);
      res.status(500).json({
        status: 'error',
        message: 'Error adding comment'
      });
    }
  }
);

// @route   POST /api/posts/:postId/comments/:commentId/like
// @desc    Like/unlike a comment
// @access  Private
router.post('/:postId/comments/:commentId/like',
  auth,
  getPost,
  actionRateLimit(50, 60 * 1000), // 50 likes per minute
  async (req, res) => {
    try {
      const post = req.resource;
      const { commentId } = req.params;
      const userId = req.user._id;

      // Check if post is accessible
      if (post.isHidden && !post.author._id.equals(userId)) {
        return res.status(404).json({
          status: 'error',
          message: 'Post not found'
        });
      }

      // Toggle comment like
      await post.toggleCommentLike(commentId, userId);

      res.json({
        status: 'success',
        message: 'Comment like toggled successfully',
        post
      });

    } catch (error) {
      console.error('Like comment error:', error);
      
      if (error.message === 'Comment not found') {
        return res.status(404).json({
          status: 'error',
          message: 'Comment not found'
        });
      }

      res.status(500).json({
        status: 'error',
        message: 'Error liking comment'
      });
    }
  }
);

// @route   POST /api/posts/:postId/comments/:commentId/replies
// @desc    Add a reply to a comment
// @access  Private
router.post('/:postId/comments/:commentId/replies',
  auth,
  getPost,
  validateRequest(replyValidation),
  actionRateLimit(30, 60 * 60 * 1000), // 30 replies per hour
  async (req, res) => {
    try {
      const post = req.resource;
      const { commentId } = req.params;
      const { content } = req.body;

      // Check if post is accessible
      if (post.isHidden && !post.author._id.equals(req.user._id)) {
        return res.status(404).json({
          status: 'error',
          message: 'Post not found'
        });
      }

      // Add reply
      const replyData = {
        content: content.trim(),
        author: req.user._id
      };

      await post.addReply(commentId, replyData);
      await post.populate('comments.replies.author', 'username profilePicture');

      res.status(201).json({
        status: 'success',
        message: 'Reply added successfully',
        post
      });

    } catch (error) {
      console.error('Add reply error:', error);
      
      if (error.message === 'Comment not found') {
        return res.status(404).json({
          status: 'error',
          message: 'Comment not found'
        });
      }

      res.status(500).json({
        status: 'error',
        message: 'Error adding reply'
      });
    }
  }
);

// @route   POST /api/posts/:postId/comments/:commentId/replies/:replyId/like
// @desc    Like/unlike a reply
// @access  Private
router.post('/:postId/comments/:commentId/replies/:replyId/like',
  auth,
  getPost,
  actionRateLimit(50, 60 * 1000), // 50 likes per minute
  async (req, res) => {
    try {
      const post = req.resource;
      const { commentId, replyId } = req.params;
      const userId = req.user._id;

      // Check if post is accessible
      if (post.isHidden && !post.author._id.equals(userId)) {
        return res.status(404).json({
          status: 'error',
          message: 'Post not found'
        });
      }

      // Toggle reply like
      await post.toggleReplyLike(commentId, replyId, userId);

      res.json({
        status: 'success',
        message: 'Reply like toggled successfully',
        post
      });

    } catch (error) {
      console.error('Like reply error:', error);
      
      if (error.message.includes('not found')) {
        return res.status(404).json({
          status: 'error',
          message: error.message
        });
      }

      res.status(500).json({
        status: 'error',
        message: 'Error liking reply'
      });
    }
  }
);

module.exports = router;