import type { AutomationRequest } from './types.js';

export function validateRequest(input: Partial<AutomationRequest>): AutomationRequest {
  if (!input.requestId) throw new Error('requestId is required');
  if (!input.contact?.name) throw new Error('contact.name is required');
  if (!input.contact?.phone) throw new Error('contact.phone is required');
  if (!input.intent) throw new Error('intent is required');
  return input as AutomationRequest;
}

export function evaluatePolicy(req: AutomationRequest): { allowed: boolean; reason?: string } {
  if (req.doNotContact) return { allowed: false, reason: 'CONTACT_IS_DNC' };
  if (req.consent !== 'granted') return { allowed: false, reason: 'CALL_CONSENT_NOT_GRANTED' };
  return { allowed: true };
}
