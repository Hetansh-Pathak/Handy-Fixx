import { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { BrandLockup, LogoMark } from "@/components/brand/Logo";
import { EASE } from "@/lib/motion";

interface Props {
  headline: string;
  sub?: string;
  /** Small text button in the corner, e.g. "Browse as guest". */
  skip?: { label: string; onClick: () => void };
  children: ReactNode;
}

/**
 * Shared frame for every sign-in screen. Phones: a compact ink header with the white form
 * sheet rising over it. Tablets and desktop: ink panel on the left, form on the right.
 */
const AuthLayout = ({ headline, sub, skip, children }: Props) => {
  const reduce = useReducedMotion();

  return (
    <div className="flex min-h-dvh flex-col bg-primary text-primary-foreground md:flex-row">
      <aside className="relative flex flex-col overflow-hidden px-6 pb-14 pt-[max(1.25rem,env(safe-area-inset-top))] md:w-[44%] md:max-w-xl md:justify-between md:p-12 lg:p-14">
        <LogoMark className="pointer-events-none absolute -right-12 -top-8 h-56 w-56 text-gold/10 md:-bottom-28 md:-right-36 md:top-auto md:h-[36rem] md:w-[36rem]" />

        <div className="relative flex items-center justify-between">
          <BrandLockup size={40} tileClassName="ring-1 ring-white/15" />
          {skip && (
            <button
              type="button"
              onClick={skip.onClick}
              className="-mr-2 rounded-lg px-2 py-2 text-sm font-semibold text-white/80 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold md:hidden"
            >
              {skip.label}
            </button>
          )}
        </div>

        <div className="relative mt-8 md:mb-8 md:mt-0">
          <h1 className="max-w-xs text-[30px] font-extrabold leading-[1.12] tracking-tight md:max-w-sm md:text-[40px]">
            {headline}
          </h1>
          {sub && <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-white/70 md:max-w-sm md:text-base">{sub}</p>}
        </div>
      </aside>

      <motion.main
        initial={reduce ? false : { y: 56, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="relative z-10 -mt-6 flex-1 rounded-t-[28px] bg-background px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8 text-foreground md:mt-0 md:flex md:items-center md:justify-center md:rounded-none md:px-12 md:py-12"
      >
        <div className="mx-auto w-full max-w-sm">
          {skip && (
            <div className="mb-8 hidden justify-end md:flex">
              <button
                type="button"
                onClick={skip.onClick}
                className="rounded-lg px-2 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {skip.label}
              </button>
            </div>
          )}
          {children}
        </div>
      </motion.main>
    </div>
  );
};

export default AuthLayout;
