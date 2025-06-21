const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to verify JWT token
const auth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    console.log('🔍 Auth Debug - Authorization header:', authHeader ? 'Present' : 'Missing');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ Auth Debug - Invalid authorization header format');
      return res.status(401).json({
        status: 'error',
        message: 'Access denied. No token provided or invalid format.'
      });
    }
    
    const token = authHeader.substring(7);
    
    if (!token) {
      console.log('❌ Auth Debug - No token after Bearer');
      return res.status(401).json({
        status: 'error',
        message: 'Access denied. No token provided.'
      });
    }
    
    console.log('🔍 Auth Debug - Token extracted, length:', token.length);
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ Auth Debug - Token decoded successfully, User ID:', decoded.id);
    
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      console.log('❌ Auth Debug - User not found for ID:', decoded.id);
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token. User not found.'
      });
    }
    
    console.log('✅ Auth Debug - User found:', user.username);
    
    // REMOVED: isActive check since it's likely not in your User model
    // if (!user.isActive) {
    //   return res.status(401).json({
    //     status: 'error',
    //     message: 'Account is deactivated.'
    //   });
    // }
    
    req.user = user;
    next();
    
  } catch (error) {
    console.error('❌ Auth middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      console.log('❌ Auth Debug - Invalid JWT');
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token.'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      console.log('❌ Auth Debug - Token expired');
      return res.status(401).json({
        status: 'error',
        message: 'Token expired. Please login again.'
      });
    }
    
    res.status(500).json({
      status: 'error',
      message: 'Server error during authentication.'
    });
  }
};

// Optional auth middleware
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }
    
    const token = authHeader.substring(7);
    
    if (!token) {
      req.user = null;
      return next();
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    
    if (user) {
      req.user = user;
    } else {
      req.user = null;
    }
    
    next();
    
  } catch (error) {
    req.user = null;
    next();
  }
};

// Check ownership middleware
const checkOwnership = (resourceField = 'author') => {
  return (req, res, next) => {
    try {
      const resource = req.resource;
      
      if (!resource) {
        return res.status(404).json({
          status: 'error',
          message: 'Resource not found.'
        });
      }
      
      const resourceOwnerId = resource[resourceField];
      const userId = req.user._id;
      
      if (!resourceOwnerId.equals(userId)) {
        return res.status(403).json({
          status: 'error',
          message: 'Access denied. You can only modify your own content.'
        });
      }
      
      next();
      
    } catch (error) {
      console.error('Ownership check error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Server error during ownership verification.'
      });
    }
  };
};

// Validation middleware
const validateRequest = (validationRules) => {
  return (req, res, next) => {
    const errors = [];
    
    for (const field in validationRules) {
      const rules = validationRules[field];
      const value = req.body[field];
      
      if (rules.required && (!value || value.toString().trim() === '')) {
        errors.push(`${field} is required`);
        continue;
      }
      
      if (!value && !rules.required) {
        continue;
      }
      
      const stringValue = value ? value.toString() : '';
      
      if (rules.minLength && stringValue.length < rules.minLength) {
        errors.push(`${field} must be at least ${rules.minLength} characters long`);
      }
      
      if (rules.maxLength && stringValue.length > rules.maxLength) {
        errors.push(`${field} cannot exceed ${rules.maxLength} characters`);
      }
      
      if (rules.pattern && stringValue && !rules.pattern.test(stringValue)) {
        errors.push(rules.message || `${field} format is invalid`);
      }
      
      if (rules.validate && !rules.validate(value)) {
        errors.push(rules.message || `${field} is invalid`);
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors
      });
    }
    
    next();
  };
};

// Rate limiting middleware
const actionRateLimit = (maxActions = 10, windowMs = 60000) => {
  const attempts = new Map();
  
  return (req, res, next) => {
    const userId = req.user._id.toString();
    const now = Date.now();
    const windowKey = `${userId}-${Math.floor(now / windowMs)}`;
    
    const currentWindow = Math.floor(now / windowMs);
    for (const key of attempts.keys()) {
      const keyWindow = parseInt(key.split('-')[1]);
      if (keyWindow < currentWindow - 1) {
        attempts.delete(key);
      }
    }
    
    const currentAttempts = attempts.get(windowKey) || 0;
    
    if (currentAttempts >= maxActions) {
      const timeUntilReset = windowMs - (now % windowMs);
      return res.status(429).json({
        status: 'error',
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil(timeUntilReset / 1000)
      });
    }
    
    attempts.set(windowKey, currentAttempts + 1);
    next();
  };
};

// Admin middleware
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      status: 'error',
      message: 'Authentication required'
    });
  }
  
  if (!req.user.isAdmin) {
    return res.status(403).json({
      status: 'error',
      message: 'Admin access required'
    });
  }
  
  next();
};

// ObjectId validation
const validateObjectId = (paramName = 'id') => {
  return (req, res, next) => {
    const mongoose = require('mongoose');
    const id = req.params[paramName];
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid ${paramName} format`
      });
    }
    
    next();
  };
};

// Input sanitization
const sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = obj[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+="[^"]*"/gi, '')
          .trim();
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitize(obj[key]);
      }
    }
  };
  
  if (req.body) {
    sanitize(req.body);
  }
  
  if (req.query) {
    sanitize(req.query);
  }
  
  next();
};

// User action logging
const logUserAction = (action) => {
  return (req, res, next) => {
    const logData = {
      user: req.user ? req.user._id : 'anonymous',
      action: action,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      timestamp: new Date(),
      route: req.originalUrl,
      method: req.method
    };
    
    if (process.env.NODE_ENV === 'development') {
      console.log('User Action:', logData);
    }
    
    next();
  };
};

module.exports = {
  auth,
  optionalAuth,
  checkOwnership,
  validateRequest,
  actionRateLimit,
  requireAdmin,
  validateObjectId,
  sanitizeInput,
  logUserAction
};