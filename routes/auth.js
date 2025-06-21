const express = require('express');
const { body } = require('express-validator');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const { auth, validateRequest, actionRateLimit } = require('../middleware/auth');

const router = express.Router();

// Configure nodemailer - FIXED: createTransport (not createTransporter)
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Validation rules
const signupValidation = {
  username: {
    required: true,
    minLength: 3,
    maxLength: 30,
    pattern: /^[a-zA-Z0-9_]+$/,
    message: 'Username can only contain letters, numbers, and underscores'
  },
  email: {
    required: true,
    pattern: /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
    message: 'Please provide a valid email address'
  },
  password: {
    required: true,
    minLength: 6,
    message: 'Password must be at least 6 characters long'
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

const loginValidation = {
  email: {
    required: true,
    pattern: /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
    message: 'Please provide a valid email address'
  },
  password: {
    required: true,
    minLength: 6,
    message: 'Password must be at least 6 characters long'
  }
};

const forgotPasswordValidation = {
  email: {
    required: true,
    pattern: /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
    message: 'Please provide a valid email address'
  }
};

const verifyOtpValidation = {
  email: {
    required: true,
    pattern: /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
    message: 'Please provide a valid email address'
  },
  otp: {
    required: true,
    pattern: /^\d{6}$/,
    message: 'OTP must be exactly 6 digits'
  }
};

const resetPasswordValidation = {
  token: {
    required: true,
    message: 'Reset token is required'
  },
  email: {
    required: true,
    pattern: /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
    message: 'Please provide a valid email address'
  },
  newPassword: {
    required: true,
    minLength: 6,
    message: 'New password must be at least 6 characters long'
  }
};

// Helper function to send email
const sendEmail = async (to, subject, html) => {
  try {
    const mailOptions = {
      from: `SocialApp <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Email sending error:', error);
    return false;
  }
};

// Helper function to find user by credentials (replaces static method)
const findUserByCredentials = async (email, password) => {
  try {
    console.log('🔍 FindByCredentials - Looking for user with email:', email);
    
    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.log('❌ FindByCredentials - User not found');
      throw new Error('Invalid email or password');
    }

    console.log('✅ FindByCredentials - User found:', user.username);

    // Compare password using the instance method
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

// Helper function to check if username or email exists
const checkUserExistence = async (username, email) => {
  try {
    // Check if username exists
    const existingUsername = await User.findOne({ 
      username: username.trim()
    });
    if (existingUsername) {
      throw new Error('Username already exists');
    }

    // Check if email exists
    const existingEmail = await User.findOne({ 
      email: email.toLowerCase().trim()
    });
    if (existingEmail) {
      throw new Error('Email already exists');
    }

    return true;
  } catch (error) {
    throw error;
  }
};

// @route   POST /api/auth/signup
// @desc    Register a new user
// @access  Public
router.post('/signup', 
  validateRequest(signupValidation),
  async (req, res) => {
    try {
      const { username, email, password, bio, profilePicture } = req.body;

      console.log('🔍 Signup Debug - Creating user:', username);

      // Check if user already exists
      await checkUserExistence(username, email);

      // Create new user
      const user = new User({
        username: username.trim(),
        email: email.toLowerCase().trim(),
        password,
        bio: bio.trim(),
        profilePicture
      });

      await user.save();
      console.log('✅ Signup Debug - User created successfully');

      // Generate token
      const token = user.generateAuthToken();

      // Get user without password
      const userResponse = user.getPublicProfile();

      res.status(201).json({
        status: 'success',
        message: 'User registered successfully',
        token,
        user: userResponse
      });

    } catch (error) {
      console.error('❌ Signup error:', error);

      if (error.message.includes('already exists')) {
        return res.status(400).json({
          status: 'error',
          message: error.message
        });
      }

      res.status(500).json({
        status: 'error',
        message: 'Error creating user account'
      });
    }
  }
);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res) => {
  try {
    console.log('🔍 Login Debug - Step 1: Login request received');
    
    const { email, password } = req.body;

    // Basic validation
    if (!email || !password) {
      console.log('❌ Login Debug - Missing email or password');
      return res.status(400).json({
        status: 'error',
        message: 'Email and password are required'
      });
    }

    console.log('🔍 Login Debug - Step 2: Validation passed, finding user');

    // Find user and validate credentials using our helper function
    const user = await findUserByCredentials(email.toLowerCase().trim(), password);
    console.log('🔍 Login Debug - Step 3: User found, generating token');

    // Generate token
    const token = user.generateAuthToken();
    console.log('🔍 Login Debug - Step 4: Token generated');

    // Get user without password
    const userResponse = user.getPublicProfile();
    console.log('🔍 Login Debug - Step 5: Sending response');

    res.json({
      status: 'success',
      message: 'Login successful',
      token,
      user: userResponse
    });

    console.log('✅ Login Debug - Login completed successfully');

  } catch (error) {
    console.error('❌ Login error:', error);

    if (error.message === 'Invalid email or password') {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password'
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Error during login'
    });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Send OTP for password reset
// @access  Public
router.post('/forgot-password',
  validateRequest(forgotPasswordValidation),
  // actionRateLimit(5, 15 * 60 * 1000), // Temporarily commented out for testing
  async (req, res) => {
    try {
      const { email } = req.body;

      // Find user by email
      const user = await User.findOne({ email: email.toLowerCase().trim() });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'No account found with this email address'
        });
      }

      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Store OTP with expiration (10 minutes)
      user.passwordResetOTP = otp;
      user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
      await user.save();

      // Email template
      const emailHTML = `
        <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8fafc; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 16px 16px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">Password Reset Request</h1>
          </div>
          
          <div style="background: white; padding: 40px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <h2 style="color: #2d3748; margin-top: 0;">Hello ${user.username}! 👋</h2>
            
            <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
              We received a request to reset your password for your SocialApp account. Use the verification code below to proceed:
            </p>
            
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; margin: 30px 0; border-radius: 12px;">
              <h1 style="color: white; font-size: 36px; letter-spacing: 8px; margin: 0; font-weight: bold;">${otp}</h1>
            </div>
            
            <div style="background: #edf2f7; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="color: #2d3748; margin: 0; font-size: 14px;">
                <strong>⏰ This code will expire in 10 minutes</strong><br>
                🔒 For security reasons, don't share this code with anyone<br>
                📧 This request was made from your account
              </p>
            </div>
            
            <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">
              If you didn't request this password reset, please ignore this email and your password will remain unchanged.
            </p>
            
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
            
            <p style="color: #718096; font-size: 12px; text-align: center; margin: 0;">
              This email was sent by SocialApp • If you have questions, contact our support team
            </p>
          </div>
        </div>
      `;

      // For development/testing - log OTP to console
      console.log(`OTP for ${email}: ${otp}`);

      // Try to send email, but don't fail if email service is not configured
      let emailSent = false;
      if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        emailSent = await sendEmail(
          email,
          'Password Reset OTP - SocialApp',
          emailHTML
        );
      } else {
        console.log('Email service not configured. OTP logged to console for testing.');
        emailSent = true; // Pretend email was sent for testing
      }

      if (!emailSent && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        return res.status(500).json({
          success: false,
          message: 'Failed to send email. Please try again.'
        });
      }

      res.json({
        success: true,
        message: 'OTP sent to your email successfully',
        ...(process.env.NODE_ENV === 'development' && { otp }) // Include OTP in response for testing
      });

    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send OTP. Please try again.'
      });
    }
  }
);

// @route   POST /api/auth/verify-otp
// @desc    Verify OTP and generate reset token
// @access  Public
router.post('/verify-otp',
  validateRequest(verifyOtpValidation),
  // actionRateLimit(10, 15 * 60 * 1000), // Temporarily commented out for testing
  async (req, res) => {
    try {
      const { email, otp } = req.body;

      // Find user with valid OTP
      const user = await User.findOne({
        email: email.toLowerCase().trim(),
        passwordResetOTP: otp,
        passwordResetExpires: { $gt: Date.now() }
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired OTP'
        });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      user.passwordResetToken = resetToken;
      user.passwordResetTokenExpires = Date.now() + 30 * 60 * 1000; // 30 minutes
      
      // Clear OTP fields
      user.passwordResetOTP = undefined;
      user.passwordResetExpires = undefined;
      
      await user.save();

      res.json({
        success: true,
        message: 'OTP verified successfully',
        resetToken
      });

    } catch (error) {
      console.error('OTP verification error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify OTP. Please try again.'
      });
    }
  }
);

// @route   POST /api/auth/reset-password
// @desc    Reset password using token
// @access  Public
router.post('/reset-password',
  validateRequest(resetPasswordValidation),
  // actionRateLimit(5, 15 * 60 * 1000), // Temporarily commented out for testing
  async (req, res) => {
    try {
      const { token, email, newPassword } = req.body;

      // Find user with valid reset token
      const user = await User.findOne({
        email: email.toLowerCase().trim(),
        passwordResetToken: token,
        passwordResetTokenExpires: { $gt: Date.now() }
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired reset token'
        });
      }

      // Update password and clear reset fields
      // Let the User model's pre-save middleware handle password hashing
      user.password = newPassword;
      user.passwordResetToken = undefined;
      user.passwordResetTokenExpires = undefined;
      
      await user.save();

      // Send confirmation email if email service is configured
      if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        const confirmationHTML = `
          <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8fafc; padding: 20px;">
            <div style="background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); padding: 30px; text-align: center; border-radius: 16px 16px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">Password Reset Successful! ✅</h1>
            </div>
            
            <div style="background: white; padding: 40px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <h2 style="color: #2d3748; margin-top: 0;">Hello ${user.username}! 👋</h2>
              
              <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
                Your password has been successfully reset. You can now log in to your SocialApp account with your new password.
              </p>
              
              <div style="background: #f0fff4; border-left: 4px solid #48bb78; padding: 20px; margin: 20px 0;">
                <p style="color: #2d3748; margin: 0; font-size: 14px;">
                  <strong>🔒 Security Tip:</strong> Make sure to use a strong, unique password and don't share it with anyone.
                </p>
              </div>
              
              <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">
                If you didn't reset your password, please contact our support team immediately.
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/login" 
                   style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                  Login to Your Account
                </a>
              </div>
              
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
              
              <p style="color: #718096; font-size: 12px; text-align: center; margin: 0;">
                This email was sent by SocialApp • If you have questions, contact our support team
              </p>
            </div>
          </div>
        `;

        // Send confirmation email (don't wait for it)
        sendEmail(
          email,
          'Password Reset Successful - SocialApp',
          confirmationHTML
        ).catch(console.error);
      }

      res.json({
        success: true,
        message: 'Password reset successfully'
      });

    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to reset password. Please try again.'
      });
    }
  }
);

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    console.log('🔍 Auth Me Debug - Getting user profile for:', req.user.username);
    
    // Get fresh user data from database with post count
    const user = await User.findById(req.user._id)
      .populate('postsCount')
      .select('-password');

    if (!user) {
      console.log('❌ Auth Me Debug - User not found in database');
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    console.log('✅ Auth Me Debug - User profile retrieved successfully');

    res.json({
      status: 'success',
      user: user.getPublicProfile()
    });

  } catch (error) {
    console.error('❌ Get profile error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching user profile'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user (client-side token removal)
// @access  Private
router.post('/logout', auth, async (req, res) => {
  try {
    // In a real application, you might want to blacklist the token
    // For now, we'll just send a success response
    // The client should remove the token from storage

    res.json({
      status: 'success',
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error during logout'
    });
  }
});

// @route   POST /api/auth/verify-token
// @desc    Verify if token is valid
// @access  Private
router.post('/verify-token', auth, async (req, res) => {
  try {
    // If we reach here, the token is valid (auth middleware passed)
    res.json({
      status: 'success',
      message: 'Token is valid',
      user: req.user.getPublicProfile()
    });

  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error verifying token'
    });
  }
});

// @route   POST /api/auth/refresh-token
// @desc    Refresh JWT token
// @access  Private
router.post('/refresh-token', auth, async (req, res) => {
  try {
    // Generate new token
    const token = req.user.generateAuthToken();

    res.json({
      status: 'success',
      message: 'Token refreshed successfully',
      token,
      user: req.user.getPublicProfile()
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error refreshing token'
    });
  }
});

module.exports = router;