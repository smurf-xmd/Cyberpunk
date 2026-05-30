// Session Manager for WhatsApp Bot
'use strict';

const fs = require('fs-extra');
const path = require('path');
const zlib = require('zlib');
const logger = require('./logger');

const SESSION_DIR = path.join(process.cwd(), 'sessions');
const CREDS_FILE = path.join(SESSION_DIR, 'creds.json');
const SESSION_PREFIX = 'SMURF~';

// Decode base64 payload, automatically gunzip if compressed
function decodePayload(payload) {
  const buffer = Buffer.from(payload, 'base64');
  
  // Check for gzip magic bytes (0x1F 0x8B)
  if (buffer[0] === 31 && buffer[1] === 139) {
    const decompressed = zlib.gunzipSync(buffer);
    return JSON.parse(decompressed.toString('utf-8'));
  }
  
  return JSON.parse(buffer.toString('utf-8'));
}

// Validate session ID format and content
function isValidSession(sessionId) {
  // Must be a string
  if (typeof sessionId !== 'string') {
    return false;
  }
  
  const trimmedSession = sessionId.trim();
  
  // Must start with prefix
  if (!trimmedSession.startsWith(SESSION_PREFIX)) {
    return false;
  }
  
  // Extract encoded data
  const encodedData = trimmedSession.slice(SESSION_PREFIX.length);
  
  // Must have content and be reasonably long
  if (!encodedData || encodedData.length < 20) {
    return false;
  }
  
  // Verify it can be decoded
  try {
    decodePayload(encodedData);
    return true;
  } catch (error) {
    return false;
  }
}

// Write session data to file
async function writeSession(sessionId) {
  const trimmedSession = sessionId.trim();
  
  // Validate prefix
  if (!trimmedSession.startsWith(SESSION_PREFIX)) {
    throw new Error(`❌ Session must start with "${SESSION_PREFIX}" (got: ${trimmedSession.slice(0, 30)}...)`);
  }
  
  // Extract and decode
  const encodedData = trimmedSession.slice(SESSION_PREFIX.length);
  let sessionData;
  
  try {
    sessionData = decodePayload(encodedData);
  } catch (error) {
    throw new Error('❌ Failed to decode session data. Invalid format or corrupted.');
  }
  
  // Verify session has required fields
  if (!sessionData?.creds && !sessionData?.me && !sessionData?.signedIdentityKey) {
    throw new Error('❌ Session data missing required fields (creds, me, or signedIdentityKey)');
  }
  
  // Save to file
  await fs.ensureDir(SESSION_DIR);
  await fs.writeJson(CREDS_FILE, sessionData, { spaces: 2 });
  logger.success('SESSION', 'Session saved successfully!');
}

// Check if session file exists and is valid
function sessionExists() {
  try {
    // Check if file exists
    if (!fs.existsSync(CREDS_FILE)) {
      return false;
    }
    
    // Read and validate session data
    const sessionData = fs.readJsonSync(CREDS_FILE);
    return !!(sessionData?.creds || sessionData?.me || sessionData?.signedIdentityKey);
  } catch (error) {
    return false;
  }
}

// Encode existing session to base64 string
function encodeSession() {
  try {
    const sessionData = fs.readJsonSync(CREDS_FILE);
    const jsonString = JSON.stringify(sessionData);
    const base64String = Buffer.from(jsonString).toString('base64');
    return SESSION_PREFIX + base64String;
  } catch (error) {
    return null;
  }
}

