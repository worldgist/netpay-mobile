import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle, Clock, XCircle, Copy, Download } from "lucide-react";
import { toast } from "sonner";

const getNetworkLogo = (network: string) => {
  const networkLower = network.toLowerCase();
  if (networkLower.includes('mtn')) return '/mtn.png';
  if (networkLower.includes('glo')) return '/glo.png';
  if (networkLower.includes('airtel')) return '/airtel.png';
  if (networkLower.includes('9mobile')) return '/9mobile.png';
  return null;
};

export default function TransactionDetails() {
  const navigate = useNavigate();
  const { type, id } = useParams<{ type: string; id: string }>();
  const [transaction, setTransaction] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTransactionDetails = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/user/auth");
        return;
      }

      try {
        setLoading(true);
        let query;

        switch (type) {
          case 'user':
            query = supabase
              .from('user_transactions')
              .select('*')
              .eq('id', id)
              .eq('user_id', session.user.id)
              .single();
            break;

          case 'airtime':
            query = supabase
              .from('airtime_transactions')
              .select('*')
              .eq('id', id)
              .eq('user_id', session.user.id)
              .single();
            break;

          case 'data':
            query = supabase
              .from('data_transactions')
              .select('*')
              .eq('id', id)
              .eq('user_id', session.user.id)
              .single();
            break;

          case 'transfer_sent':
            query = supabase
              .from('transfer_transactions')
              .select('*, recipient:profiles!transfer_transactions_recipient_id_fkey(full_name, email, phone)')
              .eq('id', id)
              .eq('sender_id', session.user.id)
              .single();
            break;

          case 'transfer_received':
            query = supabase
              .from('transfer_transactions')
              .select('*, sender:profiles!transfer_transactions_sender_id_fkey(full_name, email, phone)')
              .eq('id', id)
              .eq('recipient_id', session.user.id)
              .single();
            break;

          case 'funding':
            query = supabase
              .from('funding_transactions')
              .select('*')
              .eq('id', id)
              .eq('user_id', session.user.id)
              .single();
            break;

          case 'electricity':
            query = supabase
              .from('electricity_transactions')
              .select('*')
              .eq('id', id)
              .eq('user_id', session.user.id)
              .single();
            break;

          default:
            throw new Error('Invalid transaction type');
        }

        const { data, error } = await query;

        if (error) throw error;
        if (!data) throw new Error('Transaction not found');

        setTransaction({ ...data, type });
      } catch (error: any) {
        console.error('Error fetching transaction:', error);
        toast.error(error.message || 'Failed to load transaction details');
        navigate('/user/transactions');
      } finally {
        setLoading(false);
      }
    };

    if (type && id) {
      fetchTransactionDetails();
    }
  }, [type, id, navigate]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const getStatusIcon = () => {
    const status = transaction?.status || 'completed';
    switch (status.toLowerCase()) {
      case 'completed':
      case 'success':
        return <CheckCircle className="w-16 h-16 text-green-600" />;
      case 'pending':
        return <Clock className="w-16 h-16 text-orange-500" />;
      case 'failed':
        return <XCircle className="w-16 h-16 text-red-600" />;
      default:
        return <CheckCircle className="w-16 h-16 text-green-600" />;
    }
  };

  const getStatusColor = () => {
    const status = transaction?.status || 'completed';
    switch (status.toLowerCase()) {
      case 'completed':
      case 'success':
        return 'text-green-600 bg-green-50';
      case 'pending':
        return 'text-orange-600 bg-orange-50';
      case 'failed':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-green-600 bg-green-50';
    }
  };

  const getTransactionTitle = () => {
    if (!transaction) return 'Transaction Details';
    
    switch (transaction.type) {
      case 'transfer_sent':
        return 'Money Sent';
      case 'transfer_received':
        return 'Money Received';
      case 'airtime':
        return 'Airtime Purchase';
      case 'data':
        return 'Data Purchase';
      case 'funding':
        return 'Wallet Funding';
      case 'electricity':
        return 'Electricity Purchase';
      case 'user':
        return transaction.transaction_type?.includes('credit') ? 'Credit' : 'Debit';
      default:
        return 'Transaction';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading transaction details...</p>
        </div>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">Transaction not found</p>
          <Button onClick={() => navigate('/user/transactions')}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const isCredit = transaction.type === 'transfer_received' || 
                   transaction.type === 'funding' ||
                   transaction.transaction_type?.includes('credit');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white px-6 py-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/user/transactions")}
            className="text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Transaction Details</h1>
        </div>
      </div>

      <div className="px-6 py-6 space-y-6">
        {/* Status Icon */}
        <div className="flex justify-center py-6">
          <div className="animate-scale-in">
            {(transaction.type === 'airtime' || transaction.type === 'data') && transaction.network && getNetworkLogo(transaction.network) ? (
              <div className="w-20 h-20 rounded-full bg-white shadow-lg flex items-center justify-center">
                <img 
                  src={getNetworkLogo(transaction.network)} 
                  alt={transaction.network}
                  className="w-14 h-14 object-contain"
                />
              </div>
            ) : (
              getStatusIcon()
            )}
          </div>
        </div>

        {/* Transaction Type & Status */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-gray-900">{getTransactionTitle()}</h2>
          <span className={`inline-block px-4 py-1 rounded-full text-sm font-medium ${getStatusColor()}`}>
            {(transaction.status || 'completed').charAt(0).toUpperCase() + (transaction.status || 'completed').slice(1)}
          </span>
        </div>

        {/* Amount Card */}
        <div className="bg-gradient-to-r from-brand to-brand-light rounded-2xl p-6 text-white text-center">
          <p className="text-white/90 text-sm mb-2">Amount</p>
          <p className="text-4xl font-bold">
            {isCredit ? '+' : '-'}₦{Math.abs(Number(transaction.amount)).toLocaleString()}
          </p>
        </div>

        {/* Transaction Details */}
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="p-6 space-y-4">
            {/* Reference */}
            {transaction.reference && (
              <div className="flex justify-between items-center py-3 border-b">
                <span className="text-gray-600 text-sm">Reference</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-gray-900">{transaction.reference}</span>
                  <button
                    onClick={() => copyToClipboard(transaction.reference, 'Reference')}
                    className="text-primary hover:text-primary/80"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Date & Time */}
            <div className="flex justify-between py-3 border-b">
              <span className="text-gray-600 text-sm">Date & Time</span>
              <span className="font-medium text-gray-900 text-sm">
                {new Date(transaction.created_at).toLocaleString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                })}
              </span>
            </div>

            {/* Transfer Specific Details */}
            {transaction.type === 'transfer_sent' && transaction.recipient && (
              <>
                <div className="flex justify-between py-3 border-b">
                  <span className="text-gray-600 text-sm">Recipient</span>
                  <span className="font-medium text-gray-900 text-sm">{transaction.recipient.full_name || 'NetPay User'}</span>
                </div>
                <div className="flex justify-between py-3 border-b">
                  <span className="text-gray-600 text-sm">Email</span>
                  <span className="font-medium text-gray-900 text-sm">{transaction.recipient.email}</span>
                </div>
              </>
            )}

            {transaction.type === 'transfer_received' && transaction.sender && (
              <>
                <div className="flex justify-between py-3 border-b">
                  <span className="text-gray-600 text-sm">Sender</span>
                  <span className="font-medium text-gray-900 text-sm">{transaction.sender.full_name || 'NetPay User'}</span>
                </div>
                <div className="flex justify-between py-3 border-b">
                  <span className="text-gray-600 text-sm">Email</span>
                  <span className="font-medium text-gray-900 text-sm">{transaction.sender.email}</span>
                </div>
              </>
            )}

            {/* Airtime/Data Specific */}
            {(transaction.type === 'airtime' || transaction.type === 'data') && (
              <>
                {transaction.network && (
                  <div className="flex justify-between py-3 border-b">
                    <span className="text-gray-600 text-sm">Network</span>
                    <span className="font-medium text-gray-900 text-sm">{transaction.network}</span>
                  </div>
                )}
                {transaction.phone_number && (
                  <div className="flex justify-between py-3 border-b">
                    <span className="text-gray-600 text-sm">Phone Number</span>
                    <span className="font-medium text-gray-900 text-sm">{transaction.phone_number}</span>
                  </div>
                )}
                {transaction.plan_name && (
                  <div className="flex justify-between py-3 border-b">
                    <span className="text-gray-600 text-sm">Plan</span>
                    <span className="font-medium text-gray-900 text-sm">{transaction.plan_name}</span>
                  </div>
                )}
              </>
            )}

            {/* Electricity Specific */}
            {transaction.type === 'electricity' && (
              <>
                {transaction.token && (
                  <div className="py-3 border-b">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-gray-600 text-sm">Electricity Token</span>
                      <button
                        onClick={() => copyToClipboard(transaction.token, 'Token')}
                        className="text-primary hover:text-primary/80"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="bg-muted p-3 rounded-lg">
                      <p className="font-mono font-bold text-lg break-all">{transaction.token}</p>
                    </div>
                  </div>
                )}
                {transaction.provider && (
                  <div className="flex justify-between py-3 border-b">
                    <span className="text-gray-600 text-sm">Provider</span>
                    <span className="font-medium text-gray-900 text-sm">{transaction.provider}</span>
                  </div>
                )}
                {transaction.meter_number && (
                  <div className="flex justify-between py-3 border-b">
                    <span className="text-gray-600 text-sm">Meter Number</span>
                    <span className="font-medium text-gray-900 text-sm">{transaction.meter_number}</span>
                  </div>
                )}
                {transaction.customer_name && (
                  <div className="flex justify-between py-3 border-b">
                    <span className="text-gray-600 text-sm">Customer Name</span>
                    <span className="font-medium text-gray-900 text-sm">{transaction.customer_name}</span>
                  </div>
                )}
                {transaction.meter_type && (
                  <div className="flex justify-between py-3 border-b">
                    <span className="text-gray-600 text-sm">Meter Type</span>
                    <span className="font-medium text-gray-900 text-sm capitalize">{transaction.meter_type}</span>
                  </div>
                )}
              </>
            )}

            {/* Funding Specific */}
            {transaction.type === 'funding' && (
              <>
                {transaction.bank_name && (
                  <div className="flex justify-between py-3 border-b">
                    <span className="text-gray-600 text-sm">Bank</span>
                    <span className="font-medium text-gray-900 text-sm">{transaction.bank_name}</span>
                  </div>
                )}
                {transaction.account_number && (
                  <div className="flex justify-between py-3 border-b">
                    <span className="text-gray-600 text-sm">Account Number</span>
                    <span className="font-medium text-gray-900 text-sm">{transaction.account_number}</span>
                  </div>
                )}
                {transaction.account_name && (
                  <div className="flex justify-between py-3 border-b">
                    <span className="text-gray-600 text-sm">Account Name</span>
                    <span className="font-medium text-gray-900 text-sm">{transaction.account_name}</span>
                  </div>
                )}
              </>
            )}

            {/* Description */}
            {transaction.description && (
              <div className="flex justify-between py-3 border-b">
                <span className="text-gray-600 text-sm">Description</span>
                <span className="font-medium text-gray-900 text-sm text-right max-w-[60%]">
                  {transaction.description}
                </span>
              </div>
            )}

            {/* Balance Information */}
            {(transaction.balance_before !== undefined && transaction.balance_after !== undefined) && (
              <>
                <div className="flex justify-between py-3 border-b">
                  <span className="text-gray-600 text-sm">Balance Before</span>
                  <span className="font-medium text-gray-900 text-sm">
                    ₦{Number(transaction.balance_before).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between py-3">
                  <span className="text-gray-600 text-sm">Balance After</span>
                  <span className="font-bold text-gray-900">
                    ₦{Number(transaction.balance_after).toLocaleString()}
                  </span>
                </div>
              </>
            )}

            {/* Transfer Balance Information */}
            {transaction.type === 'transfer_sent' && (
              <>
                <div className="flex justify-between py-3 border-b">
                  <span className="text-gray-600 text-sm">Balance Before</span>
                  <span className="font-medium text-gray-900 text-sm">
                    ₦{Number(transaction.sender_balance_before).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between py-3">
                  <span className="text-gray-600 text-sm">Balance After</span>
                  <span className="font-bold text-gray-900">
                    ₦{Number(transaction.sender_balance_after).toLocaleString()}
                  </span>
                </div>
              </>
            )}

            {transaction.type === 'transfer_received' && (
              <>
                <div className="flex justify-between py-3 border-b">
                  <span className="text-gray-600 text-sm">Balance Before</span>
                  <span className="font-medium text-gray-900 text-sm">
                    ₦{Number(transaction.recipient_balance_before).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between py-3">
                  <span className="text-gray-600 text-sm">Balance After</span>
                  <span className="font-bold text-gray-900">
                    ₦{Number(transaction.recipient_balance_after).toLocaleString()}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3 pb-6">
          <Button
            onClick={() => navigate('/user/transactions')}
            variant="outline"
            className="w-full h-12"
          >
            Back to Transactions
          </Button>
        </div>
      </div>
    </div>
  );
}
