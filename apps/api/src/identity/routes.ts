import { Router } from 'express';
import { generateKeyPairSync } from 'crypto';
import { supabase } from '../shared/supabase';
import { ensureDocumentSlots } from '../documents/seed-slots';

const router = Router();

// POST /onboard - Generate RSA keys and seed sensitive entries
// This is called during the final step of parent onboarding
router.post('/onboard', async (req: any, res) => {
  // Prefer the authenticated user's internal id (consistent with the rest of the
  // schema); fall back to a body value only if somehow unauthenticated.
  const parentGuid = (req.isAuthenticated?.() && req.user?.userId) || req.body?.parentGuid;

  if (!parentGuid) {
    return res.status(400).json({ error: 'Missing parentGuid' });
  }

  try {
    // 1. Generate RSA Key Pair
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    // 2. Store Private Key in Supabase Vault
    // Note: service_role key is already used in shared/supabase.ts
    const { data: vaultData, error: vaultError } = await supabase.rpc(
      'vault_store',
      {
        secret: privateKey,
        name: `parent_private_key_${parentGuid}`,
        description: `RSA private key for parent ${parentGuid}`
      }
    );

    let vaultKeyId = '';

    if (vaultError) {
      console.error('Vault RPC failed, trying direct insert:', vaultError);
      // Fallback: Try direct insert into vault.secrets
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('vault.secrets')
        .insert({
          secret: privateKey,
          name: `parent_private_key_${parentGuid}`
        })
        .select('id')
        .single();

      if (fallbackError) {
        throw new Error(`Failed to store private key in Vault: ${fallbackError.message}`);
      }
      vaultKeyId = (fallbackData as any).id;
    } else {
      // vault_store returns the id directly or as an object depending on schema
      vaultKeyId = typeof vaultData === 'string' ? vaultData : (vaultData as any).id;
    }

    // 3. Store Public Key & Vault Key ID in parent_keys
    const { error: keyError } = await supabase
      .from('parent_keys')
      .insert({
        parent_guid: parentGuid,
        public_key: publicKey,
        vault_key_id: vaultKeyId
      });

    if (keyError) {
      throw new Error(`Failed to store public key: ${keyError.message}`);
    }

    // 4. Create seed sensitive_entries
    const seedEntries = [
      {
        parent_guid: parentGuid,
        category: 'email',
        label: 'Email Account',
        is_required: true,
        sort_order: 1
      },
      {
        parent_guid: parentGuid,
        category: 'phone',
        label: 'Phone Unlock',
        is_required: true,
        sort_order: 2
      }
    ];

    const { error: seedError } = await supabase
      .from('sensitive_entries')
      .insert(seedEntries);

    if (seedError) {
      console.warn('Failed to create seed entries (continuing anyway):', seedError);
    }

    // 5. Create seed document_slots — single source of truth is
    //    apps/api/src/documents/seed-slots.ts, also used as a self-healing
    //    seed by GET /documents for parents who pre-date onboarding.
    await ensureDocumentSlots(parentGuid, supabase);

    // 6. Success
    console.log(`Successfully generated and stored RSA keys for parent: ${parentGuid}`);
    res.json({ success: true, vaultKeyId });


  } catch (error: any) {
    console.error('Account onboarding/key generation error:', error);
    res.status(500).json({ error: error.message || 'Internal server error during key generation' });
  }
});

export default router;