// Prompt user for session input in terminal
function promptForSession() {
  return new Promise((resolve) => {
    // Display prompt UI
    console.log('\n' + [
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      'Paste your SESSION_ID below and press Enter.',
      'Format:  SMURF~xxxxxxxxxxxxxxxx...',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      ''
    ].join('\n'));
    
    let userInput = '';
    
    // Setup stdin for reading
    process.stdin.setEncoding('utf-8');
    process.stdin.resume();
    
    // Handle incoming data
    function onData(chunk) {
      userInput += chunk;
      const newlineIndex = userInput.indexOf('\n');
      
      // Wait for complete line
      if (newlineIndex === -1) return;
      
      // Extract session ID
      const sessionId = userInput.slice(0, newlineIndex).trim();
      userInput = userInput.slice(newlineIndex + 1);
      
      // Cleanup
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      
      // Validate session
      if (!isValidSession(sessionId)) {
        console.error('\n❌ Invalid session format!');
        console.error('   Session must start with "SMURF~" and contain valid data');
        userInput = '';
        process.stdin.resume();
        process.stdin.on('data', onData);
        return;
      }
      
      // Write session
      writeSession(sessionId)
        .then(() => {
          console.log('\n✅ Session saved successfully!');
          resolve();
        })
        .catch((error) => {
          console.error('\n❌', error.message);
          userInput = '';
          process.stdin.resume();
          process.stdin.on('data', onData);
        });
    }
    
    process.stdin.on('data', onData);
  });
}

// Main function to resolve session from various sources
async function resolveSession() {
  console.log(`📁 Session directory: ${SESSION_DIR}`);
  
  // Check if session already exists
  if (sessionExists()) {
    console.log(`✅ Session file found: ${CREDS_FILE}`);
    logger.success('SESSION', 'Using existing session');
    return;
  }
  
  // Check for environment variables
  const envSessionId = process.env.SESSION_ID?.trim();
  
  // Detect cloud hosting environments
  const isCloudEnvironment = !!(
    process.env.DYNO ||                    // Heroku
    process.env.RAILWAY_ENVIRONMENT ||     // Railway
    process.env.RENDER ||                  // Render
    process.env.KOYEB_SERVICE_NAME ||      // KoYeb
    process.env.KATABAMP ||                // Katabamp
    process.env.PTERODACTYL ||             // Pterodactyl
    process.env.PANEL                      // General panel
  );
  
  // Cloud environment handling
  if (isCloudEnvironment) {
    if (!envSessionId) {
      console.error('❌ SESSION_ID environment variable is required in cloud environment!');
      console.error('   Example: SESSION_ID=SMURF~your_actual_session_id_here');
      console.error('\n   How to fix:');
      console.error('   1. Get your session ID from your WhatsApp bot');
      console.error('   2. Add it to your environment variables');
      console.error('   3. Restart your application');
      process.exit(1);
    }
    
    console.log(`🔍 Using SESSION_ID from environment (length: ${envSessionId.length} characters)`);
    
    if (!isValidSession(envSessionId)) {
      logger.error('SESSION', `Invalid SESSION_ID format: ${envSessionId.slice(0, 35)}...`);
      process.exit(1);
    }
    
    await writeSession(envSessionId);
    return;
  }
  
  // Local environment with SESSION_ID in .env
  if (envSessionId) {
    if (!isValidSession(envSessionId)) {
      logger.error('SESSION', `Invalid SESSION_ID format: ${envSessionId.slice(0, 35)}...`);
      process.exit(1);
    }
    
    await writeSession(envSessionId);
    return;
  }
  
  // Interactive mode (TTY / terminal)
  if (process.stdin.isTTY) {
    console.log('\n' + '='.repeat(50));
    console.log('📱 SESSION SETUP');
    console.log('='.repeat(50));
    console.log('\n📌 Option 1: Use environment variable');
    console.log('   SESSION_ID=SMURF~your_actual_session_id_here\n');
    console.log('📌 Option 2: Use .env file');
    console.log('   1. Create a .env file in the project root');
    console.log('   2. Add this line:');
    console.log('   SESSION_ID=SMURF~your_actual_session_id_here\n');
    console.log('📌 Option 3: Paste your session ID below');
    console.log('='.repeat(50));
  }
  
  // Interactive input
  await promptForSession();
}

// Export public API
module.exports = {
  resolveSession,    // Main function to get/load session
  sessionExists,     // Check if session exists
  isValidSession,    // Validate session ID format
  writeSession,      // Save session to file
  encodeSession,     // Convert session to base64 string
  SESSION_DIR,       // Path to sessions directory
  SESSION_PREFIX     // Session ID prefix
};
