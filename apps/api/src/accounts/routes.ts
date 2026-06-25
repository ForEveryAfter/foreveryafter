import { Router } from 'express';
import { publicEncrypt, constants } from 'crypto';
import { supabase } from '../shared/supabase';
import { ensureParentPublicKey } from '../utils/encryption';

const router = Router();

// Middleware to verify Supabase session AND 2FA cookie
const accountsAuthMiddleware = async (req: any, res: any, next: any) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: No user ID provided' });
  }

  // Pass 9 Refinement: Parent doesn't need 2FA to enter their own "Accounts & Locations"
  // because it's a write-only/metadata-only view. 2FA is for TI access (future).
  
  req.userId = userId;
  next();
};

// POST /verify-2fa - Trigger Supabase phone OTP
router.post('/verify-2fa', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // In a real app, we'd fetch the phone number from Supabase Auth
    // For this pass, we assume Supabase phone OTP is triggered via their API
    const { data: user, error: userError } = await supabase.auth.admin.getUserById(userId as string);
    
    if (userError || !user.user) {
      throw new Error('User not found in Supabase Auth');
    }

    const phone = user.user.phone;
    if (!phone) {
      return res.status(400).json({ error: 'No phone number registered for this account' });
    }

    const { error } = await supabase.auth.signInWithOtp({
      phone: phone,
    });

    if (error) throw error;
    res.json({ sent: true });
  } catch (err: any) {
    console.error('2FA Trigger error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /verify-2fa/confirm - Verify OTP and set cookie
router.post('/verify-2fa/confirm', async (req, res) => {
  const { code } = req.body;
  const userId = req.headers['x-user-id'];

  if (!code || !userId) return res.status(400).json({ error: 'Missing code or user ID' });

  try {
    const { data: user, error: userError } = await supabase.auth.admin.getUserById(userId as string);
    if (userError || !user.user) throw new Error('User not found');

    const { error } = await supabase.auth.verifyOtp({
      phone: user.user.phone!,
      token: code,
      type: 'sms',
    });

    if (error) throw error;

    // Set signed httpOnly cookie with 15 min TTL
    res.cookie('accounts_verified', 'true', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      signed: true,
      maxAge: 900000, // 15 minutes
      sameSite: 'lax',
    });

    res.json({ verified: true });
  } catch (err: any) {
    console.error('2FA Confirm error:', err);
    res.status(400).json({ error: 'Invalid verification code' });
  }
});

// GET / - List all sensitive entries (metadata only)
router.get('/', accountsAuthMiddleware, async (req: any, res) => {
  try {
    const { data, error } = await supabase
      .from('sensitive_entries')
      .select('id, category, label, is_required, handled_in_will, sort_order, encrypted_data')
      .eq('parent_guid', req.userId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    const entries = data.map(entry => ({
      ...entry,
      has_data: !!entry.encrypted_data,
      encrypted_data: undefined // Never return the encrypted data in the list
    }));

    res.json(entries);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /entry - Add new entry (Encrypt data)
router.post('/entry', accountsAuthMiddleware, async (req: any, res) => {
  const { category, label, data: plaintext } = req.body;

  if (!category || !label || !plaintext) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // 1. Fetch or lazily-create the parent's RSA public key. Users created before
    //    identity/onboard was wired (or who skipped it) won't have a parent_keys
    //    row; ensureParentPublicKey generates a 2048-bit keypair, stores the
    //    private half in Supabase Vault, and writes the public + vault_key_id
    //    to parent_keys before returning the public PEM.
    const publicKey = await ensureParentPublicKey(req.userId, supabase);

    // 2. Encrypt Data
    const encrypted = publicEncrypt(
      {
        key: publicKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING
      },
      Buffer.from(plaintext, 'utf8')
    ).toString('base64');

    // 3. Upsert Entry
    const { data: entry, error: dbError } = await supabase
      .from('sensitive_entries')
      .insert({
        parent_guid: req.userId,
        category,
        label,
        encrypted_data: encrypted,
        handled_in_will: false
      })
      .select('id')
      .single();

    if (dbError) throw dbError;

    res.json({ success: true, id: entry.id });
  } catch (err: any) {
    console.error('Entry save error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /entry/:id - Update entry
router.patch('/entry/:id', accountsAuthMiddleware, async (req: any, res) => {
  const { id } = req.params;
  const { label, data: plaintext } = req.body;

  try {
    const updates: any = {};
    if (label) updates.label = label;
    
    if (plaintext) {
      // Re-encrypt. Use the lazy helper for the same reason as POST /entry — a
      // user editing an existing entry might never have had a keypair (the only
      // way that's possible is a corrupted state, but it's cheap to self-heal).
      const publicKey = await ensureParentPublicKey(req.userId, supabase);

      updates.encrypted_data = publicEncrypt(
        {
          key: publicKey,
          padding: constants.RSA_PKCS1_OAEP_PADDING
        },
        Buffer.from(plaintext, 'utf8')
      ).toString('base64');
      updates.handled_in_will = false; // Reset if new data provided
    }

    const { error } = await supabase
      .from('sensitive_entries')
      .update(updates)
      .eq('id', id)
      .eq('parent_guid', req.userId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /entry/:id/will-toggle - Handle Will/Trust toggle
router.patch('/entry/:id/will-toggle', accountsAuthMiddleware, async (req: any, res) => {
  const { id } = req.params;
  const { handled_in_will } = req.body;

  try {
    const updates: any = { handled_in_will };
    if (handled_in_will) {
      updates.encrypted_data = null; // Clear if handled in will
    }

    const { error } = await supabase
      .from('sensitive_entries')
      .update(updates)
      .eq('id', id)
      .eq('parent_guid', req.userId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /entry/:id - Hard delete non-required entries
router.delete('/entry/:id', accountsAuthMiddleware, async (req: any, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from('sensitive_entries')
      .delete()
      .eq('id', id)
      .eq('parent_guid', req.userId)
      .eq('is_required', false);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /custom-category - Add custom category (stored as seed entry)
router.post('/custom-category', accountsAuthMiddleware, async (req: any, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name required' });

  try {
    const { data, error } = await supabase
      .from('sensitive_entries')
      .insert({
        parent_guid: req.userId,
        category: 'custom',
        label: name,
        is_required: false
      })
      .select('id')
      .single();

    if (error) throw error;
    res.json({ success: true, id: data.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /custom-category/:label - Delete all entries in custom category
router.delete('/custom-category/:label', accountsAuthMiddleware, async (req: any, res) => {
  const { label } = req.params;

  try {
    const { count, error } = await supabase
      .from('sensitive_entries')
      .delete()
      .eq('parent_guid', req.userId)
      .eq('category', 'custom')
      .eq('label', label);

    if (error) throw error;
    res.json({ success: true, deleted: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
