// Test the middleware import
try {
  const middleware = require('./middleware/auth');
  console.log('✅ Middleware imported successfully');
  console.log('Available functions:', Object.keys(middleware));
  console.log('validateRequest type:', typeof middleware.validateRequest);
} catch (error) {
  console.error('❌ Error importing middleware:', error.message);
}