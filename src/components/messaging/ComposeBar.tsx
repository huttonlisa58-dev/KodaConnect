'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, ChevronDown } from 'lucide-react';

interface Template {
  id: string;
  name: string;
  body: string;
}

interface ComposeBarProps {
  isOptedOut: boolean;
  templates: Template[];
  onSendMessage: (message: string) => Promise<void>;
  loading?: boolean;
}

export default function ComposeBar({
  isOptedOut,
  templates,
  onSendMessage,
  loading = false,
}: ComposeBarProps) {
  const [message, setMessage] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea
  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(
        textareaRef.current.scrollHeight,
        120
      ) + 'px';
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [message]);

  const handleSendMessage = async () => {
    if (!message.trim() || isOptedOut) return;

    setIsSending(true);
    try {
      await onSendMessage(message.trim());
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter, unless Shift is pressed
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const insertTemplate = (templateBody: string) => {
    setMessage(templateBody);
    setShowTemplates(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  if (isOptedOut) {
    return (
      <div className="px-6 py-4 border-t border-gray-200 bg-red-50">
        <p className="text-sm text-red-700 font-medium">
          This contact has opted out of messages. You cannot send messages to this number.
        </p>
      </div>
    );
  }

  return (
    <div className="px-6 py-4 border-t border-gray-200 bg-white">
      {/* Character count */}
      <div className="flex justify-between items-end mb-2">
        <div className="text-xs text-gray-500">
          {message.length > 0 && (
            <span>
              {message.length} / 1600 characters
              {message.length > 1600 && (
                <span className="text-red-600 font-medium ml-1">
                  (exceeds limit)
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Input area */}
      <div className="flex gap-2 items-end">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message... (Shift+Enter for new line)"
            maxLength={1600}
            disabled={loading || isSending}
            rows={1}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500 resize-none"
            style={{ maxHeight: '120px', minHeight: '40px' }}
          />

          {/* Template dropdown */}
          {templates.length > 0 && (
            <div className="absolute bottom-2 right-2">
              <div className="relative">
                <button
                  onClick={() => setShowTemplates(!showTemplates)}
                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                  title="Insert template"
                >
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>

                {/* Dropdown menu */}
                {showTemplates && (
                  <div className="absolute bottom-full right-0 mb-1 w-48 bg-white border border-gray-300 rounded-lg shadow-lg z-10">
                    <div className="p-2 max-h-48 overflow-y-auto">
                      {templates.map(template => (
                        <button
                          key={template.id}
                          onClick={() => insertTemplate(template.body)}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 rounded transition-colors truncate"
                          title={template.body}
                        >
                          {template.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Send button */}
        <button
          onClick={handleSendMessage}
          disabled={
            !message.trim() ||
            message.length > 1600 ||
            loading ||
            isSending
          }
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2 font-medium"
        >
          {isSending ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              Sending...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Send
            </>
          )}
        </button>
      </div>

      {/* Instructions */}
      <p className="text-xs text-gray-500 mt-2">
        Shift+Enter for new line
      </p>
    </div>
  );
}
