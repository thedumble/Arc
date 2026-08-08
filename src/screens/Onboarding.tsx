import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { EmptyPlot } from '@/components/IsoBuilding';
import { MapPin, Loader2 } from 'lucide-react';

export function Onboarding() {
  const { session, completeOnboarding, refreshProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const requestLocation = () => {
    setLocating(true);
    setLocError(null);
    if (!navigator.geolocation) {
      setLocError('Location not supported on this device.');
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setLocating(false);
        setLocError(
          err.code === err.PERMISSION_DENIED
            ? 'Location denied — you can enter your city manually.'
            : 'Could not get your location. Enter your city manually.'
        );
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  const reverseGeocode = async (la: number, ln: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${la}&lon=${ln}&zoom=10`
      );
      const data = await res.json();
      const a = data.address ?? {};
      const detectedCity =
        a.city || a.town || a.village || a.county || a.state_district || 'Unknown';
      const detectedState = a.state || '';
      setCity(detectedCity);
      setState(detectedState);
    } catch {
      setLocError('Could not detect city name. Enter it manually.');
    } finally {
      setLocating(false);
    }
  };

  const finish = async () => {
    if (!session?.user?.id) return;
    setSaving(true);
    const username = (name || 'aspirant').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20);
    await supabase
      .from('profiles')
      .upsert({
        id: session.user.id,
        name: name || 'Aspirant',
        username,
        city: city || null,
        state: state || null,
        latitude: lat,
        longitude: lng,
        prep_stage: 'beginner',
      });
    setSaving(false);
    await refreshProfile();
    completeOnboarding();
  };

  const canProceed = step === 0 ? name.trim().length > 0 : true;

  return (
    <div className="min-h-screen bg-[#1E3D29] flex flex-col px-6 py-10 overflow-y-auto">
      {/* progress dots */}
      <div className="flex justify-center gap-2 mb-8">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === step ? 'w-8 bg-[#FF6B00]' : i < step ? 'w-4 bg-[#4A7A5A]' : 'w-4 bg-[#3D6B4D]'
            }`}
          />
        ))}
      </div>

      <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
        {step === 0 && (
          <div className="animate-fade-in text-center">
            <h1 className="font-mono text-2xl text-[#F5EDD0] mb-2">What should we call you?</h1>
            <p className="text-[#A8C5B0] text-sm mb-8">This appears on your city</p>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full bg-[#2D5A3D] border border-[#4A7A5A] rounded-xl px-4 py-4 text-white text-center text-lg focus:outline-none focus:border-[#FF6B00]"
              onKeyDown={(e) => e.key === 'Enter' && canProceed && setStep(1)}
            />
          </div>
        )}

        {step === 1 && (
          <div className="animate-fade-in text-center">
            <h1 className="font-mono text-2xl text-[#F5EDD0] mb-2">Where are you preparing from?</h1>
            <p className="text-[#A8C5B0] text-sm mb-8">Find aspirants near you</p>

            <button
              onClick={requestLocation}
              className="w-full bg-[#2D5A3D] border border-[#4A7A5A] rounded-xl px-4 py-4 text-[#F5EDD0] flex items-center justify-center gap-2 btn-press mb-4"
            >
              {locating ? (
                <><Loader2 size={18} className="animate-spin" /> Detecting your location...</>
              ) : (
                <><MapPin size={18} /> Use my location</>
              )}
            </button>

            {locError && <p className="text-[#FFD700] text-xs mb-3">{locError}</p>}

            {city && !locating && (
              <p className="text-[#4CAF7D] text-sm mb-4 animate-pop-in">
                Detected: {city}{state ? `, ${state}` : ''}
              </p>
            )}

            <label className="block text-xs text-[#A8C5B0] mb-1 text-left font-mono">CITY (or override)</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Enter your city"
              className="w-full bg-[#2D5A3D] border border-[#4A7A5A] rounded-xl px-4 py-3 text-white text-sm mb-3 focus:outline-none focus:border-[#FF6B00]"
            />
            <input
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="State (optional)"
              className="w-full bg-[#2D5A3D] border border-[#4A7A5A] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#FF6B00]"
            />
          </div>
        )}

        {step === 2 && (
          <div className="animate-fade-in text-center flex flex-col items-center">
            <h1 className="font-mono text-3xl text-[#FFD700] mb-2 animate-pop-in">YOUR CITY IS READY</h1>
            <p className="text-[#A8C5B0] text-sm mb-8">An empty plot, waiting for your first building</p>
            <div className="mb-8 animate-pop-in">
              <EmptyPlot size={200} />
            </div>
            <Button variant="gold" size="lg" fullWidth onClick={finish} disabled={saving}>
              {saving ? 'SETTING UP...' : 'START BUILDING'}
            </Button>
          </div>
        )}
      </div>

      {step < 2 && (
        <div className="max-w-sm mx-auto w-full mt-8">
          <Button
            fullWidth
            size="lg"
            onClick={() => setStep(step + 1)}
            disabled={!canProceed}
          >
            {step === 0 ? 'NEXT' : 'CONTINUE'}
          </Button>
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="w-full text-center text-[#6B8F75] text-xs mt-3"
            >
              Back
            </button>
          )}
        </div>
      )}
    </div>
  );
}
