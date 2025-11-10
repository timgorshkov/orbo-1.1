'use client';

import { useEffect, useState } from 'react';
import { Loader2, MessageSquare, Check, X, DollarSign } from 'lucide-react';

interface AIRequest {
  id: string;
  user_id: string;
  user_email: string;
  org_id: string | null;
  org_name: string | null;
  request_type: 'create_app' | 'edit_app' | 'chat_message';
  user_message: string;
  ai_response: string;
  generated_config: any;
  was_applied: boolean;
  model: string;
  tokens_used: number;
  cost_usd: string;
  cost_rub: string;
  app_id: string | null;
  app_name: string | null;
  conversation_id: string | null;
  created_at: string;
}

interface Stats {
  totalCost: string;
  appliedCount: number;
  totalCount: number;
}

export default function AIRequestsPage() {
  const [requests, setRequests] = useState<AIRequest[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<AIRequest | null>(null);
  
  // Filters
  const [requestType, setRequestType] = useState<string>('');
  const [wasApplied, setWasApplied] = useState<string>('');

  useEffect(() => {
    fetchRequests();
  }, [requestType, wasApplied]);

  const fetchRequests = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (requestType) params.append('requestType', requestType);
      if (wasApplied) params.append('wasApplied', wasApplied);
      params.append('limit', '100');

      const response = await fetch(`/api/superadmin/ai-requests?${params}`);
      if (response.ok) {
        const data = await response.json();
        setRequests(data.requests || []);
        setStats(data.stats || null);
      }
    } catch (error) {
      console.error('Failed to fetch AI requests:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getRequestTypeBadge = (type: string) => {
    const badges = {
      create_app: { color: 'bg-green-100 text-green-800', label: 'Create App' },
      edit_app: { color: 'bg-blue-100 text-blue-800', label: 'Edit App' },
      chat_message: { color: 'bg-gray-100 text-gray-800', label: 'Chat' },
    };
    const badge = badges[type as keyof typeof badges] || badges.chat_message;
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${badge.color}`}>
        {badge.label}
      </span>
    );
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
          AI Requests Analytics
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Monitor all AI interactions, generated configs, and usage costs
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Requests</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalCount}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Apps Created</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.appliedCount}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Cost</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">${stats.totalCost}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Request Type
            </label>
            <select
              value={requestType}
              onChange={(e) => setRequestType(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">All</option>
              <option value="create_app">Create App</option>
              <option value="edit_app">Edit App</option>
              <option value="chat_message">Chat Message</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Status
            </label>
            <select
              value={wasApplied}
              onChange={(e) => setWasApplied(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">All</option>
              <option value="true">Applied (Created App)</option>
              <option value="false">Not Applied</option>
            </select>
          </div>
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400">No AI requests found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                    Message
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                    App
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                    Applied
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {requests.map((request) => (
                  <tr
                    key={request.id}
                    onClick={() => setSelectedRequest(request)}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                  >
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap">
                      {new Date(request.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                      {request.user_email}
                      {request.org_name && (
                        <div className="text-xs text-gray-500">
                          {request.org_name}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {getRequestTypeBadge(request.request_type)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                      {request.user_message}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                      {request.app_name || '-'}
                    </td>
                    <td className="px-4 py-3">
                      {request.was_applied ? (
                        <Check className="w-5 h-5 text-green-600" />
                      ) : (
                        <X className="w-5 h-5 text-gray-400" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap">
                      ${parseFloat(request.cost_usd).toFixed(4)}
                      <div className="text-xs text-gray-500">
                        {request.tokens_used.toLocaleString()} tokens
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                AI Request Details
              </h2>
            </div>

            <div className="p-6 space-y-6">
              {/* Meta Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">User</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {selectedRequest.user_email}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Organization</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {selectedRequest.org_name || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Model</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {selectedRequest.model}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Cost</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    ${parseFloat(selectedRequest.cost_usd).toFixed(4)} ({selectedRequest.tokens_used} tokens)
                  </p>
                </div>
              </div>

              {/* User Message */}
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  User Message:
                </p>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
                    {selectedRequest.user_message}
                  </p>
                </div>
              </div>

              {/* AI Response */}
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  AI Response:
                </p>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
                    {selectedRequest.ai_response}
                  </p>
                </div>
              </div>

              {/* Generated Config */}
              {selectedRequest.generated_config && (
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Generated Config:
                  </p>
                  <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                    <pre className="text-xs text-green-400">
                      {JSON.stringify(selectedRequest.generated_config, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end">
              <button
                onClick={() => setSelectedRequest(null)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

