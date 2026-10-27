import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Star, Shield, Navigation, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useApp } from "@/contexts/AppContext";
import heroImg from "@/assets/hero-handyman.jpg";

// ── All Gujarat cities ──────────────────────────────────────────────────────
const GUJARAT_CITIES = [
  "Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Jamnagar",
  "Junagadh", "Gandhinagar", "Anand", "Navsari", "Morbi", "Mehsana",
  "Surendranagar", "Gandhidham", "Bharuch", "Vapi", "Gondal", "Veraval",
  "Godhra", "Ankleshwar", "Porbandar", "Amreli", "Botad", "Dahod",
  "Khambhat", "Palanpur", "Patan", "Vyara", "Dahanu", "Modasa",
  "Nadiad", "Petlad", "Kalol", "Deesa", "Sidhpur", "Unjha",
  "Wankaner", "Jetpur", "Dhoraji", "Upleta", "Amroli", "Limbdi",
  "Visnagar", "Kadi", "Mahuva", "Talaja", "Palitana", "Gadhada",
  "Dwarka", "Okha", "Somnath", "Chorwad", "Una", "Kodinar",
  "Rajula", "Savarkundla", "Lathi", "Dhari", "Bagasara", "Visavadar",
  "Jamjodhpur", "Kalavad", "Jam Khambhalia", "Dhrol", "Paddhari",
  "Tankara", "Morvi", "Halvad", "Wadhwan", "Chotila", "Lakhtar",
  "Dasada", "Zinzuwada", "Patdi", "Sanand", "Dholka", "Dhandhuka",
  "Bavla", "Viramgam", "Mandal", "Zinzuvadia", "Chanasma", "Radhanpur",
  "Tharad", "Dhanera", "Vadgam", "Kankrej", "Sami", "Harij",
  "Prantij", "Idar", "Himatnagar", "Khedbrahma", "Bhiloda", "Meghraj",
  "Bayad", "Lunawada", "Santrampur", "Shamlaji", "Poshina", "Ambaji",
  "Danta", "Vadnagar", "Kapadvanj", "Balasinor", "Thasra", "Vatrak",
  "Kheda", "Matar", "Mahudha", "Kathlal", "Umreth", "Tarapur",
  "Sojitra", "Cambay", "Vallabh Vidyanagar", "Karamsad", "Ode",
  "Borsad", "Amod", "Jambusar", "Vagra", "Hansot", "Olpad",
  "Kamrej", "Bardoli", "Mahuva", "Mandvi", "Kukma", "Bhuj",
  "Rapar", "Anjar", "Mundra", "Nakhatrana", "Abdasa", "Lakhpat",
  "Mandvi", "Dayapar", "Bhachau", "Samakhiali", "Adipur", "Kandla",
  "Hazira", "Sachin", "Sayan", "Palsana", "Bardoli", "Vyara",
  "Songadh", "Nizar", "Valod", "Mangrol", "Bilimora", "Gandevi",
  "Chikhli", "Jalalpore", "Valsad", "Dharampur", "Pardi", "Umbergaon",
  "Vapi", "Silvassa", "Daman", "Tithal", "Udvada", "Sanjan",
  "Bhestan", "Katargam", "Limbayat", "Adajan", "Vesu", "Pal",
  "Varachha", "Rander", "Athwa", "Udhna", "Salabatpura", "Amroli",
];

// ── Reverse-geocode using OpenStreetMap Nominatim (free, no key needed) ──
async function getCityFromCoords(lat: number, lon: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    const addr = data.address ?? {};
    return (
      addr.city ??
      addr.town ??
      addr.village ??
      addr.county ??
      null
    );
  } catch {
    return null;
  }
}

