/**
 * Fonction serveur Vercel — POST /api/contact.
 * Les secrets (RESEND_API_KEY…) sont lus côté serveur uniquement.
 */
import { handleContact } from "./_lib/contact-handler.js";

export function POST(request: Request): Promise<Response> {
  return handleContact(request, {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    CONTACT_TO: process.env.CONTACT_TO,
    CONTACT_FROM: process.env.CONTACT_FROM,
  });
}
