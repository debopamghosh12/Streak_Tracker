import { motion, useInView } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { WordsPullUpMultiStyle } from '../components/WordsPullUpMultiStyle';

const CARD_VIDEO =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260406_133058_0504132a-0cf3-4450-a370-8ea3b05c95d4.mp4';

const icon = (file: string) =>
  `https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2F${file}&w=1280&q=85`;

const FEATURES = [
  {
    n: '01',
    title: 'Today, planned.',
    icon: icon('hf_20260405_171918_4a5edc79-d78f-4637-ac8b-53c43c220606.png'),
    items: ['Hour-by-hour timetable', "Today's topic for every subject", 'Unfinished work carries forward', 'Morning plan and night check-in'],
    to: '/app',
  },
  {
    n: '02',
    title: 'Streak that counts.',
    icon: icon('hf_20260405_171741_ed9845ab-f5b2-4018-8ce7-07cc01823522.png'),
    items: ['A day counts at 70% of blocks', 'Heatmap from day one', 'One freeze per week'],
    to: '/app/streak',
  },
  {
    n: '03',
    title: 'Syllabus in view.',
    icon: icon('hf_20260405_171809_f56666dc-c099-4778-ad82-9ad4f209567b.png'),
    items: ['Every topic, week by week', 'Ahead or behind, at a glance', 'Weekly targets and review'],
    to: '/app/syllabus',
  },
];

const ease = [0.22, 1, 0.36, 1] as const;

export function Features() {
  const gridRef = useRef<HTMLDivElement>(null);
  const inView = useInView(gridRef, { once: true, margin: '-100px' });

  const anim = (i: number) => ({
    initial: { opacity: 0, scale: 0.95 },
    animate: inView ? { opacity: 1, scale: 1 } : {},
    transition: { delay: i * 0.15, duration: 0.8, ease },
  });

  return (
    <section className="relative min-h-screen bg-black px-4 md:px-6 py-16 md:py-24 overflow-hidden">
      <div className="bg-noise absolute inset-0 opacity-[0.15] pointer-events-none" />
      <div className="relative max-w-7xl mx-auto">
        <div className="mb-10 md:mb-14 flex flex-col items-center">
          <WordsPullUpMultiStyle
            className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-normal"
            style={{ color: '#E1E0CC' }}
            segments={[{ text: 'A tracker built around one plan.' }]}
          />
          <WordsPullUpMultiStyle
            className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-normal text-gray-500"
            delay={0.3}
            segments={[{ text: 'Show up daily. Finish the syllabus.' }]}
          />
        </div>

        <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-2 md:gap-1 lg:h-[480px]">
          <motion.div {...anim(0)} className="relative rounded-2xl overflow-hidden min-h-[360px] lg:min-h-0">
            <video className="absolute inset-0 w-full h-full object-cover" src={CARD_VIDEO} autoPlay loop muted playsInline />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <p className="absolute bottom-5 left-5 text-lg sm:text-xl" style={{ color: '#E1E0CC' }}>
              Your daily canvas.
            </p>
          </motion.div>

          {FEATURES.map((f, i) => (
            <motion.div key={f.n} {...anim(i + 1)} className="bg-[#212121] rounded-2xl p-5 sm:p-6 flex flex-col min-h-[360px] lg:min-h-0">
              <img src={f.icon} alt="" className="w-10 h-10 sm:w-12 sm:h-12 rounded object-cover" loading="lazy" />
              <h3 className="mt-6 text-lg sm:text-xl flex items-baseline gap-2" style={{ color: '#E1E0CC' }}>
                {f.title}
                <span className="text-xs text-gray-500">{f.n}</span>
              </h3>
              <ul className="mt-5 space-y-3">
                {f.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-gray-400">
                    <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                to={f.to}
                className="mt-auto pt-6 inline-flex items-center gap-1.5 text-sm text-primary hover:opacity-80 transition-opacity min-h-[40px]"
              >
                Learn more <ArrowRight className="w-4 h-4 -rotate-45" />
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
