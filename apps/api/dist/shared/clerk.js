"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clerk = void 0;
const clerk_sdk_node_1 = require("@clerk/clerk-sdk-node");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.clerk = (0, clerk_sdk_node_1.createClerkClient)({
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
});
