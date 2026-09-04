import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  // Deliberately loud rather than a silent undefined client — a payment
  // feature failing quietly is worse than the app refusing to start.
  console.warn("STRIPE_SECRET_KEY is not set — payment checkout will fail until it is.");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-06-20",
});
