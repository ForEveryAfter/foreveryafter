import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-04-10' as any,
});

// A missing key never crashes boot (the SDK only fails on an API call); endpoints
// guard with this and return a clear error until STRIPE_SECRET_KEY is set.
export const isStripeConfigured = () => !!process.env.STRIPE_SECRET_KEY;

