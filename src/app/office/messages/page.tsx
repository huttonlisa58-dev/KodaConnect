'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import ConversationList from '@/components/messaging/ConversationList';
import MessageThread from '@/components/messaging/MessageThread';
import ComposeBar from '@/components/messaging/ComposeBar';
import BulkMessageModal from '@/components/messaging/BulkMessageModal';
import NewMessageModal from '@/components/messaging/NewMessageModal';
import { AlertCircle, Menu, X } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function MessagesPage() {
  // State
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<any | null>(
    null
  );
  const [messages, setMessages] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('office_user_id') || '';
    }
    return '';
  });
  const [companyId] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('company_id') || '';
    }
    return '';
  });

  // Modal states
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Load conversations and templates on mount
  useEffect(() => {
    if (!userId || !companyId) {
      setError('User not authenticated');
      setLoading(false);
      return;
    }

    loadInitialData();

    // Poll for new messages every 10 seconds
    const pollInterval = setInterval(() => {
      loadConversations();
      if (selectedConversation) {
        loadMessages(selectedConversation.contact_phone);
      }
    }, 10000);

    return () => clearInterval(pollInterval);
  }, [userId, companyId]);

  const loadInitialData = async () => {
    setLoading(true);
    setError(null);

    try {
      await Promise.all([loadConversations(), loadTemplates()]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load data';
      setError(errorMsg);
      console.error('Error loading initial data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadConversations = async () => {
    try {
      const response = await fetch(
        `/api/messages?user_id=${userId}&company_id=${companyId}`
      );

      if (!response.ok) throw new Error('Failed to load conversations');

      const data = await response.json();
      setConversations(data.conversations || []);
    } catch (err) {
      console.error('Error loading conversations:', err);
    }
  };

  const loadMessages = async (contactPhone: string) => {
    setMessagesLoading(true);

    try {
      const response = await fetch(
        `/api/messages/${encodeURIComponent(
          contactPhone
        )}?company_id=${companyId}`
      );

      if (!response.ok) throw new Error('Failed to load messages');

      const data = await response.json();
      setMessages(data.messages || []);

      // Mark as read
      const conversation = conversations.find(
        c => c.contact_phone === contactPhone
      );
      if (conversation) {
        await fetch(`/api/messages/read/${conversation.id}`, {
          method: 'POST',
        });
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    } finally {
      setMessagesLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const response = await fetch(
        `/api/messages/templates?company_id=${companyId}`
      );

      if (!response.ok) throw new Error('Failed to load templates');

      const data = await response.json();
      setTemplates(data.templates || []);
    } catch (err) {
      console.error('Error loading templates:', err);
    }
  };

  const handleSelectConversation = (
    conversationId: string,
    contactPhone: string
  ) => {
    const conversation = conversations.find(c => c.id === conversationId);
    setSelectedConversation(conversation);
    loadMessages(contactPhone);
  };

  const handleSendMessage = async (body: string) => {
    if (!selectedConversation || !body.trim()) return;

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selectedConversation.contact_phone,
          body,
          from_user_id: userId,
          company_id: companyId,
        }),
      });

      if (!response.ok) throw new Error('Failed to send message');

      // Reload messages
      await loadMessages(selectedConversation.contact_phone);
      await loadConversations();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to send message';
      console.error('Error sending message:', err);
      alert(errorMsg);
    }
  };

  const handleSendBulk = async (
    recipients: string[],
    body: string,
    templateId?: string
  ) => {
    try {
      const response = await fetch('/api/messages/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients,
          body,
          from_user_id: userId,
          company_id: companyId,
          template_id: templateId,
        }),
      });

      if (!response.ok) throw new Error('Failed to send bulk messages');

      const data = await response.json();
      alert(`Successfully sent ${data.sent} messages`);

      if (data.errors.length > 0) {
        console.warn('Some messages failed:', data.errors);
      }

      setShowBulkModal(false);
      await loadConversations();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to send bulk messages';
      console.error('Error sending bulk messages:', err);
      alert(errorMsg);
    }
  };

  const handleNewMessage = async (phone: string) => {
    // Create new conversation
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phone,
          body: 'Hi! This is your first message.',
          from_user_id: userId,
          company_id: companyId,
        }),
      });

      if (!response.ok) throw new Error('Failed to create conversation');

      await loadConversations();
      setShowNewMessageModal(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create conversation';
      console.error('Error creating conversation:', err);
      alert(errorMsg);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading messages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Main layout */}
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Sidebar */}
        <div
          className={`${
            sidebarOpen ? 'w-full md:w-80' : 'hidden md:w-80'
          } bg-white border-r transition-all duration-200`}
        >
          <ConversationList
            conversations={conversations}
            selectedConversationId={selectedConversation?.id || null}
            onSelectConversation={handleSelectConversation}
            onNewMessage={() => setShowNewMessageModal(true)}
            onBulkMessage={() => setShowBulkModal(true)}
            loading={false}
          />
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col bg-white">
          {!selectedConversation ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-4xl">💬</span>
                </div>
                <p className="text-gray-600 font-medium text-lg">
                  Select a conversation to start
                </p>
                <p className="text-gray-500 text-sm mt-1">
                  or create a new message
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Message thread */}
              <div className="flex-1 overflow-hidden">
                <MessageThread
                  contactName={selectedConversation.contact_name}
                  contactPhone={selectedConversation.contact_phone}
                  isOptedOut={selectedConversation.is_opted_out}
                  messages={messages}
                  loading={messagesLoading}
                />
              </div>

              {/* Compose bar */}
              <ComposeBar
                isOptedOut={selectedConversation.is_opted_out}
                templates={templates}
                onSendMessage={handleSendMessage}
              />
            </>
          )}
        </div>
      </div>

      {/* Mobile toggle button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed bottom-6 right-6 md:hidden p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 z-40"
      >
        {sidebarOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <Menu className="w-6 h-6" />
        )}
      </button>

      {/* Modals */}
      <BulkMessageModal
        isOpen={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        onSendBulk={handleSendBulk}
        templates={templates}
      />

      <NewMessageModal
        isOpen={showNewMessageModal}
        onClose={() => setShowNewMessageModal(false)}
        onSendMessage={handleNewMessage}
      />
    </div>
  );
}
