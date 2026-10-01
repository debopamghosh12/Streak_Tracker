import { motion } from 'framer-motion';
import { Suspense, lazy, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { WordsPullUp } from '../components/WordsPullUp';
import { APP_LINKS, HoverLink, PillShell } from '../components/PillNav';
import { useStore } from '../state/store';
import { useNow } from '../lib/hooks';
import { currentStreak } from '../lib/streak';
import { weekNumberFor } from '../lib/dates';
import { plannedSyllabusPercent } from '../lib/planModel';
import { usePrefersReducedMotion } from '../lib/hooks';
import { textShadowStrength } from '../lib/dayCycle';
import { SkyLayers } from './sky/SkyLayers';
import { useSkyState } from './sky/useSkyState';

// Dev-only scrubber: the dynamic import is dropped from production builds.
const SkyDevPanel = import.meta.env.DEV ? lazy(() => import('./sky/SkyDevPanel')) : null;

const ease = [0.16, 1, 0.3, 1] as const;

export function Hero() {
  const navigate = useNavigate();
  const { state } = useStore();
  const now = useNow();
  const streak = currentStreak(state, now);
  const week = weekNumberFor(now);
  const syllabusPct = plannedSyllabusPercent(state.plan, state.topicsDone);

  // Day–night grade synced to the visitor's clock (or ?time= / ?date=, or the dev scrubber).
  const [scrub, setScrub] = useState<number | null>(null);
  const [scrubbed, setScrubbed] = useState(false);
  const { sky, anchors, at } = useSkyState(scrub);
  const reducedMotion = usePrefersReducedMotion();
  const transitionMs = reducedMotion ? 0 : scrubbed ? 400 : 60_000;
  const shade = textShadowStrength(sky);
  const textStyle = {
    textShadow: shade > 0 ? `0 1px 14px rgba(0, 0, 0, ${(0.6 * shade).toFixed(2)}), 0 0 2px rgba(0, 0, 0, ${(0.35 * shade).toFixed(2)})` : 'none',
    transition: transitionMs ? `text-shadow ${transitionMs}ms linear` : undefined,
  };

  const scrollToAbout = () => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <section className="h-screen p-4 md:p-6 bg-black">
      <div className="relative h-full w-full rounded-2xl md:rounded-[2rem] overflow-hidden">
        <SkyLayers sky={sky} transitionMs={transitionMs} twinkle={!reducedMotion} />
        <div className="noise-overlay absolute inset-0 opacity-[0.7] mix-blend-overlay pointer-events-none" />
        {/* Readability gradient: fixed top, bottom strength follows the scene (stronger when bright) */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-transparent pointer-events-none" />
        <div
          className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black pointer-events-none"
          style={{ opacity: sky.bottomShade, transition: transitionMs ? `opacity ${transitionMs}ms linear` : undefined, willChange: 'opacity' }}
        />

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
                <WordsPullUp text="Persist" showAsterisk />
              </h1>
            </div>
            <div className="col-span-12 lg:col-span-4 flex flex-col gap-4 lg:pb-[2vw]">
              <motion.p
                className="text-primary/70 text-xs sm:text-sm md:text-base max-w-md"
                style={{ lineHeight: 1.2, ...textStyle }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.8, ease }}
              >
                Persist is my daily system for placement season — five subjects, one streak, week after week. Show up, tick it
                off, and let the plan carry the rest.
              </motion.p>
              <motion.p
                className="text-primary text-xs sm:text-sm"
                style={textStyle}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.8, ease }}
              >
                🔥 {streak}-day streak · Week {week} · {syllabusPct}% of planned syllabus
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
      {SkyDevPanel && (
        <Suspense fallback={null}>
          <SkyDevPanel
            minutes={scrub}
            liveMinutes={at.getHours() * 60 + at.getMinutes()}
            onChange={(m) => {
              setScrubbed(m != null);
              setScrub(m);
            }}
            sky={sky}
            anchors={anchors}
          />
        </Suspense>
      )}
    </section>
  );
}
