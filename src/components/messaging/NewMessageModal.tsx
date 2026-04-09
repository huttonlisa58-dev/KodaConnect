'use client';

import { useState } from 'react';
import { X, Search } from 'lucide-react';
import { normalizePhone } from '@/lib/phone-utils';

interface NewMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendMessage: (phone: string) => Promise<void>;
}

export default function NewMessageModal({
  isOpen,
  onClose,
  onSendMessage,
}: NewMessageModalProps) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/caregivers/search?q=${encodeURIComponent(query)}`
      );

      if (!response.ok) throw new Error('Search failed');

      const data = await response.json();
      setSearchResults(data.results || []);
    } catch (err) {
      console.error('Search error:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to search caregivers'
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectRecipient = async (
    recipientPhone: string,
    recipientName: string
  ) => {
    setIsSending(true);
    setError(null);

    try {
      await onSendMessage(recipientPhone);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleSendDirect = async () => {
    if (!phone.trim()) {
      setError('Please enter a phone number');
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      normalizePhone(phone);
      await onSendMessage(phone);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    setPhone('');
    setName('');
    setSearchResults([]);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            New Message
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Search for recipient */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Caregiver or Enter Phone
            </label>

            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, email, or phone..."
                value={name || phone}
                onChange={e => {
                  const value = e.target.value;
                  setName(value);
                  setPhone(value);
                  if (value.trim()) {
                    handleSearch(value);
                  }
                }}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Search results */}
            {searchResults.length > 0 && (
              <div className="mb-4 border border-gray-300 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                {searchResults.map(caregiver => (
                  <button
                    key={caregiver.id}
                    onClick={() =>
                      handleSelectRecipient(caregiver.phone, caregiver.full_name)
                    }
                    disabled={isSending}
                    className="w-full p-3 text-left hover:bg-blue-50 transition-colors disabled:opacity-50 border-b last:border-b-0"
                  >
                    <p className="font-medium text-gray-900">
                      {caregiver.full_name}
                    </p>
                    <p className="text-sm text-gray-500">{caregiver.phone}</p>
                    {caregiver.email && (
                      <p className="text-xs text-gray-400">{caregiver.email}</p>
                    )}
                  </button>
                ))}
              </div>
            )}

            {isSearching && (
              <div className="mb-4 flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              </div>
            )}

            {/* Or section */}
            {searchResults.length === 0 && !isSearching && (
              <>
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">or</span>
                  </div>
                </div>

                {/* Direct phone input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Enter Phone Number Directly
                  </label>
                  <input
                    type="tel"
                    placeholder="(555) 123-4567 or +1-555-123-4567"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    US phone numbers in any format accepted
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 flex gap-2 justify-end">
          <button
            onClick={handleClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSendDirect}
            disabled={!phone.trim() || isSending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isSending ? 'Sending...' : 'Start Message'}
          </button>
        </div>
      </div>
    </div>
  );
}
