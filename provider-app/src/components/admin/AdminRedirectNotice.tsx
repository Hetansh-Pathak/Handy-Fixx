import React from 'react';
import { Shield, ExternalLink } from 'lucide-react';

const AdminRedirectNotice: React.FC = () => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="glass-card p-8 max-w-md w-full text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Shield className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Admin Panel Has Moved</h2>
        <p className="text-sm text-muted-foreground">
          The HandyFix internal admin operations & KYC review panel has been relocated to a dedicated application.
        </p>
        <a
          href="http://localhost:3002"
          className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl gold-gradient text-primary-foreground font-bold text-sm shadow-gold hover:opacity-90 transition-opacity"
        >
          Open Admin Panel (Port 3002) <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
};

export default AdminRedirectNotice;
