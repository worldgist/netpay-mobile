import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BottomNav from "@/components/BottomNav";
import { Phone, Wifi, Tv, GraduationCap, ArrowUpRight, ArrowDownLeft, Wallet, Receipt, Zap } from "lucide-react";

const getNetworkLogo = (network: string) => {
  const networkLower = network.toLowerCase();
  if (networkLower.includes('mtn')) return '/mtn.png';
  if (networkLower.includes('glo')) return '/glo.png';
  if (networkLower.includes('airtel')) return '/airtel.png';
  if (networkLower.includes('9mobile')) return '/9mobile.png';
  return null;
};

export default function UserTransactions() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAllTransactions = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/user/auth");
        return;
      }

      try {
        setLoading(true);

        // Fetch all transaction types in parallel
        const [
          userTxns,
          airtimeTxns,
          dataTxns,
          transfersSent,
          transfersReceived,
          fundingTxns,
          electricityTxns,
          educationTxns,
        ] = await Promise.all([
          // User transactions (credit/debit)
          supabase
            .from('user_transactions')
            .select('*')
            .eq('user_id', session.user.id),

          // Airtime transactions
          supabase
            .from('airtime_transactions')
            .select('*')
            .eq('user_id', session.user.id),

          // Data transactions
          supabase
            .from('data_transactions')
            .select('*')
            .eq('user_id', session.user.id),

          // Transfers sent
          supabase
            .from('transfer_transactions')
            .select('*, recipient:profiles!transfer_transactions_recipient_id_fkey(full_name, email)')
            .eq('sender_id', session.user.id),

          // Transfers received
          supabase
            .from('transfer_transactions')
            .select('*, sender:profiles!transfer_transactions_sender_id_fkey(full_name, email)')
            .eq('recipient_id', session.user.id),

          // Funding transactions
          supabase
            .from('funding_transactions')
            .select('*')
            .eq('user_id', session.user.id),

          // Electricity transactions
          supabase
            .from('electricity_transactions')
            .select('*')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false }),

          // Education transactions
          supabase
            .from('education_transactions')
            .select('*')
            .eq('user_id', session.user.id),
        ]);

        // Log errors for debugging
        if (userTxns.error) console.error('Error fetching user transactions:', userTxns.error);
        if (airtimeTxns.error) console.error('Error fetching airtime transactions:', airtimeTxns.error);
        if (dataTxns.error) console.error('Error fetching data transactions:', dataTxns.error);
        if (transfersSent.error) console.error('Error fetching transfers sent:', transfersSent.error);
        if (transfersReceived.error) console.error('Error fetching transfers received:', transfersReceived.error);
        if (fundingTxns.error) console.error('Error fetching funding transactions:', fundingTxns.error);
        if (electricityTxns.error) {
          console.error('Error fetching electricity transactions:', electricityTxns.error);
          console.error('Electricity transactions error details:', {
            message: electricityTxns.error.message,
            code: electricityTxns.error.code,
            details: electricityTxns.error.details,
            hint: electricityTxns.error.hint,
          });
        }
        if (educationTxns.error) console.error('Error fetching education transactions:', educationTxns.error);

        // Log counts for debugging
        console.log('Transaction counts:', {
          user: userTxns.data?.length || 0,
          airtime: airtimeTxns.data?.length || 0,
          data: dataTxns.data?.length || 0,
          transfersSent: transfersSent.data?.length || 0,
          transfersReceived: transfersReceived.data?.length || 0,
          funding: fundingTxns.data?.length || 0,
          electricity: electricityTxns.data?.length || 0,
          education: educationTxns.data?.length || 0,
        });

        // Debug electricity transactions specifically
        if (electricityTxns.data && electricityTxns.data.length > 0) {
          console.log('Sample electricity transactions:', electricityTxns.data.slice(0, 3).map(txn => ({
            id: txn.id,
            reference: txn.reference,
            status: txn.status,
            provider: txn.provider,
            vending_provider: txn.vending_provider,
            created_at: txn.created_at,
            hasToken: !!txn.token,
          })));
        } else {
          console.warn('No electricity transactions found for user:', session.user.id);
          // Try a direct query to see if transactions exist
          const { data: directCheck, error: directError } = await supabase
            .from('electricity_transactions')
            .select('id, reference, status, vending_provider, created_at')
            .eq('user_id', session.user.id)
            .limit(5);
          
          if (directError) {
            console.error('Direct query error:', directError);
          } else {
            console.log('Direct query result:', directCheck?.length || 0, 'transactions found');
            if (directCheck && directCheck.length > 0) {
              console.log('Direct query sample:', directCheck);
            }
          }
        }

        // Combine all transactions with type information
        const allTransactions = [
          ...(userTxns.data || []).map(txn => ({ ...txn, txn_type: 'user', icon: 'wallet' })),
          ...(airtimeTxns.data || []).map(txn => ({ ...txn, txn_type: 'airtime', icon: 'phone' })),
          ...(dataTxns.data || []).map(txn => ({ ...txn, txn_type: 'data', icon: 'wifi' })),
          ...(transfersSent.data || []).map(txn => ({ ...txn, txn_type: 'transfer_sent', icon: 'send' })),
          ...(transfersReceived.data || []).map(txn => ({ ...txn, txn_type: 'transfer_received', icon: 'receive' })),
          ...(fundingTxns.data || []).map(txn => ({ ...txn, txn_type: 'funding', icon: 'wallet' })),
          ...(electricityTxns.data || []).map(txn => ({ ...txn, txn_type: 'electricity', icon: 'electricity' })),
          ...(educationTxns.data || []).map(txn => ({ ...txn, txn_type: 'education', icon: 'education' })),
        ];

        // Sort by created_at descending
        allTransactions.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        setTransactions(allTransactions);
        setError(null); // Clear any previous errors
      } catch (error: any) {
        console.error('Error fetching transactions:', error);
        setError(error?.message || 'Failed to load transactions. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchAllTransactions();
  }, [navigate]);

  const getTransactionIcon = (txn: any) => {
    switch (txn.icon) {
      case 'phone': return <Phone className="w-6 h-6 text-gray-900" />;
      case 'wifi': return <Wifi className="w-6 h-6 text-gray-900" />;
      case 'tv': return <Tv className="w-6 h-6 text-gray-900" />;
      case 'education': return <GraduationCap className="w-6 h-6 text-gray-900" />;
      case 'electricity': return <Zap className="w-6 h-6 text-gray-900" />;
      case 'send': return <ArrowUpRight className="w-6 h-6 text-gray-900" />;
      case 'receive': return <ArrowDownLeft className="w-6 h-6 text-gray-900" />;
      case 'wallet': return <Wallet className="w-6 h-6 text-gray-900" />;
      default: return <Receipt className="w-6 h-6 text-gray-900" />;
    }
  };

  const getTransactionTitle = (txn: any) => {
    if (txn.txn_type === 'transfer_sent') {
      return `Transfer to ${txn.recipient?.full_name || txn.recipient?.email || 'NetPay User'}`;
    }
    if (txn.txn_type === 'transfer_received') {
      return `Transfer from ${txn.sender?.full_name || txn.sender?.email || 'NetPay User'}`;
    }
    if (txn.txn_type === 'airtime') {
      return `${txn.network} Airtime - ${txn.phone_number}`;
    }
    if (txn.txn_type === 'data') {
      return `${txn.network} Data - ${txn.plan_name}`;
    }
    if (txn.txn_type === 'funding') {
      return `Wallet Funding - ${txn.account_name || 'Bank Transfer'}`;
    }
    if (txn.txn_type === 'electricity') {
      return `${txn.provider} Electricity - ${txn.meter_number}`;
    }
    if (txn.txn_type === 'education') {
      return `${txn.exam_type} ${txn.phone_number ? `- ${txn.phone_number}` : ''}`;
    }
    return txn.description || txn.transaction_type || 'Transaction';
  };

  const getTransactionStatus = (txn: any) => {
    const status = txn.status || 'completed';
    return {
      text: status.charAt(0).toUpperCase() + status.slice(1),
      color: status === 'completed' ? 'text-green-600' : 
             status === 'pending' ? 'text-orange-500' : 'text-red-600'
    };
  };

  const isCredit = (txn: any) => {
    return txn.txn_type === 'transfer_received' || 
           txn.txn_type === 'funding' ||
           txn.transaction_type?.includes('credit');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white px-6 py-4 border-b border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900 text-center">Transactions</h1>
      </div>

      {/* Transactions List */}
      <div className="px-4 pt-4 space-y-2">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-500">Loading transactions...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12">
            <Receipt className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No transactions yet</p>
          </div>
        ) : (
          transactions.map((txn: any) => {
            const status = getTransactionStatus(txn);
            const credit = isCredit(txn);
            
            return (
              <button
                key={`${txn.txn_type}-${txn.id}`}
                onClick={() => navigate(`/user/transaction/${txn.txn_type}/${txn.id}`)}
                className="w-full bg-white rounded-2xl p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-all"
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                  credit ? 'bg-green-100' : 'bg-orange-100'
                }`}>
                  {(txn.txn_type === 'airtime' || txn.txn_type === 'data') && txn.network && getNetworkLogo(txn.network) ? (
                    <img 
                      src={getNetworkLogo(txn.network)} 
                      alt={txn.network}
                      className="w-8 h-8 object-contain"
                    />
                  ) : (
                    getTransactionIcon(txn)
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {getTransactionTitle(txn)}
                  </p>
                  <p className="text-sm text-gray-500">
                    {new Date(txn.created_at).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </p>
                  {txn.reference && (
                    <p className="text-xs text-gray-400 font-mono mt-1">
                      {txn.reference}
                    </p>
                  )}
                </div>

                <div className="text-right flex-shrink-0">
                  <p className={`font-bold ${credit ? 'text-green-600' : 'text-gray-900'}`}>
                    {credit ? '+' : '-'}₦{Math.abs(Number(txn.amount)).toLocaleString()}
                  </p>
                  <p className={`text-sm ${status.color}`}>
                    {status.text}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>

      <BottomNav />
    </div>
  );
}
