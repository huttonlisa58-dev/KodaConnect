import { createServerSupabaseClient } from '@/lib/supabase';
import { sendSMS, normalizePhone } from '@/lib/twilio';
import { sanitizePostgrestInput } from '@/lib/supabase-utils';
import { v4 as uuidv4 } from 'uuid';

export type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'failed';

export interface Message {
  id: string;
  conversation_id: string;
  from_user_id: string;
  from_phone: string;
  to_phone: string;
  body: string;
  direction: 'outbound' | 'inbound';
  status: DeliveryStatus;
  twilio_sid: string | null;
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  company_id: string;
  contact_phone: string;
  contact_name: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  is_opted_out: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Send a text message via Twilio and log to database
 */
export async function sendTextMessage(
  to: string,
  body: string,
  fromUserId: string,
  companyId: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const supabase = createServerSupabaseClient();
  const normalizedPhone = normalizePhone(to);
  const messageId = uuidv4();
  const conversationId = uuidv4();

  try {
    // Send via Twilio
    const smsResult = await sendSMS(normalizedPhone, body);

    // Get user's phone number for from_phone
    const { data: userData } = await supabase
      .from('staff')
      .select('phone')
      .eq('id', fromUserId)
      .single();

    const fromPhone = userData?.phone || process.env.TWILIO_PHONE_NUMBER || '+1000000000';

    // Store message in database
    const { error: insertError } = await supabase.from('messages').insert({
      id: messageId,
      conversation_id: conversationId,
      from_user_id: fromUserId,
      from_phone: fromPhone,
      to_phone: normalizedPhone,
      body,
      direction: 'outbound',
      status: smsResult.success ? 'sent' : 'failed',
      twilio_sid: smsResult.sid || null,
      sent_at: new Date().toISOString(),
      company_id: companyId,
    });

    if (insertError) {
      console.error('Failed to store message:', insertError);
      return { success: false, error: 'Failed to store message' };
    }

    // Create or update conversation
    const { error: convError } = await supabase.from('conversations').upsert({
      contact_phone: normalizedPhone,
      user_id: fromUserId,
      company_id: companyId,
      last_message: body,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'contact_phone,company_id',
    });

    if (convError) {
      console.error('Failed to update conversation:', convError);
    }

    return { success: smsResult.success, messageId };
  } catch (error) {
    console.error('Error sending text message:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send message',
    };
  }
}

/**
 * Send message to multiple recipients with rate limiting
 */
export async function sendBulkMessages(
  recipients: string[],
  body: string,
  fromUserId: string,
  companyId: string,
  maxPerSecond: number = 1
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;
  let failed = 0;

  // Rate limit: max 1 message per second
  const delayMs = (1000 / maxPerSecond);

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];

    const result = await sendTextMessage(recipient, body, fromUserId, companyId);

    if (result.success) {
      sent++;
    } else {
      failed++;
      errors.push(`Failed to send to ${recipient}: ${result.error}`);
    }

    // Rate limit delay (except on last message)
    if (i < recipients.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return { sent, failed, errors };
}

/**
 * Process inbound SMS from Twilio webhook
 */
export async function processInboundMessage(
  from: string,
  body: string,
  twilioSid: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient();
  const normalizedPhone = normalizePhone(from);
  const messageId = uuidv4();

  try {
    // Check if STOP/unsubscribe
    const upperBody = body.toUpperCase();
    if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].includes(upperBody)) {
      // Add to opt-out list
      const { error: optOutError } = await supabase.from('sms_optouts').insert({
        phone: normalizedPhone,
        reason: 'User requested unsubscribe',
      });

      if (optOutError) {
        console.error('Failed to add to opt-out list:', optOutError);
      }

      // Mark conversation as opted out
      const { error: updateError } = await supabase
        .from('conversations')
        .update({ is_opted_out: true })
        .eq('contact_phone', normalizedPhone);

      if (updateError) {
        console.error('Failed to update conversation opt-out status:', updateError);
      }

      return { success: true };
    }

    // Find conversation
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id, company_id, user_id, unread_count')
      .eq('contact_phone', normalizedPhone)
      .maybeSingle();

    const conversationId = conversation?.id || uuidv4();
    const companyId = conversation?.company_id || 'unknown';

    // Store inbound message
    const { error: insertError } = await supabase.from('messages').insert({
      id: messageId,
      conversation_id: conversationId,
      from_user_id: null,
      from_phone: normalizedPhone,
      to_phone: process.env.TWILIO_PHONE_NUMBER || '+1000000000',
      body,
      direction: 'inbound',
      status: 'delivered',
      twilio_sid: twilioSid,
      sent_at: new Date().toISOString(),
      delivered_at: new Date().toISOString(),
      company_id: companyId,
    });

    if (insertError) {
      console.error('Failed to store inbound message:', insertError);
      return { success: false, error: 'Failed to store inbound message' };
    }

    // Update conversation
    const { error: updateError } = await supabase
      .from('conversations')
      .update({
        last_message: body,
        last_message_at: new Date().toISOString(),
        unread_count: conversation ? conversation.unread_count + 1 : 1,
        updated_at: new Date().toISOString(),
      })
      .eq('contact_phone', normalizedPhone);

    if (updateError) {
      console.error('Failed to update conversation:', updateError);
    }

    return { success: true };
  } catch (error) {
    console.error('Error processing inbound message:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process inbound message',
    };
  }
}

/**
 * Get all messages in a conversation with a specific contact
 */
export async function getConversation(
  userId: string,
  contactPhone: string,
  companyId: string
): Promise<Message[]> {
  const supabase = createServerSupabaseClient();
  const normalizedPhone = normalizePhone(contactPhone);

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('company_id', companyId)
    .or(`and(from_phone.eq.${sanitizePostgrestInput(normalizedPhone)},to_phone.eq.${process.env.TWILIO_PHONE_NUMBER}),and(from_phone.eq.${process.env.TWILIO_PHONE_NUMBER},to_phone.eq.${sanitizePostgrestInput(normalizedPhone)})`)
    .order('sent_at', { ascending: true });

  if (error) {
    console.error('Failed to get conversation:', error);
    return [];
  }

  return data || [];
}

/**
 * Get all conversations (inbox) for a user/company
 */
export async function getInbox(userId: string, companyId: string): Promise<Conversation[]> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false });

  if (error) {
    console.error('Failed to get inbox:', error);
    return [];
  }

  return data || [];
}

/**
 * Mark messages in a conversation as read
 */
export async function markAsRead(conversationId: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .is('read_at', null);

  if (error) {
    console.error('Failed to mark messages as read:', error);
    return false;
  }

  // Reset unread count on conversation
  const { error: convError } = await supabase
    .from('conversations')
    .update({ unread_count: 0 })
    .eq('id', conversationId);

  if (convError) {
    console.error('Failed to update conversation unread count:', convError);
  }

  return true;
}
