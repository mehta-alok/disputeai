/**
 * DisputeAI - AI Help Chat Box
 * LLM-powered customer support chat that can escalate to Contact Us
 */

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageCircle,
  X,
  Send,
  Bot,
  User,
  ArrowRight,
  Phone,
  Loader2,
  Sparkles,
  Minimize2
} from 'lucide-react';

const AI_RESPONSES = {
  greeting: {
    patterns: ['hello', 'hi', 'hey', 'help', 'start'],
    response: "Hello! I'm DisputeAI AI Assistant. I can help you with:\n\n- Chargeback case questions\n- Evidence collection from AutoClerk PMS\n- Understanding dispute reason codes\n- Platform navigation and features\n\nWhat would you like help with?"
  },
  chargeback: {
    patterns: ['chargeback', 'dispute', 'charge', 'refund', 'fraud'],
    response: "Chargebacks can be challenged with proper evidence. Here's what I recommend:\n\n1. Go to **Reservations** and search for the guest\n2. Click **Fetch Evidence from AutoClerk** to collect all 7 document types\n3. Attach the evidence to the case\n4. Our AI will analyze and score the case\n\nCases with folio + ID scan + signature have an **87% win rate**. Would you like me to explain any evidence type?"
  },
  evidence: {
    patterns: ['evidence', 'folio', 'document', 'proof', 'collect'],
    response: "DisputeAI collects 7 types of evidence from AutoClerk PMS:\n\n- **Guest Folio** - Itemized charges and payments\n- **Registration Card** - Signed at check-in\n- **Guest Signature** - Digital ink capture\n- **ID Scan** - Government photo ID\n- **Payment Receipt** - Auth codes and capture details\n- **Reservation Confirmation** - Booking terms accepted\n- **Audit Trail** - Complete activity log\n\nGo to **Reservations** > search guest > **Fetch Evidence** to collect them all at once."
  },
  reasoncode: {
    patterns: ['reason code', 'code 10', 'code 13', 'authorization', 'not recognized', 'not received'],
    response: "Common chargeback reason codes for hotels:\n\n- **10.4** - Card not present (CNP) fraud\n- **13.1** - Merchandise/services not received\n- **13.2** - Cancelled recurring transaction\n- **13.3** - Not as described\n- **10.1** - EMV counterfeit fraud\n\nEach code requires different evidence. Our AI automatically selects the most relevant documents for each reason code. Want to know about a specific code?"
  },
  autoclerk: {
    patterns: ['autoclerk', 'pms', 'property management', 'reservation', 'booking'],
    response: "DisputeAI is connected to your **AutoClerk PMS** in real-time:\n\n- Status: Connected\n- Property: DisputeAI Demo Hotel\n- 12 reservations synced\n- 7 evidence types available\n\nTo search reservations, go to the **Reservations** page and use the search bar. You can search by guest name, confirmation number, email, room number, or card last 4 digits."
  },
  analytics: {
    patterns: ['analytics', 'win rate', 'performance', 'stats', 'metrics', 'report'],
    response: "Your current performance metrics:\n\n- **Win Rate**: 78% (industry avg: 45%)\n- **Cases**: 24 total\n- **Recovered**: $36,855\n- **Urgent**: 3 cases need attention\n\nVisit the **Analytics** page for detailed breakdowns by status, monthly trends, and evidence effectiveness reports."
  },
  contact: {
    patterns: ['contact', 'human', 'agent', 'speak', 'call', 'email', 'support', 'person'],
    response: "I'd be happy to connect you with our team!\n\nYou can reach us through:\n- **Email**: support@disputeai.com\n- **Phone**: 1-888-ACCU-DEF (1-888-222-8333)\n- **Live Chat**: Mon-Fri 9AM-6PM EST\n\nOr visit our **Contact Us** page for more options. Would you like me to take you there?"
  },
  settings: {
    patterns: ['settings', 'configure', 'setup', 'threshold', 'auto'],
    response: "You can configure DisputeAI in **Settings**:\n\n- **Auto-Submit Threshold**: Set minimum AI confidence (currently 75%)\n- **Required Evidence**: Choose which types must be present\n- **PMS Connection**: Manage AutoClerk integration\n- **Notifications**: Email and in-app alerts\n\nCases above the threshold are automatically submitted to processors."
  }
};

