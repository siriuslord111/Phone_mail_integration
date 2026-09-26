import { Outlet, useLocation } from 'react-router-dom';
import { Lock, Smartphone } from 'lucide-react';

/**
 * Shared chrome for the language, terms, registration, and login screens.
 * WhatsApp-style: a blue hero up top that stays put while a white sheet with the
 * current step slides in underneath it — see the `anim-sheet` keyframe in index.css.
 */
export default function AuthLayout() {
  const location = useLocation();

  return (
    <div className="flex h-dvh flex-col bg-[#eaf1fb] md:items-center md:justify-center md:bg-gradient-to-br md:from-[#0b3fbf] md:to-[#1a66ff] md:p-6">
      <div className="relative flex w-full flex-1 flex-col overflow-hidden md:h-[46rem] md:max-h-[92vh] md:max-w-[26rem] md:flex-none md:rounded-[2rem] md:shadow-2xl md:shadow-blue-900/40">
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-[#1a66ff] to-[#0b4fe0] px-6 pb-9 pt-[max(env(safe-area-inset-top),2.25rem)] text-white">
          <span className="pointer-events-none absolute -right-12 -top-16 size-52 rounded-full bg-white/10" />
          <span className="pointer-events-none absolute -bottom-16 -left-10 size-36 rounded-full bg-white/10" />

          <div className="relative flex items-center gap-2.5">
            <span className="grid size-10 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
              <Smartphone className="size-5" strokeWidth={2.2} />
            </span>
            <span className="font-serif text-2xl font-bold tracking-tight">
              Phone<span className="text-blue-200">Mail</span>
            </span>
          </div>
          <p className="relative mt-3 text-[15px] leading-snug text-blue-50">
            Your phone number is your email.
            <br />
            Sign in to start a conversation.
          </p>
        </div>

        <div className="relative -mt-4 flex flex-1 flex-col overflow-y-auto rounded-t-3xl bg-white px-6 pb-6 pt-6 shadow-[0_-4px_24px_rgba(11,63,191,0.08)]">
          <div key={location.pathname} className="anim-sheet flex flex-1 flex-col">
            <Outlet />
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <Lock className="size-3.5" />
            End-to-end encrypted
          </p>
        </div>
      </div>
    </div>
  );
}
