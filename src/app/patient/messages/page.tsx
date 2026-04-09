'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MessageSquare,
  Send,
  ArrowLeft,
  Users,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface Message {
  id: string;
  senderName: string;
  senderRole: string;
  senderId: string;
  recipientId: string;
  content: string;
  sentAt: string;
  read: boolean;
}

interface Conversation {
  id: string;
  participantName: string;
  participantRole: string;
  participantId: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
}

export default function PatientMessagesPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      setLoading(true);
      setError(null);

      const patientId = localStorage.getItem('patient_id');
      const token = localStorage.getItem('patient_token');

      if (!patientId || !token) {
        router.push('/patient/login');
        return;
      }

      // Mock conversations for now
      const mockConversations: Conversation[] = [
        {
          id: '1',
          participantName: 'Sarah Johnson',
          participantRole: 'Primary Caregiver',
          participantId: 'caregiver-1',
          lastMessage: 'Your appointment is confirmed for tomorrow at 2:00 PM',
          lastMessageAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          unreadCount: 0,
        },
        {
          id: '2',
          participantName: 'Dr. Michael Chen',
          participantRole: 'Healthcare Provider',
          participantId: 'provider-1',
          lastMessage: 'Your lab results are ready. Everything looks good!',
          lastMessageAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          unreadCount: 1,
        },
      ];

      setConversations(mockConversations);
      setSelectedConversation(mockConversations[0].id);
      loadMessages(mockConversations[0].id);
    } catch (err) {
      console.error('Load conversations error:', err);
      setError('Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      const patientId = localStorage.getItem('patient_id');
      const token = localStorage.getItem('patient_token');

      if (!patientId || !token) {
        router.push('/patient/login');
        return;
      }

      // Mock messages for now
      const mockMessages: Message[] = [
        {
          id: '1',
          senderName: 'Sarah Johnson',
          senderRole: 'Primary Caregiver',
          senderId: 'caregiver-1',
          recipientId: patientId,
          content: 'Hi! Just wanted to remind you about your appointment tomorrow.',
          sentAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
          read: true,
        },
        {
          id: '2',
          senderName: 'You',
          senderRole: 'Patient',
          senderId: patientId,
          recipientId: 'caregiver-1',
          content: 'Thanks for the reminder! I\'ll be ready.',
          sentAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
          read: true,
        },
        {
          id: '3',
          senderName: 'Sarah Johnson',
          senderRole: 'Primary Caregiver',
          senderId: 'caregiver-1',
          recipientId: patientId,
          content: 'Your appointment is confirmed for tomorrow at 2:00 PM',
          sentAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          read: true,
        },
      ];

      setMessages(mockMessages);
    } catch (err) {
      console.error('Load messages error:', err);
      setError('Failed to load messages');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!messageInput.trim() || !selectedConversation) return;

    setSending(true);
    setError(null);

    try {
      const patientId = localStorage.getItem('patient_id');
      const token = localStorage.getItem('patient_token');

      if (!patientId || !token) {
        router.push('/patient/login');
        return;
      }

      const conversation = conversations.find((c) => c.id === selectedConversation);
      if (!conversation) return;

      // Add message optimistically
      const newMessage: Message = {
        id: `msg-${Date.now()}`,
        senderName: 'You',
        senderRole: 'Patient',
        senderId: patientId,
        recipientId: conversation.participantId,
        content: messageInput,
        sentAt: new Date().toISOString(),
        read: true,
      };

      setMessages((prev) => [...prev, newMessage]);
      setMessageInput('');

      // TODO: Send to API
      // const response = await fetch('/api/patient/messages/send', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     Authorization: `Bearer ${token}`,
      //   },
      //   body: JSON.stringify({
      //     patientId,
      //     participantId: conversation.participantId,
      //     content: messageInput,
      //   }),
      // });

      // if (!response.ok) {
      //   throw new Error('Failed to send message');
      // }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      setMessageInput(messageInput); // Restore input on error
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
      </div>
    );
  }

  const currentConversation = conversations.find((c) => c.id === selectedConversation);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link
            href="/patient/dashboard"
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 transition font-semibold mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
          <p className="text-gray-600">Stay connected with your care team</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-200px)]">
          {/* Conversations List */}
          <div className="md:col-span-1 bg-white rounded-lg shadow overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Conversations
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No conversations yet</p>
                </div>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => {
                      setSelectedConversation(conv.id);
                      loadMessages(conv.id);
                    }}
                    className={`w-full text-left p-4 border-b border-gray-100 hover:bg-blue-50 transition ${
                      selectedConversation === conv.id ? 'bg-blue-50' : ''
                    }`}
                    aria-current={selectedConversation === conv.id ? 'page' : undefined}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{conv.participantName}</p>
                        <p className="text-xs text-gray-600">{conv.participantRole}</p>
                        {conv.lastMessage && (
                          <p className="text-sm text-gray-600 truncate mt-1">{conv.lastMessage}</p>
                        )}
                      </div>
                      {conv.unreadCount > 0 && (
                        <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Messages Area */}
          <div className="md:col-span-2 bg-white rounded-lg shadow overflow-hidden flex flex-col">
            {selectedConversation && currentConversation ? (
              <>
                {/* Conversation Header */}
                <div className="p-4 border-b border-gray-200 bg-gray-50">
                  <h3 className="font-bold text-gray-900">{currentConversation.participantName}</h3>
                  <p className="text-sm text-gray-600">{currentConversation.participantRole}</p>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {error && (
                    <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  )}

                  {messages.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>No messages yet. Start a conversation!</p>
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${
                          msg.senderId === localStorage.getItem('patient_id') ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <div
                          className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                            msg.senderId === localStorage.getItem('patient_id')
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-900'
                          }`}
                        >
                          <p className="text-sm">{msg.content}</p>
                          <p
                            className={`text-xs mt-1 ${
                              msg.senderId === localStorage.getItem('patient_id')
                                ? 'text-blue-100'
                                : 'text-gray-600'
                            }`}
                          >
                            {new Date(msg.sentAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Message Input */}
                <form
                  onSubmit={handleSendMessage}
                  className="p-4 border-t border-gray-200 bg-gray-50"
                >
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      placeholder="Type your message..."
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={sending}
                      aria-label="Message input"
                    />
                    <button
                      type="submit"
                      disabled={sending || !messageInput.trim()}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      aria-label="Send message"
                    >
                      {sending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Select a conversation to start messaging</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