function getAIResponse(message) {
  const lower = message.toLowerCase();

  for (const [, config] of Object.entries(AI_RESPONSES)) {
    if (config.patterns.some(p => lower.includes(p))) {
      return config.response;
    }
  }

  return "I'm not sure about that specific question. Here are some things I can help with:\n\n- Chargeback defense strategies\n- Evidence collection from AutoClerk\n- Reason code explanations\n- Platform features and navigation\n- Analytics and performance metrics\n\nYou can also **contact our support team** for specialized assistance. Would you like me to connect you?";
}

export default function ChatHelp() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 0,
      role: 'assistant',
      content: "Hi! I'm your DisputeAI AI assistant. How can I help you today?",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage = {
      id: messages.length,
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    // Simulate AI processing delay
    setTimeout(() => {
      const response = getAIResponse(userMessage.content);
      const aiMessage = {
        id: messages.length + 1,
        role: 'assistant',
        content: response,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMessage]);
      setIsTyping(false);
    }, 800 + Math.random() * 700);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleContactUs = () => {
    setIsOpen(false);
    navigate('/contact');
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-50 p-4 bg-blue-600 text-white rounded-full shadow-xl hover:bg-blue-700 transition-all hover:scale-105 group"
        title="AI Help Assistant"
      >
        <MessageCircle className="w-6 h-6" />
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-white"></span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-50 w-[360px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden" style={{ height: '500px', maxHeight: 'calc(100vh - 8rem)' }}>
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-white/20 rounded-lg">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">DisputeAI AI</h3>
            <p className="text-blue-100 text-xs">Always here to help</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleContactUs}
            className="p-1.5 hover:bg-white/20 rounded-lg text-white/80 hover:text-white transition-colors"
            title="Contact Us"
          >
            <Phone className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 hover:bg-white/20 rounded-lg text-white/80 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] ${msg.role === 'user' ? 'order-2' : ''}`}>
              <div className="flex items-end gap-1.5">
                {msg.role === 'assistant' && (
                  <div className="p-1 bg-blue-100 rounded-full flex-shrink-0 mb-0.5">
                    <Bot className="w-3 h-3 text-blue-600" />
                  </div>
                )}
                <div className={`rounded-2xl px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-md'
                    : 'bg-gray-100 text-gray-800 rounded-bl-md'
                }`}>
                  {msg.content.split('\n').map((line, i) => (
                    <p key={i} className={`${i > 0 ? 'mt-1' : ''} ${line === '' ? 'h-2' : ''}`}>
                      {line.split('**').map((part, j) =>
                        j % 2 === 1 ? <strong key={j}>{part}</strong> : part
                      )}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex items-center gap-2">
            <div className="p-1 bg-blue-100 rounded-full">
              <Bot className="w-3 h-3 text-blue-600" />
            </div>
            <div className="bg-gray-100 rounded-2xl rounded-bl-md px-3 py-2">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      {messages.length <= 1 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5 flex-shrink-0">
          {['Chargeback help', 'Evidence types', 'Win rate tips', 'Contact support'].map((q) => (
            <button
              key={q}
              onClick={() => { setInput(q); }}
              className="px-2.5 py-1 text-xs bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything..."
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            disabled={isTyping}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <p className="text-[10px] text-gray-400">Powered by DisputeAI AI</p>
          <button
            onClick={handleContactUs}
            className="text-[10px] text-blue-500 hover:text-blue-600 flex items-center gap-0.5"
          >
            Need a human? Contact Us <ArrowRight className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
