import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import logo from '@/assets/logo.png';

const Index = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  // If already logged in, skip this page and go straight to the panel
  useEffect(() => {
    if (!loading && user) {
      navigate('/provider-panel', { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading) return null; // Splash is already covering the screen

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="text-center max-w-md"
      >
        {/* Glow ring */}
        <motion.div
          animate={{ scale: [1, 1.12, 1], opacity: [0.3, 0.55, 0.3] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute w-48 h-48 rounded-full left-1/2 -translate-x-1/2 bg-primary/20 blur-2xl"
        />

        {/* Real logo */}
        <motion.img
          src={logo}
          alt="HandyFix"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
          className="w-24 h-24 rounded-3xl object-cover mx-auto mb-6 shadow-gold relative z-10"
        />

        <h1 className="text-3xl font-extrabold mb-1 tracking-tight relative z-10 gold-text">
          HandyFix
        </h1>
        <p className="text-muted-foreground mb-8 tracking-widest uppercase text-sm">Provider Portal</p>

        <Button
          onClick={() => navigate('/provider-login')}
          className="gold-gradient text-primary-foreground font-semibold h-12 px-8 text-base"
        >
          Provider Login <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </motion.div>
    </div>
  );
};

export default Index;
