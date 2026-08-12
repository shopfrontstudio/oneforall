import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { ok, fail, forbidden, unauthorized, serverError } from '../../shared/http.js';
import { cleanText, currentUser, displayName } from '../../shared/guards.js';

// Posts a message into a conversation.
//
// This is the fix for message forgery: participation is checked against the
// conversation record, and sender_id / sender_name / customer_id / tradie_id are
// all derived here. RLS alone could not do this — it gates who may write, never
// what the written row contains.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return unauthorized();

    const { conversation_id, body } = await req.json();
    if (!conversation_id) return fail('A conversation is required.');

    const text = cleanText(body, 4000);
    if (!text) return fail('Write a message first.');

    const conversation = await base44.asServiceRole.entities.Conversation.get(conversation_id);
    if (!conversation) return fail('That conversation no longer exists.', 404);

    const isParticipant = conversation.customer_id === user.id || conversation.tradie_id === user.id;
    if (!isParticipant) return forbidden('You are not part of this conversation.');

    const message = await base44.asServiceRole.entities.Message.create({
      conversation_id: conversation.id,
      customer_id: conversation.customer_id,
      tradie_id: conversation.tradie_id,
      sender_id: user.id,
      sender_name: displayName(user),
      body: text,
    });

    return ok({ message });
  } catch (error) {
    return serverError(error);
  }
}