const HeroSection = () => {
  const { pincode, setPincode } = useApp();
  const [query, setQuery] = useState(pincode);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const navigate = useNavigate();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Filter Gujarat cities by prefix
  const handleInput = (value: string) => {
    setQuery(value);
    setHighlightIndex(-1);
    if (value.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    const lower = value.toLowerCase();
    const filtered = GUJARAT_CITIES.filter((c) =>
      c.toLowerCase().startsWith(lower)
    ).slice(0, 8);
    setSuggestions(filtered);
    setShowDropdown(filtered.length > 0);
  };

  const selectCity = (city: string) => {
    setQuery(city);
    setSuggestions([]);
    setShowDropdown(false);
    setPincode(city);
    navigate(`/services?city=${encodeURIComponent(city)}`);
  };

  const handleGo = () => {
    const trimmed = query.trim();
    if (!trimmed) {
      toast({ title: "Enter a city", description: "Please type a Gujarat city name.", variant: "destructive" });
      return;
    }
    // Accept if it's a known Gujarat city (case-insensitive)
    const matched = GUJARAT_CITIES.find((c) => c.toLowerCase() === trimmed.toLowerCase());
    if (!matched) {
      toast({ title: "City not found", description: "Please select a valid Gujarat city from the list.", variant: "destructive" });
      return;
    }
    setPincode(matched);
    navigate(`/services?city=${encodeURIComponent(matched)}`);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) {
      if (e.key === "Enter") handleGo();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0) {
        selectCity(suggestions[highlightIndex]);
      } else {
        handleGo();
      }
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  // GPS detect
  const handleDetect = () => {
    if (!navigator.geolocation) {
      toast({ title: "Not supported", description: "Geolocation is not supported by your browser.", variant: "destructive" });
      return;
    }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const city = await getCityFromCoords(pos.coords.latitude, pos.coords.longitude);
        setDetecting(false);
        if (!city) {
          toast({ title: "Could not detect city", description: "Please type your city manually.", variant: "destructive" });
          return;
        }
        // Check if it's in Gujarat list
        const matched = GUJARAT_CITIES.find((c) => c.toLowerCase() === city.toLowerCase());
        if (matched) {
          setQuery(matched);
          toast({ title: `📍 Detected: ${matched}`, description: "Location detected successfully!" });
        } else {
          setQuery(city);
          toast({ title: `📍 Detected: ${city}`, description: "This city may not be in our Gujarat coverage yet.", variant: "destructive" });
        }
      },
      (err) => {
        setDetecting(false);
        let msg = "Could not detect location.";
        if (err.code === 1) msg = "Location permission denied. Please allow access.";
        toast({ title: "Location error", description: msg, variant: "destructive" });
      },
      { timeout: 10000 }
    );
  };

  return (
    <section className="relative pt-24 pb-16 md:pt-32 md:pb-24 overflow-hidden">
      <div className="container mx-auto grid md:grid-cols-2 gap-12 items-center">
        <motion.div initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, ease: "easeOut" }}>
          <p className="text-sm font-semibold text-primary tracking-wide uppercase mb-4">#1 Home Services Marketplace</p>
          <h1 className="text-4xl md:text-6xl font-extrabold leading-tight mb-6">
            Your Home,{" "}
            <span className="text-gradient-gold">Fixed Fast.</span>
            <br />
            <span className="text-gradient-gold">Guaranteed.</span>
          </h1>
          <p className="text-muted-foreground text-lg mb-8 max-w-lg">
            Book verified professionals for any home service. From plumbing to painting — done right, on time, every time.
          </p>

          {/* ── Location Input ── */}
          <div ref={wrapperRef} className="relative max-w-lg mb-4">
            <div className="flex items-center gap-2 bg-secondary rounded-xl p-2 border border-border focus-within:border-primary/50 transition-colors">
              <MapPin className="w-5 h-5 text-muted-foreground ml-3 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Enter city (e.g. Jamnagar, Surat...)"
                value={query}
                onChange={(e) => handleInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => query.trim().length >= 2 && setShowDropdown(suggestions.length > 0)}
                className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none py-3 px-2 text-sm"
                autoComplete="off"
              />

              {/* GPS Detect Button */}
              <button
                type="button"
                onClick={handleDetect}
                disabled={detecting}
                title="Detect my location"
                className="flex items-center justify-center w-9 h-9 rounded-lg mr-1 transition-all duration-200 hover:scale-110 active:scale-95"
                style={{
                  background: detecting ? "hsl(22 61% 47% / 0.15)" : "hsl(22 61% 47% / 0.1)",
                  border: "1px solid hsl(22 61% 47% / 0.35)",
                  color: "hsl(22 61% 47%)",
                }}
              >
                {detecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Navigation className="w-4 h-4" />
                )}
              </button>

              <Button
                onClick={handleGo}
                className="bg-gradient-gold text-primary-foreground font-bold px-6 rounded-lg hover:opacity-90 transition-opacity"
              >
                Go
              </Button>
            </div>

            {/* ── Autocomplete Dropdown ── */}
            <AnimatePresence>
              {showDropdown && (
                <motion.ul
                  initial={{ opacity: 0, y: -6, scaleY: 0.95 }}
                  animate={{ opacity: 1, y: 0, scaleY: 1 }}
                  exit={{ opacity: 0, y: -6, scaleY: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 right-0 top-full mt-2 z-50 rounded-xl border border-border shadow-lg overflow-hidden"
                  style={{ background: "hsl(var(--card))", transformOrigin: "top" }}
                >
                  {suggestions.map((city, idx) => (
                    <li
                      key={city}
                      onMouseDown={() => selectCity(city)}
                      onMouseEnter={() => setHighlightIndex(idx)}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer text-sm font-medium transition-colors"
                      style={{
                        background: idx === highlightIndex ? "hsl(22 61% 47% / 0.1)" : "transparent",
                        color: idx === highlightIndex ? "hsl(22 61% 47%)" : "hsl(var(--foreground))",
                        borderBottom: idx < suggestions.length - 1 ? "1px solid hsl(var(--border))" : "none",
                      }}
                    >
                      <MapPin className="w-4 h-4 flex-shrink-0 opacity-60" />
                      <span>
                        <span style={{ color: "hsl(22 61% 47%)", fontWeight: 700 }}>
                          {city.substring(0, query.length)}
                        </span>
                        {city.substring(query.length)}
                      </span>
                      <span
                        className="ml-auto text-xs px-2 py-0.5 rounded-full"
                        style={{ background: "hsl(22 61% 47% / 0.1)", color: "hsl(22 61% 47%)" }}
                      >
                        Gujarat
                      </span>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-6 mt-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Shield className="w-4 h-4 text-primary" /> Verified Pros</span>
            <span className="flex items-center gap-1"><Star className="w-4 h-4 text-primary" /> 4.9 Avg Rating</span>
            <span className="flex items-center gap-1 text-primary font-medium">50,000+ bookings</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
          className="relative hidden md:block"
        >
          <div className="relative rounded-2xl overflow-hidden glow-gold">
            <img src={heroImg} alt="Professional handyman at work" width={800} height={800} className="w-full h-auto object-cover rounded-2xl" />
            <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur-sm rounded-xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-gold flex items-center justify-center">
                <Star className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">4.9 Rating</p>
                <p className="text-xs text-muted-foreground">25,000+ reviews</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
