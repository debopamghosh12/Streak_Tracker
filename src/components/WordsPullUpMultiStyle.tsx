import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

export interface Segment {
  text: string;
  className?: string;
}

interface Props {
  segments: Segment[];
  className?: string;
  style?: React.CSSProperties;
  align?: 'center' | 'left';
  as?: 'h1' | 'h2' | 'p';
  delay?: number;
}

/** Pull-up words across several styled segments, preserving per-word className. */
export function WordsPullUpMultiStyle({ segments, className = '', style, align = 'center', as = 'h2', delay = 0 }: Props) {
  const ref = useRef<HTMLHeadingElement>(null);
  const inView = useInView(ref, { once: true });
  const words = segments.flatMap((s) =>
    s.text
      .split(' ')
      .filter(Boolean)
      .map((w) => ({ w, className: s.className ?? '' })),
  );
  const Tag = as;

  return (
    <Tag
      ref={ref}
      className={`inline-flex flex-wrap ${align === 'center' ? 'justify-center text-center' : 'justify-start text-left'} ${className}`}
      style={style}
    >
      {words.map(({ w, className: wc }, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.1em]">
          <motion.span
            className={`inline-block ${wc}`}
            initial={{ y: 20, opacity: 0 }}
            animate={inView ? { y: 0, opacity: 1 } : {}}
            transition={{ delay: delay + i * 0.08, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            {w}
            {i < words.length - 1 && ' '}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}
