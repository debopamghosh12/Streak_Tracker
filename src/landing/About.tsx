import { motion, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { useRef } from 'react';
import { WordsPullUpMultiStyle } from '../components/WordsPullUpMultiStyle';

const BODY =
  'It started with three phases: foundations, then depth and real projects, then interview mode. And it keeps going after that, one planned week at a time. Every day has a plan, every week has a target, and every Sunday is a checkpoint. Miss a block, carry it forward. Miss a day, start again tomorrow.';

function AnimatedLetter({ char, index, total, progress }: { char: string; index: number; total: number; progress: MotionValue<number> }) {
  const charProgress = index / total;
  const opacity = useTransform(progress, [charProgress - 0.1, charProgress + 0.05], [0.2, 1]);
  return <motion.span style={{ opacity }}>{char}</motion.span>;
}

export function About() {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.8', 'end 0.2'] });
  const chars = BODY.split('');

  return (
    <section id="about" className="bg-black px-4 md:px-6 py-16 md:py-24">
      <div className="bg-[#101010] text-center max-w-6xl mx-auto rounded-2xl md:rounded-[2rem] px-6 py-16 sm:px-10 md:py-24">
        <p className="text-primary text-[10px] sm:text-xs mb-6 uppercase tracking-[0.2em]">The plan</p>
        <WordsPullUpMultiStyle
          className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl max-w-3xl mx-auto leading-[0.95] sm:leading-[0.9]"
          style={{ color: '#E1E0CC' }}
          segments={[
            { text: 'I am Debopam,', className: 'font-normal' },
            { text: 'a final-year engineer in the making.', className: 'italic font-serif' },
            { text: 'Ten hours a day of DSA, Spring Boot, CS fundamentals, AI and aptitude — one week at a time.', className: 'font-normal' },
          ]}
        />
        <p ref={ref} className="text-[#DEDBC8] text-xs sm:text-sm md:text-base max-w-2xl mx-auto mt-10 md:mt-14 leading-relaxed">
          {chars.map((c, i) => (
            <AnimatedLetter key={i} char={c} index={i} total={chars.length} progress={scrollYProgress} />
          ))}
        </p>
      </div>
    </section>
  );
}
