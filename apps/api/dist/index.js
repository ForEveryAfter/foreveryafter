"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const routes_1 = __importDefault(require("./interview/routes"));
const routes_2 = __importDefault(require("./ai/routes"));
const storage_1 = require("./shared/storage");
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3001;
const storage = (0, storage_1.getStorageAdapter)();
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '50mb' }));
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});
app.get('/storage/*', async (req, res) => {
    const filePath = req.params[0];
    try {
        const buffer = await storage.get(filePath);
        const ext = path_1.default.extname(filePath).toLowerCase();
        const mimeMap = {
            '.wav': 'audio/wav',
            '.mp4': 'video/mp4',
            '.mp3': 'audio/mpeg',
            '.txt': 'text/plain'
        };
        res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
        res.send(buffer);
    }
    catch (error) {
        res.status(404).send('File not found');
    }
});
app.use('/interview', routes_1.default);
app.use('/ai', routes_2.default);
app.listen(port, () => {
    console.log(`API listening on port ${port}`);
});
