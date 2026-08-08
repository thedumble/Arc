import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    const fn = mode === 'signup' ? signUp : signIn;
    const { error } = await fn(email, password);
    setBusy(false);
    if (error) setError(error);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-[#1E3D29] overflow-y-auto">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="font-mono text-5xl font-bold text-[#FF6B00] tracking-tight">ARC</h1>
          <p className="font-mono text-xs text-[#FFD700] mt-2 tracking-[0.3em]">
            INDIA'S UPSC SIGNAL
          </p>
        </div>

        <div className="bg-[#2D5A3D] border border-[#4A7A5A] rounded-2xl p-6">
          <div className="flex gap-2 mb-5">
            <button
              onClick={() => { setMode('signup'); setError(null); }}
              className={`flex-1 py-2 rounded-lg text-xs font-mono transition-colors ${
                mode === 'signup' ? 'bg-[#FF6B00] text-white' : 'text-[#A8C5B0]'
              }`}
            >
              JOIN ARC
            </button>
            <button
              onClick={() => { setMode('signin'); setError(null); }}
              className={`flex-1 py-2 rounded-lg text-xs font-mono transition-colors ${
                mode === 'signin' ? 'bg-[#FF6B00] text-white' : 'text-[#A8C5B0]'
              }`}
            >
              SIGN IN
            </button>
          </div>

          <label className="block text-xs text-[#A8C5B0] mb-1 font-mono">EMAIL</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="w-full bg-[#1E3D29] border border-[#4A7A5A] rounded-xl px-4 py-3 text-white text-sm mb-4 focus:outline-none focus:border-[#FF6B00]"
          />

          <label className="block text-xs text-[#A8C5B0] mb-1 font-mono">PASSWORD</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="At least 6 characters"
            className="w-full bg-[#1E3D29] border border-[#4A7A5A] rounded-xl px-4 py-3 text-white text-sm mb-4 focus:outline-none focus:border-[#FF6B00]"
          />

          {error && (
            <p className="text-[#FF3131] text-xs mb-3 animate-fade-in">{error}</p>
          )}

          <Button fullWidth size="lg" onClick={submit} disabled={busy}>
            {busy ? 'Please wait...' : mode === 'signup' ? 'CREATE ACCOUNT' : 'SIGN IN'}
          </Button>
        </div>

        <p className="text-center text-[#6B8F75] text-xs mt-6">
          {mode === 'signup'
            ? 'Already have an account? Tap SIGN IN above.'
            : 'New to ARC? Tap JOIN ARC to create an account.'}
        </p>
      </div>
    </div>
  );
}
