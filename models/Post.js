const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
  content: {
    type: String,
    required: [true, 'Reply content is required'],
    trim: true,
    maxlength: [200, 'Reply cannot exceed 200 characters']
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true
});

const commentSchema = new mongoose.Schema({
  content: {
    type: String,
    required: [true, 'Comment content is required'],
    trim: true,
    maxlength: [500, 'Comment cannot exceed 500 characters']
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  replies: [replySchema]
}, {
  timestamps: true
});

const postSchema = new mongoose.Schema({
  content: {
    type: String,
    trim: true,
    maxlength: [500, 'Post content cannot exceed 500 characters']
  },
  images: [{
    type: String,
    match: [/^https?:\/\/.+/, 'Invalid image URL']
  }],
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  comments: [commentSchema],
  isHidden: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ createdAt: -1 });
postSchema.index({ likes: 1 });
postSchema.index({ isDeleted: 1, isHidden: 1 });

// Virtual for likes count
postSchema.virtual('likesCount').get(function() {
  return this.likes ? this.likes.length : 0;
});

// Virtual for comments count
postSchema.virtual('commentsCount').get(function() {
  return this.comments ? this.comments.length : 0;
});

// Validation: Post must have either content or images
postSchema.pre('validate', function(next) {
  if (!this.content && (!this.images || this.images.length === 0)) {
    this.invalidate('content', 'Post must have either content or images');
  }
  next();
});

// Static method to find visible posts - THE KEY METHOD THAT WAS MISSING
postSchema.statics.findVisiblePosts = async function(options = {}) {
  const {
    page = 1,
    limit = 10,
    author = null,
    userId = null,
    sortBy = 'createdAt'
  } = options;

  const skip = (page - 1) * limit;

  try {
    // Build match criteria
    const matchCriteria = {
      isDeleted: false
    };

    // If looking for specific author's posts
    if (author) {
      matchCriteria.author = new mongoose.Types.ObjectId(author);
    }

    // Handle visibility - show hidden posts only to their authors
    if (userId) {
      matchCriteria.$or = [
        { isHidden: false },
        { author: new mongoose.Types.ObjectId(userId) }
      ];
    } else {
      matchCriteria.isHidden = false;
    }

    // Build sort criteria
    let sortCriteria = {};
    switch (sortBy) {
      case 'likes':
        sortCriteria = { likesCount: -1, createdAt: -1 };
        break;
      case 'comments':
        sortCriteria = { commentsCount: -1, createdAt: -1 };
        break;
      default:
        sortCriteria = { createdAt: -1 };
    }

    const posts = await this.find(matchCriteria)
      .populate('author', 'username profilePicture')
      .populate({
        path: 'comments',
        populate: {
          path: 'author',
          select: 'username profilePicture'
        }
      })
      .populate({
        path: 'comments.replies',
        populate: {
          path: 'author',
          select: 'username profilePicture'
        }
      })
      .sort(sortCriteria)
      .skip(skip)
      .limit(limit)
      .lean();

    // Add virtual fields for sorting
    return posts.map(post => ({
      ...post,
      likesCount: post.likes ? post.likes.length : 0,
      commentsCount: post.comments ? post.comments.length : 0
    }));

  } catch (error) {
    console.error('Error in findVisiblePosts:', error);
    throw error;
  }
};

// Instance method to toggle like
postSchema.methods.toggleLike = async function(userId) {
  try {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const isLiked = this.likes.some(like => like.equals(userObjectId));

    if (isLiked) {
      this.likes.pull(userObjectId);
    } else {
      this.likes.push(userObjectId);
    }

    await this.save();
    return this;
  } catch (error) {
    console.error('Error in toggleLike:', error);
    throw error;
  }
};

// Instance method to add comment
postSchema.methods.addComment = async function(commentData) {
  try {
    this.comments.push(commentData);
    await this.save();
    return this;
  } catch (error) {
    console.error('Error in addComment:', error);
    throw error;
  }
};

// Instance method to toggle comment like
postSchema.methods.toggleCommentLike = async function(commentId, userId) {
  try {
    const comment = this.comments.id(commentId);
    
    if (!comment) {
      throw new Error('Comment not found');
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const isLiked = comment.likes.some(like => like.equals(userObjectId));

    if (isLiked) {
      comment.likes.pull(userObjectId);
    } else {
      comment.likes.push(userObjectId);
    }

    await this.save();
    return this;
  } catch (error) {
    console.error('Error in toggleCommentLike:', error);
    throw error;
  }
};

// Instance method to add reply
postSchema.methods.addReply = async function(commentId, replyData) {
  try {
    const comment = this.comments.id(commentId);
    
    if (!comment) {
      throw new Error('Comment not found');
    }

    comment.replies.push(replyData);
    await this.save();
    return this;
  } catch (error) {
    console.error('Error in addReply:', error);
    throw error;
  }
};

// Instance method to toggle reply like
postSchema.methods.toggleReplyLike = async function(commentId, replyId, userId) {
  try {
    const comment = this.comments.id(commentId);
    
    if (!comment) {
      throw new Error('Comment not found');
    }

    const reply = comment.replies.id(replyId);
    
    if (!reply) {
      throw new Error('Reply not found');
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const isLiked = reply.likes.some(like => like.equals(userObjectId));

    if (isLiked) {
      reply.likes.pull(userObjectId);
    } else {
      reply.likes.push(userObjectId);
    }

    await this.save();
    return this;
  } catch (error) {
    console.error('Error in toggleReplyLike:', error);
    throw error;
  }
};

module.exports = mongoose.model('Post', postSchema);