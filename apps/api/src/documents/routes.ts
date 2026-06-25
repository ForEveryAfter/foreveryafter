import { Router } from 'express';
import { supabase } from '../shared/supabase';
import { getStorageAdapter } from '../shared/storage';
import { hybridEncrypt, getParentPublicKey } from '../utils/encryption';
import { documentUpload as upload, audioUpload, uploadRateLimiter, validateTextLength } from '../shared/upload-limits';
import { ensureDocumentSlots } from './seed-slots';

const router = Router();
const storage = getStorageAdapter();

// Middleware to verify session
const documentsAuthMiddleware = async (req: any, res: any, next: any) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: No user ID provided' });
  }

  // Pass 11 Refinement: Parent doesn't need 2FA to enter their own "Will & Documents"
  // because it's a write-only/metadata-only view. 2FA is for TI access (future).
  
  req.userId = userId;
  next();
};

// GET / - List all document slots with learn videos
router.get('/', documentsAuthMiddleware, async (req: any, res) => {
  try {
    // Self-heal: parents created before /identity/onboard was wired (or who
    // skipped that step) end up with NO document_slots rows, which renders an
    // empty wills page. ensureDocumentSlots inserts the canonical 14 seeds for
    // them on first visit; idempotent on subsequent calls.
    await ensureDocumentSlots(req.userId, supabase);

    const { data: slots, error: slotsError } = await supabase
      .from('document_slots')
      .select('id, document_type, label, upload_tier, is_required, sort_order, storage_method, file_name, encrypted_file_path, encrypted_location')
      .eq('parent_guid', req.userId)
      .order('sort_order', { ascending: true });

    if (slotsError) throw slotsError;

    // Fetch learn videos for active slots
    const { data: videos, error: videosError } = await supabase
      .from('learn_videos')
      .select('title, description, video_path, duration_seconds, document_type')
      .eq('is_active', true);
      
    if (videosError) throw videosError;

    const response = slots.map(slot => {
      const learnVideo = videos.find(v => v.document_type === slot.document_type);
      return {
        id: slot.id,
        document_type: slot.document_type,
        label: slot.label,
        upload_tier: slot.upload_tier,
        is_required: slot.is_required,
        sort_order: slot.sort_order,
        storage_method: slot.storage_method,
        file_name: slot.file_name,
        has_upload: !!slot.encrypted_file_path,
        has_location: !!slot.encrypted_location,
        learn_video: learnVideo ? {
          title: learnVideo.title,
          description: learnVideo.description,
          video_path: learnVideo.video_path,
          duration_seconds: learnVideo.duration_seconds
        } : null
      };
    });

    res.json(response);
  } catch (err: any) {
    console.error('Fetch documents error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /upload - Handle file upload and hybrid encryption
router.post('/upload', documentsAuthMiddleware, uploadRateLimiter, upload.single('file'), async (req: any, res) => {
  const { document_slot_id } = req.body;
  const file = req.file;

  if (!document_slot_id || !file) {
    return res.status(400).json({ error: 'Missing document_slot_id or file' });
  }

  try {
    // 1. Verify the slot belongs to the user
    const { data: slot, error: slotError } = await supabase
      .from('document_slots')
      .select('id, document_type, encrypted_file_path')
      .eq('id', document_slot_id)
      .eq('parent_guid', req.userId)
      .single();

    if (slotError || !slot) {
      return res.status(404).json({ error: 'Document slot not found' });
    }

    // 2. Fetch parent's RSA public key
    const publicKeyPem = await getParentPublicKey(req.userId, supabase);

    // 3. Hybrid Encrypt the file buffer
    const { encryptedData, encryptedAesKey } = hybridEncrypt(file.buffer, publicKeyPem);

    // 4. Save encrypted file to storage
    const storagePath = `web/private/${req.userId}/documents/${slot.document_type}/${document_slot_id}.enc`;
    const encryptedBuffer = Buffer.from(encryptedData, 'base64');
    await storage.save(storagePath, encryptedBuffer, 'application/octet-stream');

    // Clean up old file if replacing
    if (slot.encrypted_file_path && slot.encrypted_file_path !== storagePath) {
      await storage.delete(slot.encrypted_file_path).catch(e => console.warn('Failed to delete old file:', e));
    }

    // 5. Update document_slots table
    const { error: updateError } = await supabase
      .from('document_slots')
      .update({
        encrypted_file_path: storagePath,
        encrypted_aes_key: encryptedAesKey,
        storage_method: 'upload',
        file_name: file.originalname,
        encrypted_location: null,
        encrypted_location_key: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', document_slot_id)
      .eq('parent_guid', req.userId);

    if (updateError) throw updateError;

    res.json({ success: true });
  } catch (err: any) {
    console.error('Document upload error:', err);
    res.status(500).json({ error: err.message });
  }
});
// POST /audio - Handle audio recording for special instructions
router.post('/audio', documentsAuthMiddleware, uploadRateLimiter, audioUpload.single('audio'), async (req: any, res) => {
  const { document_slot_id } = req.body;
  const file = req.file;

  if (!document_slot_id || !file) {
    return res.status(400).json({ error: 'Missing document_slot_id or audio file' });
  }

  try {
    // 1. Verify the slot belongs to the user
    const { data: slot, error: slotError } = await supabase
      .from('document_slots')
      .select('id, document_type, encrypted_file_path')
      .eq('id', document_slot_id)
      .eq('parent_guid', req.userId)
      .single();

    if (slotError || !slot) {
      return res.status(404).json({ error: 'Document slot not found' });
    }

    // TODO: Send audio buffer to transcription service here before encrypting it!

    // 2. Fetch parent's RSA public key
    const publicKeyPem = await getParentPublicKey(req.userId, supabase);

    // 3. Hybrid Encrypt the audio buffer
    const { encryptedData, encryptedAesKey } = hybridEncrypt(file.buffer, publicKeyPem);

    // 4. Save encrypted audio to storage
    const storagePath = `web/private/${req.userId}/documents/${slot.document_type}/${document_slot_id}_audio.enc`;
    const encryptedBuffer = Buffer.from(encryptedData, 'base64');
    await storage.save(storagePath, encryptedBuffer, 'application/octet-stream');

    // Clean up old file if replacing
    if (slot.encrypted_file_path && slot.encrypted_file_path !== storagePath) {
      await storage.delete(slot.encrypted_file_path).catch(e => console.warn('Failed to delete old file:', e));
    }

    // 5. Update document_slots table
    const { error: updateError } = await supabase
      .from('document_slots')
      .update({
        encrypted_file_path: storagePath,
        encrypted_aes_key: encryptedAesKey,
        storage_method: 'audio',
        file_name: 'Special Instructions (Audio)',
        encrypted_location: null,
        encrypted_location_key: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', document_slot_id)
      .eq('parent_guid', req.userId);

    if (updateError) throw updateError;

    res.json({ success: true });
  } catch (err: any) {
    console.error('Document audio error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /location - Handle location note and hybrid encryption
router.post('/location', documentsAuthMiddleware, validateTextLength('location_text'), async (req: any, res) => {
  const { document_slot_id, location_text } = req.body;

  if (!document_slot_id || !location_text) {
    return res.status(400).json({ error: 'Missing document_slot_id or location_text' });
  }

  try {
    // 1. Verify the slot belongs to the user
    const { data: slot, error: slotError } = await supabase
      .from('document_slots')
      .select('id, encrypted_file_path')
      .eq('id', document_slot_id)
      .eq('parent_guid', req.userId)
      .single();

    if (slotError || !slot) {
      return res.status(404).json({ error: 'Document slot not found' });
    }

    // 2. Fetch parent's RSA public key
    const publicKeyPem = await getParentPublicKey(req.userId, supabase);

    // 3. Hybrid Encrypt the location text
    const { encryptedData, encryptedAesKey } = hybridEncrypt(
      Buffer.from(location_text, 'utf8'),
      publicKeyPem
    );

    // If there was an uploaded file, clean it up from storage
    if (slot.encrypted_file_path) {
      await storage.delete(slot.encrypted_file_path).catch(e => console.warn('Failed to delete old file:', e));
    }

    // 4. Update document_slots table
    const { error: updateError } = await supabase
      .from('document_slots')
      .update({
        encrypted_location: encryptedData,
        encrypted_location_key: encryptedAesKey,
        storage_method: 'location',
        encrypted_file_path: null,
        encrypted_aes_key: null,
        file_name: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', document_slot_id)
      .eq('parent_guid', req.userId);

    if (updateError) throw updateError;

    res.json({ success: true });
  } catch (err: any) {
    console.error('Location save error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id/content - Clear encrypted content from slot
router.delete('/:id/content', documentsAuthMiddleware, async (req: any, res) => {
  const { id } = req.params;

  try {
    const { data: slot, error: slotError } = await supabase
      .from('document_slots')
      .select('id, is_required, encrypted_file_path')
      .eq('id', id)
      .eq('parent_guid', req.userId)
      .single();

    if (slotError || !slot) {
      return res.status(404).json({ error: 'Document slot not found' });
    }

    // Note: We DO allow clearing content for required slots (e.g. Will).
    // The instructions say "Required slots: can clear content, cannot delete the row"
    // So if someone replaces a file, they might clear it first or overwrite it.
    // Actually the instructions say: 
    // "For is_required = true slots (Will): No Remove button. Ever. Returns to NOT STARTED state only via Replace."
    // If the frontend does not show a remove button, this endpoint might not be called for required slots,
    // but the backend API spec says "Checks is_required before clearing upload. Required slots: can clear content, cannot delete the row"

    if (slot.encrypted_file_path) {
      await storage.delete(slot.encrypted_file_path).catch(e => console.warn('Failed to delete file:', e));
    }

    const { error: updateError } = await supabase
      .from('document_slots')
      .update({
        encrypted_file_path: null,
        encrypted_aes_key: null,
        encrypted_location: null,
        encrypted_location_key: null,
        storage_method: null,
        file_name: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('parent_guid', req.userId);

    if (updateError) throw updateError;

    res.json({ success: true });
  } catch (err: any) {
    console.error('Clear content error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /custom - Add a custom document slot
router.post('/custom', documentsAuthMiddleware, async (req: any, res) => {
  const { label, upload_tier } = req.body;

  if (!label || !upload_tier) {
    return res.status(400).json({ error: 'Missing label or upload_tier' });
  }

  try {
    const { data, error } = await supabase
      .from('document_slots')
      .insert({
        parent_guid: req.userId,
        document_type: 'custom',
        label,
        upload_tier,
        is_required: false,
        sort_order: 999
      })
      .select('id')
      .single();

    if (error) throw error;
    res.json({ success: true, id: data.id });
  } catch (err: any) {
    console.error('Create custom document error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /custom/:id - Delete custom document row
router.delete('/custom/:id', documentsAuthMiddleware, async (req: any, res) => {
  const { id } = req.params;

  try {
    const { data: slot, error: slotError } = await supabase
      .from('document_slots')
      .select('id, document_type, encrypted_file_path')
      .eq('id', id)
      .eq('parent_guid', req.userId)
      .single();

    if (slotError || !slot) {
      return res.status(404).json({ error: 'Document slot not found' });
    }

    if (slot.document_type !== 'custom') {
      return res.status(400).json({ error: 'Cannot delete non-custom document rows' });
    }

    if (slot.encrypted_file_path) {
      await storage.delete(slot.encrypted_file_path).catch(e => console.warn('Failed to delete file:', e));
    }

    const { error: deleteError } = await supabase
      .from('document_slots')
      .delete()
      .eq('id', id)
      .eq('parent_guid', req.userId);

    if (deleteError) throw deleteError;

    res.json({ success: true });
  } catch (err: any) {
    console.error('Delete custom document error:', err);
    res.status(500).json({ error: err.message });
  }
});

// TODO: TI Decrypt Pass — Documents
// Route: GET /api/documents/decrypt/:id 
//        (TI role only, post-release)
//
// 1. Verify TI authenticated + 2FA verified
// 2. Verify release trigger fired for parent
// 3. Fetch vault_key_id from parent_keys
// 4. Retrieve RSA private key from Vault:
//    SELECT decrypted_secret 
//    FROM vault.decrypted_secrets
//    WHERE id = vault_key_id
// 5. For uploaded files:
//    a. Fetch encrypted file from storage
//    b. Call hybridDecrypt(
//         encryptedData,
//         encryptedAesKey,  
//         privateKeyPem
//       )
//    c. Return decrypted file buffer to TI
// 6. For location notes:
//    a. Call hybridDecrypt(
//         encrypted_location,
//         encrypted_location_key,
//         privateKeyPem
//       )
//    b. Return plaintext location string
// 7. Private key never leaves apps/api
// 8. Zero out AES key from memory after use
//
// Same private key decrypts ALL encrypted 
// content across all sections for this parent.

export default router;
