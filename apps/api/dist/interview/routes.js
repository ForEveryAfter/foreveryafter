"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../shared/supabase");
const storage_1 = require("../shared/storage");
const router = (0, express_1.Router)();
const storage = (0, storage_1.getStorageAdapter)();
// Middleware to get user ID from Clerk (Simplified for Pass 8)
// In a real app, we'd use clerk.verifyToken(token)
const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'No authorization header' });
    }
    const token = authHeader.split(' ')[1];
    try {
        // For Pass 8, we'll assume the client sends the userId in a header for simplicity
        // or we'd properly verify the JWT here. 
        // TODO: Implement proper JWT verification
        const userId = req.headers['x-user-id'];
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        req.user = { id: userId };
        next();
    }
    catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};
// GET Chapters
router.get('/chapters', authMiddleware, async (req, res) => {
    const { data, error } = await supabase_1.supabase
        .from('chapters')
        .select('*')
        .order('order', { ascending: true });
    if (error)
        return res.status(500).json({ error: error.message });
    res.json(data);
});
// GET Questions
router.get('/questions', authMiddleware, async (req, res) => {
    const { data, error } = await supabase_1.supabase
        .from('questions')
        .select('*')
        .order('order', { ascending: true });
    if (error)
        return res.status(500).json({ error: error.message });
    res.json(data);
});
// GET User Responses
router.get('/responses', authMiddleware, async (req, res) => {
    const { data, error } = await supabase_1.supabase
        .from('user_question_responses')
        .select('*')
        .eq('parent_guid', req.user.id);
    if (error)
        return res.status(500).json({ error: error.message });
    res.json(data);
});
// POST Save Response (Audio/Video)
router.post('/save', authMiddleware, async (req, res) => {
    const { questionId, slug, type, data, mimeType } = req.body; // data is base64 string for simplicity in Pass 8
    const userId = req.user.id;
    if (!data || !questionId || !slug || !type) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    const buffer = Buffer.from(data, 'base64');
    const ext = type === 'video' ? 'mp4' : 'wav';
    const filePath = `web/private/${userId}/mystory/${slug}.${ext}`;
    const transcriptPath = `web/private/${userId}/mystory/${slug}.txt`;
    try {
        // Save file via adapter
        await storage.save(filePath, buffer, mimeType);
        // Save transcript placeholder (empty file)
        await storage.save(transcriptPath, Buffer.from(''), 'text/plain');
        // Update DB
        const { data: response, error: dbError } = await supabase_1.supabase
            .from('user_question_responses')
            .upsert({
            parent_guid: userId,
            question_id: questionId,
            audio_path: type === 'audio' ? filePath : null,
            video_path: type === 'video' ? filePath : null,
            transcript_path: transcriptPath,
            recorded_at: new Date().toISOString(),
            audience: 'family', // Default as per out of scope instructions (TODO: implementation)
            audience_user_id: null
        }, { onConflict: 'parent_guid,question_id' })
            .select()
            .single();
        if (dbError)
            throw dbError;
        res.json(response);
    }
    catch (error) {
        console.error('Save error:', error);
        res.status(500).json({ error: error.message });
    }
});
// GET User Flags
router.get('/flags', authMiddleware, async (req, res) => {
    const { data, error } = await supabase_1.supabase
        .from('user_flags')
        .select('*')
        .eq('user_guid', req.user.id);
    if (error)
        return res.status(500).json({ error: error.message });
    res.json(data);
});
// POST Set Flag
router.post('/flags', authMiddleware, async (req, res) => {
    const { flag } = req.body;
    const userId = req.user.id;
    const { data, error } = await supabase_1.supabase
        .from('user_flags')
        .upsert({ user_guid: userId, flag }, { onConflict: 'user_guid,flag' })
        .select()
        .single();
    if (error)
        return res.status(500).json({ error: error.message });
    res.json(data);
});
exports.default = router;
