'use client';

import { useState, useMemo } from 'react';
import { Search, Plus, Send as SendIcon } from 'lucide-react';

export interface ConversationItem {
  id: string;
  contact_phone: string;
  contact_name: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  is_opted_out: boolean;
}

interface ConversationListProps {
  conversations: ConversationItem[];
  selectedConversationId: string | null;
  onSelectConversation: (id: string, phone: string) => void;
  onNewMessage: () => void;
  onBulkMessage: () => void;
  loading?: boolean;
}

export default function ConversationList({
  conversations,
  selectedConversationId,
  onSelectConversation,
  onNewMessage,
  onBulkMessage,
  loading = false,
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredConversations = useMemo(() => {
    if (!searchQuery) return conversations;

    const query = searchQuery.toLowerCase();
    return conversations.filter(
      conv =>
        conv.contact_name.toLowerCase().includes(query) ||
        conv.contact_phone.includes(query)
    );
  }, [conversations, searchQuery]);

  const formatTime = (dateString: string | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const truncateMessage = (message: string | null, maxLength: number = 40) => {
    if (!message) return '';
    return message.length > maxLength
      ? message.substring(0, maxLength) + '...'
      : message;
  };

  return (
    <div className="flex flex-col h-full bg-white border-r">
      {/* Header */}
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Messages</h2>

        {/* Action Buttons */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={onNewMessage}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            New
          </button>
          <button
            onClick={onBulkMessage}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
          >
            <SendIcon className="w-4 h-4" />
            Bulk
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or phone..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            {searchQuery ? (
              <p className="text-sm">No conversations match your search</p>
            ) : (
              <>
                <p className="text-sm font-medium">No conversations yet</p>
                <p className="text-xs mt-1">Start a new message to begin</p>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y">
            {filteredConversations.map(conversation => (
              <button
                key={conversation.id}
                onClick={() =>
                  onSelectConversation(
                    conversation.id,
                    conversation.contact_phone
                  )
                }
                className={`w-full p-3 text-left hover:bg-gray-50 transition-colors ${
                  selectedConversationId === conversation.id
                    ? 'bg-blue-50 border-l-4 border-l-blue-600'
                    : ''
                }`}
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700">
                      {conversation.contact_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {conversation.contact_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {conversation.contact_phone}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">
                      {formatTime(conversation.last_message_at)}
                    </p>
                    {conversation.unread_count > 0 && (
                      <span className="inline-block mt-1 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full font-semibold">
                        {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-xs text-gray-600 truncate">
                  {truncateMessage(conversation.last_message)}
                </p>

                {conversation.is_opted_out && (
                  <p className="text-xs text-red-600 font-medium mt-1">
                    Opted out
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
