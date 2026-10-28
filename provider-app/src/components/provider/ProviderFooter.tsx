import { Link } from 'react-router-dom';

const ProviderFooter: React.FC = () => (
  <footer className="mt-auto border-t border-border pt-8 pb-4">
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
      <div className="sm:col-span-2 lg:col-span-1">
        <Link to="/provider-panel" className="mb-4 inline-flex items-center gap-2">
          <img src="/logo.png" alt="" className="h-10 w-10 rounded-xl object-contain" />
          <span className="text-lg font-bold text-foreground">HandyFix Pro</span>
        </Link>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          Your workspace for managing service requests, schedules, earnings, and customer reviews.
        </p>
      </div>

      <nav aria-label="Provider workspace links">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Workspace</h2>
        <ul className="space-y-2">
          <li><Link to="/provider-panel" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Dashboard</Link></li>
          <li><Link to="/provider-panel/bookings" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Bookings</Link></li>
          <li><Link to="/provider-panel/schedule" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Schedule</Link></li>
        </ul>
      </nav>

      <nav aria-label="Provider account links">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Account</h2>
        <ul className="space-y-2">
          <li><Link to="/provider-panel/earnings" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Earnings</Link></li>
          <li><Link to="/provider-panel/reviews" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Reviews</Link></li>
          <li><Link to="/provider-panel/profile" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Profile</Link></li>
        </ul>
      </nav>

      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Provider Support</h2>
        <p className="mb-2 text-sm text-muted-foreground">Need help with your provider account?</p>
        <a href="mailto:support@handyfix.com" className="break-all text-sm text-muted-foreground transition-colors hover:text-foreground">
          support@handyfix.com
        </a>
      </div>
    </div>

    <div className="mt-8 border-t border-border pt-6 text-center text-sm text-muted-foreground">
      © 2026 HandyFix. All rights reserved. Made with <span className="text-primary" aria-label="love">♥</span> in India.
    </div>
  </footer>
);

export default ProviderFooter;
