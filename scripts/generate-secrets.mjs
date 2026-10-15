import { randomBytes } from 'node:crypto';
console.log('Generate once, store in your approved password manager, then enter privately in Render.');
console.log('Do not upload this output, put it in chat, or commit it to GitHub.');
console.log('ADMIN_TOKEN=' + randomBytes(32).toString('base64url'));
console.log('COMPENSATION_ADMIN_TOKEN=' + randomBytes(32).toString('base64url'));
console.log('PII_ENCRYPTION_KEY=' + randomBytes(32).toString('base64'));
console.log('IMPORTANT: replacing the encryption key later makes existing private records unreadable without a controlled re-encryption migration.');
