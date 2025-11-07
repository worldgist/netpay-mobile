import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import BottomNav from "@/components/BottomNav";
import NotificationBell from "@/components/NotificationBell";
import { Eye, EyeOff, Receipt, ArrowUpRight, ArrowDownLeft, Zap, Wifi } from "lucide-react";
import { toast } from "sonner";

const getNetworkLogo = (network: string): string | null => {
  const networkMap: { [key: string]: string } = {
    'MTN': '/mtn.png',
    'GLO': '/glo.png',
    'AIRTEL': '/airtel.png',
    '9MOBILE': '/9mobile.png'
  };
  return networkMap[network.toUpperCase()] || null;
};

export default function UserDashboard() {
  const navigate = useNavigate();
  const [balance, setBalance] = useState(0);
  const [showBalance, setShowBalance] = useState(true);
  const [userName, setUserName] = useState("");
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/user/auth");
        return;
      }

      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('balance, full_name')
        .eq('id', session.user.id)
        .single();

      if (profile) {
        setBalance(Number(profile.balance) || 0);
        const firstName = profile.full_name?.split(' ')[0] || session.user.email?.split('@')[0] || 'User';
        setUserName(firstName);
      } else {
        setUserName(session.user.email?.split('@')[0] || 'User');
      }

      // Get recent transactions (all types)
      const [userTxns, airtimeTxns, dataTxns, transfersSent, transfersReceived] = await Promise.all([
        supabase
          .from('user_transactions')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(3),
        supabase
          .from('airtime_transactions')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(2),
        supabase
          .from('data_transactions')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(2),
        supabase
          .from('transfer_transactions')
          .select('*, recipient:profiles!transfer_transactions_recipient_id_fkey(full_name)')
          .eq('sender_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(2),
        supabase
          .from('transfer_transactions')
          .select('*, sender:profiles!transfer_transactions_sender_id_fkey(full_name)')
          .eq('recipient_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(2),
      ]);

      // Combine and sort all transactions
      const allTxns = [
        ...(userTxns.data || []).map(t => ({ ...t, type: 'user' })),
        ...(airtimeTxns.data || []).map(t => ({ ...t, type: 'airtime' })),
        ...(dataTxns.data || []).map(t => ({ ...t, type: 'data' })),
        ...(transfersSent.data || []).map(t => ({ ...t, type: 'transfer_sent' })),
        ...(transfersReceived.data || []).map(t => ({ ...t, type: 'transfer_received' })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
       .slice(0, 3);

      setTransactions(allTxns);
    };

    checkAuth();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white px-6 pt-6 pb-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Home</h1>
          <NotificationBell />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Hello, {userName}
          </h2>
          <p className="text-gray-600">Welcome back!</p>
        </div>
      </div>

      {/* Balance Card */}
      <div className="px-6 -mt-2">
        <div className="bg-gradient-to-r from-[#FF6B00] to-[#FF8533] rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <span className="text-white/90 text-sm">Available Balance</span>
            <button
              onClick={() => setShowBalance(!showBalance)}
              className="text-white/90 hover:text-white transition-colors"
            >
              {showBalance ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
            </button>
          </div>

          <div className="text-4xl font-bold mb-6">
            {showBalance ? `₦${balance.toLocaleString()}` : "₦****"}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => navigate("/user/add-money")}
              className="bg-white/20 hover:bg-white/30 text-white border-0 h-12"
            >
              Add Money
            </Button>
            <Button
              onClick={() => navigate("/user/transfer")}
              className="bg-white hover:bg-white/90 text-[#FF6B00] border-0 h-12"
            >
              Transfer
            </Button>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="px-6 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-900">Recent Transactions</h3>
          <button
            onClick={() => navigate("/user/transactions")}
            className="text-[#FF6B00] text-sm font-medium hover:underline"
          >
            See All
          </button>
        </div>

        {transactions.length === 0 ? (
          <div className="text-center py-12">
            <Receipt className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((txn: any) => {
              const isCredit = txn.type === 'transfer_received' || txn.transaction_type?.includes('credit');
              const title = 
                txn.type === 'transfer_sent' ? `Transfer to ${txn.recipient?.full_name || 'User'}` :
                txn.type === 'transfer_received' ? `Transfer from ${txn.sender?.full_name || 'User'}` :
                txn.type === 'airtime' ? `${txn.network} Airtime` :
                txn.type === 'data' ? `${txn.network} Data` :
                txn.description || txn.transaction_type;

              const networkLogo = (txn.type === 'airtime' || txn.type === 'data') && txn.network 
                ? getNetworkLogo(txn.network) 
                : null;

              const getIcon = () => {
                if (networkLogo) {
                  return <img src={networkLogo} alt={txn.network} className="w-10 h-10 rounded-full object-contain" />;
                }
                if (txn.type === 'transfer_sent') {
                  return <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center"><ArrowUpRight className="w-5 h-5 text-red-600" /></div>;
                }
                if (txn.type === 'transfer_received') {
                  return <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center"><ArrowDownLeft className="w-5 h-5 text-green-600" /></div>;
                }
                return <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"><Zap className="w-5 h-5 text-gray-600" /></div>;
              };

              return (
                <div
                  key={`${txn.type}-${txn.id}`}
                  className="bg-white rounded-xl p-4 flex items-center gap-3"
                >
                  {getIcon()}
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{title}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(txn.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${isCredit ? 'text-green-600' : 'text-gray-900'}`}>
                      {isCredit ? '+' : '-'}₦{Math.abs(Number(txn.amount)).toLocaleString()}
                    </p>
                    <p className={`text-xs ${isCredit ? 'text-green-600' : 'text-gray-600'}`}>
                      {isCredit ? 'Credit' : 'Debit'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
