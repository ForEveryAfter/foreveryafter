"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const router = (0, express_1.Router)();
const anthropic = new sdk_1.default({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
});
// AI Chat Endpoint
router.post('/chat', async (req, res) => {
    const { messages, context } = req.body;
    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Invalid messages' });
    }
    try {
        const response = await anthropic.messages.create({
            model: 'claude-3-sonnet-20240229',
            max_tokens: 1024,
            system: `You are the LegacyBridge Assistant. Your goal is to help users navigate their legacy planning platform. 
      Context about the current user: ${JSON.stringify(context || {})}
      
      Guidelines:
      - Be warm, empathetic, and professional.
      - Focus on privacy, security, and the preservation of family stories.
      - If they ask about check-ins: Explain they are periodic verifications to ensure the parent is still active.
      - If they ask about activation: Explain it happens after a verified period of inactivity or manual trigger.
      - Keep responses concise but helpful.`,
            messages: messages.map((m) => ({
                role: m.role === 'system' ? 'assistant' : m.role,
                content: m.text,
            })),
        });
        const reply = response.content[0].type === 'text' ? response.content[0].text : 'Sorry, I encountered an error.';
        res.json({ reply });
    }
    catch (error) {
        console.error('AI Error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
