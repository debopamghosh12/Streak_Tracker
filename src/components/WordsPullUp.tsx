import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

interface Props {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  showAsterisk?: boolean;
  delay?: number;
  stagger?: number;
}

/** Each word slides up from y:20 with a staggered delay, once in view. */
export function WordsPullUp({ text, className = '', style, showAsterisk = false, delay = 0, stagger = 0.08 }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const words = text.split(' ');

  return (
    <span ref={ref} className={`inline-flex flex-wrap ${className}`} style={style}>
      {words.map((word, i) => {
        const isLast = i === words.length - 1;
        const withStar = showAsterisk && isLast && word.endsWith('a');
        return (
          <span key={i} className={`inline-block overflow-hidden pb-[0.08em] ${withStar ? 'pr-[0.32em]' : ''}`}>
            <motion.span
              className="relative inline-block"
              initial={{ y: 20, opacity: 0 }}
              animate={inView ? { y: 0, opacity: 1 } : {}}
              transition={{ delay: delay + i * stagger, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
              {withStar ? (
                <>
                  {word.slice(0, -1)}
                  <span className="relative inline-block">
                    a
                    <span className="absolute top-[0.65em] -right-[0.3em] text-[0.31em] leading-none">*</span>
                  </span>
                </>
              ) : (
                word
              )}
              {!isLast && ' '}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}
