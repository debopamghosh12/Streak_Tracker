import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { WordsPullUp } from '../components/WordsPullUp';
import { APP_LINKS, HoverLink, PillShell } from '../components/PillNav';
import { useStore } from '../state/store';
import { useNow } from '../lib/hooks';
import { currentStreak } from '../lib/streak';
import { weekNumberFor } from '../lib/dates';
import { ALL_TOPICS } from '../data/plan';

const HERO_VIDEO =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_170732_8a9ccda6-5cff-4628-b164-059c500a2b41.mp4';
const ease = [0.16, 1, 0.3, 1] as const;

export function Hero() {
  const navigate = useNavigate();
  const { state } = useStore();
  const now = useNow();
  const streak = currentStreak(state, now);
  const week = weekNumberFor(now);
  const syllabusPct = Math.round((Object.keys(state.topicsDone).length / ALL_TOPICS.length) * 100);

  const scrollToAbout = () => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <section className="h-screen p-4 md:p-6 bg-black">
      <div className="relative h-full w-full rounded-2xl md:rounded-[2rem] overflow-hidden">
        <video
          className="absolute inset-0 w-full h-full object-cover"
          src={HERO_VIDEO}
          autoPlay
          loop
          muted
          playsInline
        />
        <div className="noise-overlay absolute inset-0 opacity-[0.7] mix-blend-overlay pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60 pointer-events-none" />

        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10">
          <PillShell>
            {APP_LINKS.map((l) => (
              <li key={l.to}>
                <HoverLink to={l.to}>{l.label}</HoverLink>
              </li>
            ))}
            <li>
              <HoverLink onClick={scrollToAbout}>About</HoverLink>
            </li>
          </PillShell>
        </div>

        <div className="absolute bottom-0 left-0 right-0 px-4 sm:px-6 md:px-10 pb-4 sm:pb-6 md:pb-8">
          <div className="grid grid-cols-12 gap-4 items-end">
            <div className="col-span-12 lg:col-span-8">
              <h1
                className="text-[26vw] sm:text-[24vw] md:text-[22vw] lg:text-[20vw] xl:text-[19vw] 2xl:text-[20vw] font-medium leading-[0.85] tracking-[-0.07em]"
                style={{ color: '#E1E0CC' }}
              >
                <WordsPullUp text="Prisma" showAsterisk />
              </h1>
            </div>
            <div className="col-span-12 lg:col-span-4 flex flex-col gap-4 lg:pb-[2vw]">
              <motion.p
                className="text-primary/70 text-xs sm:text-sm md:text-base max-w-md"
                style={{ lineHeight: 1.2 }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.8, ease }}
              >
                Prisma is my daily system for placement season — thirteen weeks, five subjects, one streak. Show up, tick it
                off, and let the plan carry the rest.
              </motion.p>
              <motion.p
                className="text-primary text-xs sm:text-sm"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.8, ease }}
              >
                🔥 {streak}-day streak · Week {week} of 13 · {syllabusPct}% syllabus
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7, duration: 0.8, ease }}
              >
                <button
                  type="button"
                  onClick={() => navigate('/app')}
                  className="group inline-flex items-center gap-2 hover:gap-3 bg-primary text-black rounded-full font-medium text-sm sm:text-base pl-5 pr-1 py-1 transition-all duration-300"
                >
                  Open today
                  <span className="bg-black rounded-full w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                    <ArrowRight className="w-4 h-4 text-primary" />
                  </span>
                </button>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
