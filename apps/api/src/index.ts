import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

import cookieParser from 'cookie-parser';
import session from 'express-session';
import passport from 'passport';
import { setupPassport } from './auth/passport';
import authRoutes from './auth/routes';
import interviewRoutes from './interview/routes';
import aiRoutes from './ai/routes';
import identityRoutes from './identity/routes';
import accountsRoutes from './accounts/routes';
import { getStorageAdapter } from './shared/storage';
import { sectionAuth, requireStorageAccess } from './shared/section-auth';
import stripeWebhookRoutes from './webhooks/stripe';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
const storage = getStorageAdapter();

app.use(cors({
  origin: process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000',
  credentials: true
}));

// Stripe webhook must see the RAW body for signature verification, so it is
// mounted with express.raw BEFORE the JSON body parser. It's unauthenticated
// (verified by the Stripe signature), so it sits ahead of session/passport too.
app.use('/webhooks', express.raw({ type: 'application/json' }), stripeWebhookRoutes);

// 15MB covers base64-encoded audio (10MB raw = ~13.3MB base64) with headroom.
// Video uploads use multipart/FormData (not JSON), so they bypass this limit.
app.use(express.json({ limit: '15mb' }));
app.use(cookieParser(process.env.COOKIE_SECRET || 'lb-signed-cookie-secret-2026'));

// Session + Passport (OAuth login: Google + Microsoft).
// Dev uses the default in-memory session store, so sessions reset on API restart.
app.use(session({
  secret: process.env.SESSION_SECRET || 'legacybridge-session-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  },
}));
setupPassport();
app.use(passport.initialize());
app.use(passport.session());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/storage/*', requireStorageAccess, async (req, res) => {
  const filePath = (req.params as any)[0];
  try {
    const buffer = await storage.get(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.wav': 'audio/wav',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
      '.txt': 'text/plain'
    };
    res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
    res.send(buffer);
  } catch (error) {
    res.status(404).send('File not found');
  }
});

// TODO: Pass — TI Decrypt
// Route: GET /api/accounts/decrypt (TI role only)
// 
// 1. Verify TI is authenticated and 2FA verified
// 2. Verify release trigger has fired for 
//    this parent (check release_events table)
// 3. Fetch vault_key_id from parent_keys
// 4. Retrieve private key from Supabase Vault:
//    const { data } = await supabase
//      .from('vault.decrypted_secrets')
//      .select('decrypted_secret')
//      .eq('id', vaultKeyId)
//      .single()
//    const privateKeyPem = data.decrypted_secret
// 5. Decrypt each sensitive_entries row:
//    const decrypted = privateDecrypt(
//      {
//        key: privateKeyPem,
//        padding: 
//          crypto.constants.RSA_PKCS1_OAEP_PADDING
//      },
//      Buffer.from(encryptedData, 'base64')
//    ).toString('utf8')
// 6. Return decrypted entries to TI only
// 7. Private key never leaves apps/api

import learnRoutes from './learn/routes';
import settingsRoutes from './settings/routes';
import onboardingRoutes from './onboarding/routes';
import invitesRoutes from './invites/routes';
import notificationsRoutes from './notifications/routes';
import relationshipsRoutes from './relationships/routes';
import inviteFlowRoutes from './invite/routes';
import documentsRoutes from './documents/routes';
import finalWishesRoutes from './final-wishes/routes';
import lettersRoutes from './letters/routes';
import occasionsRoutes from './occasions/routes';
import billingRoutes from './billing/routes';
import paymentTransfersRoutes from './payment-transfers/routes';
import releaseRoutes from './release/routes';
import packagesRoutes from './release/packages-routes';
import workersRoutes from './workers/routes';
import { handleMulterError } from './shared/upload-limits';

// Guide sections: repoint legacy x-user-id routes onto the real session user and
// mark the matching tile "started" on writes. Interview serves My Life Story and
// Health & Medical, so its tile depends on the request's section param.
const interviewTile = (req: any) =>
  (req.query?.section === 'health_legacy' || req.body?.section === 'health_legacy') ? 'health' : 'life_story';

app.use('/auth', authRoutes);
app.use('/interview', sectionAuth(interviewTile), interviewRoutes);
app.use('/ai', aiRoutes);
app.use('/identity', identityRoutes);
app.use('/accounts', sectionAuth('accounts'), accountsRoutes);
app.use('/learn', learnRoutes);
app.use('/settings', settingsRoutes);
app.use('/onboarding', onboardingRoutes);
app.use('/invites', invitesRoutes);
app.use('/notifications', notificationsRoutes);
app.use('/relationships', relationshipsRoutes);
app.use('/invite', inviteFlowRoutes);
app.use('/documents', sectionAuth('wills'), documentsRoutes);
app.use('/final-wishes', sectionAuth('final_wishes'), finalWishesRoutes);
app.use('/letters', sectionAuth('letters'), lettersRoutes);
app.use('/occasions', sectionAuth('occasions'), occasionsRoutes);
app.use('/billing', billingRoutes);
app.use('/payment-transfers', paymentTransfersRoutes);
app.use('/release', releaseRoutes);
app.use('/packages', packagesRoutes);
app.use('/workers', workersRoutes);

// Catch multer file-size and type errors, return clean JSON responses
app.use(handleMulterError);

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});
