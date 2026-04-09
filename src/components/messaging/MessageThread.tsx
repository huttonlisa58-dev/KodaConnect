'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCheck, Check, AlertCircle, Clock } from 'lucide-react';

export interface ThreadMessage {
  id: string;
  from_phone: string;
  to_phone: string;
  body: string;
  direction: 'inbound' | 'outbound';
  status: 'sending' | 'sent' | 'delivered' | 'failed';
  sent_at: string;
}

interface MessageThreadProps {
  contactName: string;
  contactPhone: string;
  isOptedOut: boolean;
  messages: ThreadMessage[];
  loading?: boolean;
}

export default function MessageThread({
  contactName,
  contactPhone,
  isOptedOut,
  messages,
  loading = false,
}: MessageThreadProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [lastMessageCount, setLastMessageCount] = useState(messages.length);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > (lastMessageCount || 0)) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
    setLastMessageCount(messages.length);
  }, [messages.length]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sending':
        return <Clock className="w-3 h-3 text-gray-400" />;
      case 'sent':
        return <Check className="w-3 h-3 text-gray-400" />;
      case 'delivered':
        return <CheckCheck className="w-3 h-3 text-blue-600" />;
      case 'failed':
        return <AlertCircle className="w-3 h-3 text-red-600" />;
      default:
        return null;
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const groupMessagesByDate = (msgs: ThreadMessage[]) => {
    const grouped: { [key: string]: ThreadMessage[] } = {};

    msgs.forEach(msg => {
      const date = new Date(msg.sent_at).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });

      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(msg);
    });

    return grouped;
  };

  const groupedMessages = groupMessagesByDate(messages);
  const dates = Object.keys(groupedMessages);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {contactName}
            </h2>
            <p className="text-sm text-gray-500">{contactPhone}</p>
          </div>
          {isOptedOut && (
            <div className="px-3 py-1 bg-red-100 rounded-full">
              <p className="text-xs font-medium text-red-700">Opted out</p>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">💬</span>
              </div>
              <p className="text-gray-600 font-medium">No messages yet</p>
              <p className="text-sm text-gray-500 mt-1">
                Start the conversation below
              </p>
            </div>
          </div>
        ) : (
          <>
            {dates.map(date => (
              <div key={date}>
                {/* Date separator */}
                <div className="flex items-center gap-3 my-6">
                  <div className="flex-1 h-px bg-gray-300"></div>
                  <p className="text-xs text-gray-500 px-2">{date}</p>
                  <div className="flex-1 h-px bg-gray-300"></div>
                </div>

                {/* Messages for this date */}
                <div className="space-y-3">
                  {groupedMessages[date].map(message => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.direction === 'outbound'
                          ? 'justify-end'
                          : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-xs px-4 py-2 rounded-lg ${
                          message.direction === 'outbound'
                            ? 'bg-blue-600 text-white rounded-br-none'
                            : 'bg-gray-200 text-gray-900 rounded-bl-none'
                        }`}
                      >
                        <p className="text-sm break-words">{message.body}</p>
                        <div
                          className={`flex items-center gap-1 mt-1 text-xs ${
                            message.direction === 'outbound'
                              ? 'text-blue-100'
                              : 'text-gray-600'
                          }`}
                        >
                          <span>{formatTime(message.sent_at)}</span>
                          {message.direction === 'outbound' && (
                            getStatusIcon(message.status)
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
